import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsWorldBase } from './worldBase.js';

/**
 * Rapier backend for the physics contract described in ./index.js.
 *
 * Rapier runs in WASM, which drives the two structural differences from the
 * Matter backend:
 *
 * - **It must be initialized**: `init()` below compiles the module; the
 *   factory's `initPhysics('rapier')` awaits it before any world exists.
 * - **Bodies cannot exist outside a world**, but the contract promises
 *   creation separate from insertion. A `RapierBody` therefore starts as a
 *   plain-JS spec that buffers every read and write, and only materializes
 *   into a rigid body + collider when `add()` is called. Game code cannot
 *   tell the difference.
 *
 * Units need no conversion: the contract's px/s and px/s² are Rapier's
 * units/s and units/s² with 1 unit = 1 px. `lengthUnit` tells the solver's
 * internal tolerances that "1" is a pixel, not a meter.
 */

/** Tells Rapier's solver tolerances that world units are pixels (~100/m). */
const LENGTH_UNIT = 100;

/**
 * Matter's default body density, kept so absolute masses match the old
 * backend (a 32x32 box weighs ~1.024). Mass only matters relatively, but
 * game code sets absolute masses (`setMass(1)`), so the scale must agree.
 */
const DEFAULT_DENSITY = 0.001;

/**
 * Contact slack for `contactsWith`, in px. The solver holds resting bodies a
 * hair apart, so an exact intersection test would flicker on the "standing on
 * the ground" case the query exists for. Matter's resting bodies overlap
 * slightly, so this also matches the old backend's behaviour.
 */
const CONTACT_PAD = 1;

/**
 * Matter damps velocity by `frictionAir` per 60Hz step; Rapier damps by
 * `1 / (1 + dt * linearDamping)` per step. Equating the per-step multipliers
 * gives the conversion, so drag feels the same across backends.
 */
function frictionAirToDamping(frictionAir) {
  if (!frictionAir) return 0;
  return (frictionAir * 60) / (1 - frictionAir);
}

function dampingToFrictionAir(damping) {
  if (!damping) return 0;
  return damping / (60 + damping);
}

/**
 * A rigid body over Rapier, implementing the same surface as the Matter
 * backend's PhysicsBody. Before `add()` it is pure bookkeeping (`this.spec`);
 * after, reads and writes go to the live rigid body and collider.
 */
export class RapierBody {
  constructor(world, spec) {
    this.world = world;
    this.shape = spec.shape;
    this.width = spec.width;
    this.height = spec.height;

    /** Buffered state; authoritative whenever `rigidBody` is null. */
    this.spec = {
      x: spec.x,
      y: spec.y,
      angle: 0,
      velocity: { x: 0, y: 0 },
      isStatic: spec.isStatic ?? false,
      isSensor: spec.isSensor ?? false,
      friction: spec.friction ?? 0.1,
      frictionStatic: spec.frictionStatic ?? 0.5,
      frictionAir: spec.frictionAir ?? 0.01,
      restitution: spec.restitution ?? 0,
      density: spec.density ?? DEFAULT_DENSITY,
      category: spec.category ?? 0x0001,
      mask: spec.mask ?? 0xFFFF,
      group: spec.group ?? 0,
      mass: null,
      bullet: false
    };

    /** @type {import('@dimforge/rapier2d-compat').RigidBody|null} */
    this.rigidBody = null;
    /** @type {import('@dimforge/rapier2d-compat').Collider|null} */
    this.collider = null;

    /** Interpolation baseline; see the Matter backend's PhysicsBody. */
    this.previous = { x: spec.x, y: spec.y, angle: 0 };

    /** @type {import('../entity.js').Entity|null} */
    this.entity = null;

    /**
     * This body's shape as a standalone query object (plain JS descriptor,
     * no WASM resource to free). The world's queries test it pairwise against
     * other bodies, which keeps them geometrically fresh — Rapier's scene
     * queries only see positions as of the last step.
     */
    this.queryShape = this.shape === 'circle'
      ? new RAPIER.Ball(this.width / 2)
      : new RAPIER.Cuboid(this.width / 2, this.height / 2);
  }

  /** Build the rigid body + collider. Called by the world's `add()`. */
  materialize() {
    const s = this.spec;
    const bodyDesc = (s.isStatic ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      // Matter ships with sleeping disabled and the games assume it: a world
      // change (setGravity) must affect every body, not just awake ones.
      .setCanSleep(false)
      .setTranslation(s.x, s.y)
      .setRotation(s.angle)
      .setLinvel(s.velocity.x, s.velocity.y)
      .setLinearDamping(frictionAirToDamping(s.frictionAir))
      .setCcdEnabled(s.bullet);

    const shapeDesc = this.shape === 'circle'
      ? RAPIER.ColliderDesc.ball(this.width / 2)
      : RAPIER.ColliderDesc.cuboid(this.width / 2, this.height / 2);

    shapeDesc
      .setSensor(s.isSensor)
      .setFriction(s.friction)
      .setRestitution(s.restitution)
      .setDensity(s.density)
      .setCollisionGroups(((s.category & 0xFFFF) << 16) | (s.mask & 0xFFFF))
      // Matter resolves pairs with min(friction) and max(restitution);
      // Rapier's default is averaging, which would soften every bounce.
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (s.mass !== null) shapeDesc.setMass(s.mass);

    this.rigidBody = this.world.rWorld.createRigidBody(bodyDesc);
    this.collider = this.world.rWorld.createCollider(shapeDesc, this.rigidBody);
    this.syncInterpolation();
  }

  /** Fold live state back into the spec and detach. Called by `remove()`. */
  dematerialize() {
    const s = this.spec;
    const t = this.rigidBody.translation();
    const v = this.rigidBody.linvel();
    s.x = t.x;
    s.y = t.y;
    s.angle = this.rigidBody.rotation();
    s.velocity = { x: v.x, y: v.y };
    this.rigidBody = null;
    this.collider = null;
  }

  get position() {
    if (!this.rigidBody) return { x: this.spec.x, y: this.spec.y };
    return this.rigidBody.translation();
  }

  get renderPosition() {
    const alpha = this.world?.interpolation ?? 1;
    const current = this.position;
    if (alpha >= 1) return current;

    return {
      x: this.previous.x + (current.x - this.previous.x) * alpha,
      y: this.previous.y + (current.y - this.previous.y) * alpha
    };
  }

  get renderBounds() {
    const bounds = this.bounds;
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return bounds;

    const current = this.position;
    const drawn = this.renderPosition;
    const dx = drawn.x - current.x;
    const dy = drawn.y - current.y;
    return {
      min: { x: bounds.min.x + dx, y: bounds.min.y + dy },
      max: { x: bounds.max.x + dx, y: bounds.max.y + dy }
    };
  }

  get renderAngle() {
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return this.angle;

    return this.previous.angle + (this.angle - this.previous.angle) * alpha;
  }

  syncInterpolation() {
    const { x, y } = this.position;
    this.previous.x = x;
    this.previous.y = y;
    this.previous.angle = this.angle;
  }

  /** @returns {{x: number, y: number}} px/s. */
  get velocity() {
    if (!this.rigidBody) return { ...this.spec.velocity };
    const { x, y } = this.rigidBody.linvel();
    return { x, y };
  }

  get angle() {
    return this.rigidBody ? this.rigidBody.rotation() : this.spec.angle;
  }

  /** Tight AABB from the shape and rotation, matching the contract. */
  get bounds() {
    const { x, y } = this.position;
    let ex;
    let ey;
    if (this.shape === 'circle') {
      ex = this.width / 2;
      ey = ex;
    } else {
      const cos = Math.abs(Math.cos(this.angle));
      const sin = Math.abs(Math.sin(this.angle));
      ex = cos * (this.width / 2) + sin * (this.height / 2);
      ey = sin * (this.width / 2) + cos * (this.height / 2);
    }
    return { min: { x: x - ex, y: y - ey }, max: { x: x + ex, y: y + ey } };
  }

  get size() {
    return { x: this.width, y: this.height };
  }

  get isStatic() {
    if (!this.rigidBody) return this.spec.isStatic;
    return this.rigidBody.isFixed();
  }

  set isStatic(value) {
    this.spec.isStatic = value;
    if (this.rigidBody) {
      this.rigidBody.setBodyType(
        value ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
    }
  }

  get isSensor() {
    return this.collider ? this.collider.isSensor() : this.spec.isSensor;
  }

  set isSensor(value) {
    this.spec.isSensor = value;
    if (this.collider) this.collider.setSensor(value);
  }

  get friction() {
    return this.collider ? this.collider.friction() : this.spec.friction;
  }

  set friction(value) {
    this.spec.friction = value;
    if (this.collider) this.collider.setFriction(value);
  }

  /** Advisory — Rapier has one friction coefficient; stored but unused. */
  get frictionStatic() {
    return this.spec.frictionStatic;
  }

  set frictionStatic(value) {
    this.spec.frictionStatic = value;
  }

  get frictionAir() {
    if (!this.rigidBody) return this.spec.frictionAir;
    return dampingToFrictionAir(this.rigidBody.linearDamping());
  }

  set frictionAir(value) {
    this.spec.frictionAir = value;
    if (this.rigidBody) this.rigidBody.setLinearDamping(frictionAirToDamping(value));
  }

  get restitution() {
    return this.collider ? this.collider.restitution() : this.spec.restitution;
  }

  set restitution(value) {
    this.spec.restitution = value;
    if (this.collider) this.collider.setRestitution(value);
  }

  /** Continuous collision detection: fast bodies stop instead of tunneling. */
  get bullet() {
    return this.rigidBody ? this.rigidBody.isCcdEnabled() : this.spec.bullet;
  }

  set bullet(value) {
    this.spec.bullet = value;
    if (this.rigidBody) this.rigidBody.enableCcd(value);
  }

  get collisionFilter() {
    const { category, mask, group } = this.spec;
    return { category, mask, group };
  }

  setCollisionFilter({ category, mask, group } = {}) {
    if (category !== undefined) this.spec.category = category;
    if (mask !== undefined) this.spec.mask = mask;
    if (group !== undefined) this.spec.group = group;
    if (this.collider) {
      this.collider.setCollisionGroups(
        ((this.spec.category & 0xFFFF) << 16) | (this.spec.mask & 0xFFFF));
    }
  }

  setPosition(position) {
    if (this.rigidBody) {
      this.rigidBody.setTranslation(position, true);
    } else {
      this.spec.x = position.x;
      this.spec.y = position.y;
    }
    this.syncInterpolation();
  }

  /** @param {{x: number, y: number}} velocity - px/s. */
  setVelocity(velocity) {
    if (this.rigidBody) {
      this.rigidBody.setLinvel(velocity, true);
    } else {
      this.spec.velocity = { x: velocity.x, y: velocity.y };
    }
  }

  setAngle(angle) {
    if (this.rigidBody) {
      this.rigidBody.setRotation(angle, true);
    } else {
      this.spec.angle = angle;
    }
    this.syncInterpolation();
  }

  setMass(mass) {
    this.spec.mass = mass;
    if (this.collider) this.collider.setMass(mass);
  }

  translate(delta) {
    const { x, y } = this.position;
    this.setPosition({ x: x + delta.x, y: y + delta.y });
  }

  /** Instantaneous velocity change in px/s; inert on static bodies. */
  applyImpulse(delta) {
    if (this.isStatic) return;
    const { x, y } = this.velocity;
    this.setVelocity({ x: x + delta.x, y: y + delta.y });
  }
}

export class RapierPhysicsWorld extends PhysicsWorldBase {
  /**
   * @param {object} [options] - PhysicsWorldBase options, plus:
   * @param {{x: number, y: number}} [options.gravity] - px/s².
   */
  constructor(options = {}) {
    super(options);
    this.currentGravity = options.gravity ?? { x: 0, y: 1000 };
    this.rWorld = this.#createWorld();
    this.eventQueue = new RAPIER.EventQueue(true);
    /** Bodies currently simulated (materialized). */
    this.added = new Set();
    /** Collider handle -> RapierBody, for events and query results. */
    this.byCollider = new Map();
  }

  #createWorld() {
    const world = new RAPIER.World(this.currentGravity);
    world.integrationParameters.lengthUnit = LENGTH_UNIT;
    return world;
  }

  // === Bodies ===

  createBox({ x, y, width, height, ...options }) {
    return new RapierBody(this, { x, y, width, height, shape: 'box', ...options });
  }

  createCircle({ x, y, radius, ...options }) {
    return new RapierBody(this, {
      x, y, width: radius * 2, height: radius * 2, shape: 'circle', ...options
    });
  }

  add(body) {
    body.materialize();
    this.added.add(body);
    this.byCollider.set(body.collider.handle, body);
    return body;
  }

  remove(body) {
    if (!this.added.has(body)) return body;
    this.byCollider.delete(body.collider.handle);
    this.added.delete(body);
    const rigidBody = body.rigidBody;
    body.dematerialize();
    this.rWorld.removeRigidBody(rigidBody);
    return body;
  }

  get bodies() {
    return [...this.added];
  }

  // === World state ===

  setGravity({ x, y }) {
    this.currentGravity = { x, y };
    this.rWorld.gravity.x = x;
    this.rWorld.gravity.y = y;
  }

  get gravity() {
    return { ...this.currentGravity };
  }

  clear() {
    for (const body of [...this.added]) this.remove(body);
  }

  /** No cross-scene collision cache survives body removal here. */
  clearContacts() {}

  reset() {
    this.rWorld.free();
    this.eventQueue.free();
    this.rWorld = this.#createWorld();
    this.eventQueue = new RAPIER.EventQueue(true);
    this.added.clear();
    this.byCollider.clear();
    this.accumulator = 0;
  }

  destroy() {
    this.rWorld.free();
    this.eventQueue.free();
    this.added.clear();
    this.byCollider.clear();
    this.handlers = { onStart: null, onEnd: null };
  }

  // === Stepping ===

  stepOnce(dt) {
    this.rWorld.timestep = dt;
    this.rWorld.step(this.eventQueue);

    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      const a = this.byCollider.get(handle1);
      const b = this.byCollider.get(handle2);
      if (!a || !b) return;
      const handler = started ? this.handlers.onStart : this.handlers.onEnd;
      handler?.(a, b);
    });
  }

  /** Events are polled from the queue each step; nothing to attach. */
  bindHandlers() {}

  // === Queries ===

  // Both queries test shapes pairwise at the bodies' *current* transforms
  // instead of using Rapier's scene queries, which are only refreshed by
  // step() and so miss bodies that were just added or teleported — the
  // attack hit-circle does exactly that (setPosition, then query, same
  // frame). Linear in body count, which these games keep in the dozens.

  /**
   * Bodies touching `body`, within CONTACT_PAD slack so resting contact
   * (which the solver holds a hair apart) reliably counts.
   */
  contactsWith(body, filter) {
    const { position, angle, queryShape } = body;
    const results = [];
    for (const other of this.added) {
      if (other === body) continue;
      if (filter && !filter(other)) continue;
      const contact = queryShape.contactShape(
        position, angle, other.queryShape, other.position, other.angle, CONTACT_PAD);
      if (contact !== null) results.push(other);
    }
    return results;
  }

  raycast(start, end, filter) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return [];

    const ray = new RAPIER.Ray(start, { x: dx / length, y: dy / length });
    const hits = [];
    for (const body of this.added) {
      if (filter && !filter(body)) continue;
      if (body.queryShape.intersectsRay(ray, body.position, body.angle, length)) {
        hits.push(body);
      }
    }
    return hits;
  }
}

/** Compile the WASM module. Called once by `initPhysics('rapier')`. */
export async function init() {
  await RAPIER.init();
}
