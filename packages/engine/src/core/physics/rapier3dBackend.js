import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorldBase } from './worldBase.js';
import { Quat, Vec3 } from '../math.js';
import { RapierBodyMaterial, bodyDescFor, frictionAirToDamping } from './rapierShared.js';

/**
 * The Rapier 3D implementation of the physics contract.
 *
 * It is the 2D backend's sibling, not its replacement: a 2D game runs the
 * 2D solver and this one never loads. What they share — the tuning, the
 * material accessors, the `frictionAir` conversion — is in
 * `rapierShared.js`; what differs is here, and the differences are exactly
 * the four places a dimension shows.
 *
 * **Shapes.** `box`, `sphere`, `capsule` and `cylinder`. A box is sized by
 * `width`, `height` and `depth`; a sphere by its radius; a capsule by its
 * radius and tip-to-tip height, standing on the up axis.
 *
 * **Position** is `{x, y, z}` and **rotation** is a unit quaternion, the
 * form Rapier reads and writes. The 2D contract's scalar `angle` has no
 * meaning here: `rotation` and `setRotation` take its place, and
 * `renderRotation` blends with `Quat.slerp` where the 2D one blends along
 * the shorter arc of a scalar. Both are solving the same problem.
 *
 * **Up is +y and the unit is the metre.** This is the opposite of the 2D
 * world, where screen coordinates grow downward and a unit is a pixel, and
 * it is deliberate: every piece of 3D content — glTF, the modelling tools
 * that export it, HDR environments, Rapier's own documentation — is y-up
 * and metre-scale, so with this convention nothing is ever converted on
 * the way in. The two dimensions never share a world, a camera or a
 * renderer, so the difference is never seen by code; it is a line each in
 * the physics guide's units table. The one thing shared code may ask is
 * `world.up`, which both backends answer. Default gravity is Earth's.
 *
 * The tuning constants below are this backend's own. The 2D backend's are
 * in pixels and dividing them by 100 is not the same as fitting them: the
 * character offset, for one, is a fraction of the character's size.
 *
 * **Bounds** come from Rapier's own AABB rather than being derived by
 * hand. In 2D a rotated box's extent is two trig calls; in 3D it is a
 * quaternion applied to three half-extents, and the solver already has it.
 *
 * Not yet ported from the 2D backend, and the reason in each case is that
 * it needs a game to tune against rather than more code:
 *
 * - A character riding a kinematic platform. The 2D controller reconciles
 *   the platform's pending step delta out of the character's velocity so
 *   the ride never reads back as intent; the same trick works here but the
 *   numbers want a demo to fit them to.
 * - `snapshot`/`restore`, which the 2D world uses for `game.snapshot()`.
 */

/** Which way is up. See the note at the top of this file. */
const UP = Object.freeze({ x: 0, y: 1, z: 0 });

/** Earth, in m/s², along -y. */
const DEFAULT_GRAVITY = Object.freeze({ x: 0, y: -9.81, z: 0 });

/** Rapier's tolerances are written for metres, so the scale is 1. */
const LENGTH_UNIT = 1;

/**
 * Body density in kg/m³. Water, which puts a 0.4 m crate at 64 kg and a
 * person-sized capsule within a factor of a few of a person. Mass only
 * matters relatively, but game code sets absolute masses against this.
 */
const DEFAULT_DENSITY = 1000;

/**
 * Contact slack for the overlap queries, in m, so resting contact reads as
 * touching (see rapierShared.js). Twice CHARACTER_OFFSET, as in 2D: a
 * character at rest hovers in its offset, and a pad equal to it leaves the
 * floor on the wrong side of a float32 rounding.
 */
const CONTACT_PAD = 0.02;

/**
 * Gap a character controller keeps from what it touches, in m. Rapier wants
 * around 1-2% of the character's size; 1 cm suits a person-sized capsule.
 */
const CHARACTER_OFFSET = 0.01;

/** How far below its feet a character snaps back onto ground, in m. */
const CHARACTER_SNAP = 0.1;

/** The material defaults handed to RapierBodyMaterial. */
const MATERIAL_DEFAULTS = Object.freeze({ density: DEFAULT_DENSITY });

/**
 * A capsule is given as a radius and the full tip-to-tip height, so it
 * drops into the same prefab fields a box uses. Rapier wants the half-
 * length of the straight midsection, which is what is left once the two
 * caps are removed.
 */
function capsuleHalfHeight(radius, height) {
  return Math.max(0, (height - radius * 2) / 2);
}

/** A standalone (world-less) shape, for queries and pairwise tests. */
function makeShape(shape, size, grow = 0) {
  const half = { x: size.x / 2 + grow, y: size.y / 2 + grow, z: size.z / 2 + grow };
  if (shape === 'sphere') return new RAPIER.Ball(half.x);
  if (shape === 'capsule') return new RAPIER.Capsule(capsuleHalfHeight(size.x / 2, size.y) + grow, half.x);
  if (shape === 'cylinder') return new RAPIER.Cylinder(half.y, half.x);
  return new RAPIER.Cuboid(half.x, half.y, half.z);
}

function colliderDescFor(shape, size) {
  if (shape === 'sphere') return RAPIER.ColliderDesc.ball(size.x / 2);
  if (shape === 'capsule') {
    return RAPIER.ColliderDesc.capsule(capsuleHalfHeight(size.x / 2, size.y), size.x / 2);
  }
  if (shape === 'cylinder') return RAPIER.ColliderDesc.cylinder(size.y / 2, size.x / 2);
  return RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
}

export class RapierBody3D extends RapierBodyMaterial {
  constructor(world, spec) {
    super(world, RAPIER, spec, MATERIAL_DEFAULTS);
    this.shape = spec.shape;
    this.sizeVec = { x: spec.width, y: spec.height, z: spec.depth ?? spec.width };

    /** The transform half of the buffered state; see RapierBodyMaterial. */
    Object.assign(this.spec, {
      x: spec.x,
      y: spec.y,
      z: spec.z ?? 0,
      rotation: spec.rotation ? Quat.normalize(spec.rotation) : Quat.identity(),
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    this.charGrounded = false;
    this.groundBody = null;
    this.hasTarget = false;

    this.previous = {
      x: this.spec.x, y: this.spec.y, z: this.spec.z, rotation: { ...this.spec.rotation }
    };

    this.queryShape = makeShape(this.shape, this.sizeVec);
    this.paddedShape = makeShape(this.shape, this.sizeVec, CONTACT_PAD);
  }

  /** Build the rigid body + collider. Called by the world's `add()`. */
  materialize() {
    const s = this.spec;
    const bodyDesc = this.applyBodyMaterial(bodyDescFor(RAPIER, s.bodyType)
      .setTranslation(s.x, s.y, s.z)
      .setRotation(s.rotation)
      .setLinvel(s.velocity.x, s.velocity.y, s.velocity.z)
      .setAngvel(s.angularVelocity));

    const shapeDesc = this.applyColliderMaterial(colliderDescFor(this.shape, this.sizeVec));

    this.rigidBody = this.world.rWorld.createRigidBody(bodyDesc);
    this.collider = this.world.rWorld.createCollider(shapeDesc, this.rigidBody);
    this.applyEventFlag();

    if (s.bodyType === 'character') this.#createController();
    this.syncInterpolation();
  }

  #createController() {
    const c = this.world.rWorld.createCharacterController(CHARACTER_OFFSET);
    c.setUp(UP);
    c.setSlideEnabled(true);
    c.enableSnapToGround(CHARACTER_SNAP);
    // Walking into a crate shoves it, with this body's weight behind it.
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(this.mass);
    // The normal nudge is left at Rapier's default on purpose. The 2D
    // backend raises it to keep a character out of walls, and a sweep
    // against this solver found that problem absent and the cure
    // expensive: at the 2D value a walking character covered 70px of a
    // commanded 120. See CHARACTER_NUDGE in rapierBackend.js.
    this.controller = c;
  }

  /** Fold the live transform back into the spec and drop the solver's copy. */
  dematerialize() {
    if (!this.rigidBody) return;
    const t = this.rigidBody.translation();
    const r = this.rigidBody.rotation();
    const v = this.velocity;
    const w = this.angularVelocity;
    Object.assign(this.spec, {
      x: t.x, y: t.y, z: t.z,
      rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
      velocity: v,
      angularVelocity: w
    });
    if (this.controller) {
      this.world.rWorld.removeCharacterController(this.controller);
      this.controller = null;
    }
    this.rigidBody = null;
    this.collider = null;
  }

  get position() {
    if (!this.rigidBody) return { x: this.spec.x, y: this.spec.y, z: this.spec.z };
    const { x, y, z } = this.rigidBody.translation();
    return { x, y, z };
  }

  /** The rotation to use for logic. See `renderRotation` for drawing. */
  get rotation() {
    if (!this.rigidBody) return { ...this.spec.rotation };
    const { x, y, z, w } = this.rigidBody.rotation();
    return { x, y, z, w };
  }

  /** Blended between steps, like the 2D backend's `renderPosition`. */
  get renderPosition() {
    const current = this.position;
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return current;
    return {
      x: this.previous.x + (current.x - this.previous.x) * alpha,
      y: this.previous.y + (current.y - this.previous.y) * alpha,
      z: this.previous.z + (current.z - this.previous.z) * alpha
    };
  }

  get renderRotation() {
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return this.rotation;
    // Along the shorter arc, so a tumbling body never snaps through itself
    // for one frame. See Quat.slerp.
    return Quat.slerp(this.previous.rotation, this.rotation, alpha);
  }

  get renderBounds() {
    const bounds = this.bounds;
    const drawn = this.renderPosition;
    const current = this.position;
    const d = Vec3.subtract(drawn, current);
    return {
      min: Vec3.add(bounds.min, d),
      max: Vec3.add(bounds.max, d)
    };
  }

  syncInterpolation() {
    const { x, y, z } = this.position;
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.previous.rotation = this.rotation;
  }

  /** Whether an explicit target is pending, clearing it either way. */
  consumeTarget() {
    const had = this.hasTarget;
    this.hasTarget = false;
    return had;
  }

  /** @returns {{x: number, y: number, z: number}} m/s. */
  get velocity() {
    const type = this.spec.bodyType;
    if (!this.rigidBody || type === 'character' || type === 'kinematic') {
      return { ...this.spec.velocity };
    }
    const { x, y, z } = this.rigidBody.linvel();
    return { x, y, z };
  }

  get angularVelocity() {
    if (!this.rigidBody || this.spec.bodyType === 'character') {
      return { ...this.spec.angularVelocity };
    }
    const { x, y, z } = this.rigidBody.angvel();
    return { x, y, z };
  }

  get grounded() {
    return this.spec.bodyType === 'character' ? this.charGrounded : null;
  }

  /** Volume, for the density-derived mass in RapierBodyMaterial. */
  shapeMeasure() {
    const { x, y, z } = this.sizeVec;
    const r = x / 2;
    if (this.shape === 'sphere') return (4 / 3) * Math.PI * r ** 3;
    if (this.shape === 'cylinder') return Math.PI * r ** 2 * y;
    if (this.shape === 'capsule') {
      return Math.PI * r ** 2 * capsuleHalfHeight(r, y) * 2 + (4 / 3) * Math.PI * r ** 3;
    }
    return x * y * z;
  }

  /**
   * Tight AABB, rotation-aware, matching the contract. The 2D backend
   * derives this from two trig calls; three dimensions want the rotated
   * basis instead, but it is the same idea.
   */
  get bounds() {
    const p = this.position;
    const q = this.rotation;
    const { x: w, y: h, z: d } = this.sizeVec;
    const r = w / 2;
    let extent;

    if (this.shape === 'sphere') {
      extent = { x: r, y: r, z: r };
    } else if (this.shape === 'capsule' || this.shape === 'cylinder') {
      // The shape stands on its local y. Its AABB is the hull of that
      // segment, grown by the radius — all round for a capsule's spherical
      // caps, and by the circle's projection for a cylinder's flat ones.
      const axis = Quat.rotate(q, { x: 0, y: 1, z: 0 });
      const half = this.shape === 'capsule' ? capsuleHalfHeight(r, h) : h / 2;
      const grow = (a) => (this.shape === 'capsule' ? r : r * Math.sqrt(Math.max(0, 1 - a * a)));
      extent = {
        x: Math.abs(axis.x) * half + grow(axis.x),
        y: Math.abs(axis.y) * half + grow(axis.y),
        z: Math.abs(axis.z) * half + grow(axis.z)
      };
    } else {
      // Each world axis reaches as far as the box's three half-extents
      // project onto it.
      const ex = Quat.rotate(q, { x: w / 2, y: 0, z: 0 });
      const ey = Quat.rotate(q, { x: 0, y: h / 2, z: 0 });
      const ez = Quat.rotate(q, { x: 0, y: 0, z: d / 2 });
      extent = {
        x: Math.abs(ex.x) + Math.abs(ey.x) + Math.abs(ez.x),
        y: Math.abs(ex.y) + Math.abs(ey.y) + Math.abs(ez.y),
        z: Math.abs(ex.z) + Math.abs(ey.z) + Math.abs(ez.z)
      };
    }
    return { min: Vec3.subtract(p, extent), max: Vec3.add(p, extent) };
  }

  get size() {
    return { ...this.sizeVec };
  }

  setPosition(position) {
    const next = { x: position.x, y: position.y, z: position.z ?? this.spec.z };
    if (this.rigidBody) {
      this.rigidBody.setTranslation(next, true);
      // A teleport leaves the broad phase filed under the old place.
      this.world.unindex(this);
    }
    Object.assign(this.spec, next);
    this.previous.x = next.x;
    this.previous.y = next.y;
    this.previous.z = next.z;
  }

  setVelocity(velocity) {
    const next = { x: velocity.x, y: velocity.y, z: velocity.z ?? 0 };
    this.spec.velocity = next;
    if (this.rigidBody && this.spec.bodyType !== 'character') {
      this.rigidBody.setLinvel(next, true);
    }
  }

  setRotation(rotation) {
    const next = Quat.normalize(rotation);
    this.spec.rotation = next;
    if (this.rigidBody) {
      this.rigidBody.setRotation(next, true);
      this.world.unindex(this);
    }
    this.previous.rotation = next;
  }

  setAngularVelocity(omega) {
    const next = { x: omega.x ?? 0, y: omega.y ?? 0, z: omega.z ?? 0 };
    this.spec.angularVelocity = next;
    if (this.rigidBody) this.rigidBody.setAngvel(next, true);
  }

  /**
   * Place a kinematic body exactly, letting the solver derive the motion
   * so riders and contacts come along. See the 2D backend's notes.
   */
  setNextPosition(position) {
    const next = { x: position.x, y: position.y, z: position.z ?? this.spec.z };
    if (!this.rigidBody || this.spec.bodyType === 'dynamic') {
      this.setPosition(next);
      return;
    }
    this.rigidBody.setNextKinematicTranslation(next);
    this.hasTarget = true;
  }

  setNextRotation(rotation) {
    const next = Quat.normalize(rotation);
    if (!this.rigidBody || this.spec.bodyType === 'dynamic') {
      this.setRotation(next);
      return;
    }
    this.rigidBody.setNextKinematicRotation(next);
  }

  translate(delta) {
    const p = this.position;
    this.setPosition({ x: p.x + delta.x, y: p.y + delta.y, z: p.z + (delta.z ?? 0) });
  }

  /** Mass-dependent, in kg·m/s. Does nothing to static or kinematic. */
  applyImpulse(impulse) {
    const v = { x: impulse.x, y: impulse.y, z: impulse.z ?? 0 };
    if (this.spec.bodyType === 'character') {
      const mass = this.mass || 1;
      const current = this.spec.velocity;
      this.setVelocity({
        x: current.x + v.x / mass,
        y: current.y + v.y / mass,
        z: current.z + v.z / mass
      });
      return;
    }
    this.rigidBody?.applyImpulse(v, true);
  }
}

export class RapierPhysicsWorld3D extends PhysicsWorldBase {
  /**
   * @param {object} [options] - PhysicsWorldBase options, plus:
   * @param {{x: number, y: number, z: number}} [options.gravity] - m/s².
   *   Earth's, along -y, by default.
   */
  constructor(options = {}) {
    super(options);
    this.currentGravity = options.gravity ?? { ...DEFAULT_GRAVITY };
    this.rWorld = this.#createWorld();
    this.eventQueue = new RAPIER.EventQueue(true);
    this.added = new Set();
    this.characters = new Set();
    this.kinematics = new Set();
    this.byCollider = new Map();
    /** See the 2D backend: bodies the broad phase cannot be trusted about. */
    this.unindexed = new Set();
  }

  get dimensions() {
    return 3;
  }

  /** Which way is up: +y. See `RapierPhysicsWorld.up` and the file note. */
  get up() {
    return UP;
  }

  #createWorld() {
    const world = new RAPIER.World(this.currentGravity);
    world.integrationParameters.lengthUnit = LENGTH_UNIT;
    return world;
  }

  unindex(body) {
    if (this.added.has(body)) this.unindexed.add(body);
  }

  // === Bodies ===

  createBox({ x, y, z = 0, width, height, depth, ...options }) {
    return new RapierBody3D(this, { x, y, z, width, height, depth, shape: 'box', ...options });
  }

  createSphere({ x, y, z = 0, radius, ...options }) {
    return new RapierBody3D(this, {
      x, y, z, width: radius * 2, height: radius * 2, depth: radius * 2, shape: 'sphere', ...options
    });
  }

  /** @param {object} spec - `radius`, and `height` tip to tip. */
  createCapsule({ x, y, z = 0, radius, height, ...options }) {
    return new RapierBody3D(this, {
      x, y, z, width: radius * 2, height, depth: radius * 2, shape: 'capsule', ...options
    });
  }

  createCylinder({ x, y, z = 0, radius, height, ...options }) {
    return new RapierBody3D(this, {
      x, y, z, width: radius * 2, height, depth: radius * 2, shape: 'cylinder', ...options
    });
  }

  add(body) {
    body.materialize();
    this.added.add(body);
    if (body.bodyType === 'character') this.characters.add(body);
    if (body.bodyType === 'kinematic') this.kinematics.add(body);
    this.byCollider.set(body.collider.handle, body);
    this.unindexed.add(body);
    return body;
  }

  remove(body) {
    if (!this.added.has(body)) return;
    this.added.delete(body);
    this.characters.delete(body);
    this.kinematics.delete(body);
    this.unindexed.delete(body);
    if (body.collider) this.byCollider.delete(body.collider.handle);
    const rigidBody = body.rigidBody;
    body.dematerialize();
    if (rigidBody) this.rWorld.removeRigidBody(rigidBody);
  }

  get bodies() {
    return [...this.added];
  }

  bodyIterator() {
    return this.added;
  }

  setGravity({ x, y, z = 0 }) {
    this.currentGravity = { x, y, z };
    this.rWorld.gravity = this.currentGravity;
    for (const body of this.added) body.rigidBody?.wakeUp();
  }

  get gravity() {
    return { ...this.currentGravity };
  }

  clear() {
    for (const body of [...this.added]) this.remove(body);
  }

  reset() {
    this.clear();
    this.rWorld.free();
    this.eventQueue.free();
    this.rWorld = this.#createWorld();
    this.eventQueue = new RAPIER.EventQueue(true);
    this.accumulator = 0;
  }

  destroy() {
    this.rWorld.free();
    this.eventQueue.free();
    this.added.clear();
    this.characters.clear();
    this.kinematics.clear();
    this.byCollider.clear();
    this.unindexed.clear();
    this.handlers = { onStart: null, onEnd: null };
  }

  // === Stepping ===

  /**
   * One step of a character: integrate its intent the way the solver would
   * a dynamic body's, let the controller turn that into a collision-aware
   * move, and hand the result to the kinematic body. The 2D backend's
   * commentary applies; what is missing here is the kinematic-platform
   * ride, which needs a game to tune against.
   */
  #driveCharacter(body, dt) {
    const v = body.spec.velocity;
    const g = this.currentGravity;

    v.x += g.x * dt;
    v.y += g.y * dt;
    v.z += g.z * dt;
    const damping = 1 + frictionAirToDamping(body.spec.frictionAir) * dt;
    v.x /= damping;
    v.y /= damping;
    v.z /= damping;

    // Standing on ground, drop the speed into it: gravity must not
    // accumulate against a floor that keeps absorbing it. Up is +y, so
    // an upward (positive) velocity — a jump — passes untouched.
    if (body.charGrounded && v.y <= 0) v.y = 0;

    // The character's own collision groups filter what it may walk into,
    // as they filter what a dynamic body may hit; a mask of 0 is noclip.
    body.controller.computeColliderMovement(
      body.collider,
      { x: v.x * dt, y: v.y * dt, z: v.z * dt },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      (body.spec.category << 16) | body.spec.mask);
    const move = body.controller.computedMovement();
    const t = body.rigidBody.translation();
    body.rigidBody.setNextKinematicTranslation({
      x: t.x + move.x, y: t.y + move.y, z: t.z + move.z
    });

    body.charGrounded = body.controller.computedGrounded();
    body.groundBody = this.#characterGround(body);

    // Reconcile intent with what happened: a wall zeroes the velocity into
    // it, the ground absorbs the fall, free flight passes through.
    v.x = move.x / dt;
    v.y = move.y / dt;
    v.z = move.z / dt;
  }

  /** The body this character is standing on, if any. */
  #characterGround(body) {
    if (!body.charGrounded) return null;
    const controller = body.controller;
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const collision = controller.computedCollision(i);
      const collider = collision?.collider;
      if (!collider) continue;
      // normal1 is the obstacle's outward normal; ground points up (+y).
      if (collision.normal1.y > 0.5) {
        const other = this.byCollider.get(collider.handle);
        if (other) return other;
      }
    }
    // `surfacesWith` normals point from this body toward the other, so the
    // floor's points down.
    const surface = this.surfacesWith(body, (other) => !other.isSensor)
      .find(({ normal }) => normal.y < -0.5);
    return surface ? surface.body : null;
  }

  /** Carry kinematic bodies along their commanded velocity. */
  #driveKinematics(dt) {
    for (const body of this.kinematics) {
      if (body.consumeTarget()) continue;
      const v = body.spec.velocity;
      if (!v.x && !v.y && !v.z) continue;
      const t = body.rigidBody.translation();
      body.rigidBody.setNextKinematicTranslation({
        x: t.x + v.x * dt, y: t.y + v.y * dt, z: t.z + v.z * dt
      });
    }
  }

  stepOnce(dt) {
    this.rWorld.integrationParameters.dt = dt;
    this.#driveKinematics(dt);
    for (const body of this.characters) this.#driveCharacter(body, dt);

    this.rWorld.step(this.eventQueue);
    this.unindexed.clear();

    const { onStart, onEnd } = this.handlers;
    if (onStart || onEnd) {
      this.eventQueue.drainCollisionEvents((a, b, started) => {
        const first = this.byCollider.get(a);
        const second = this.byCollider.get(b);
        if (!first || !second) return;
        if (started) onStart?.(first, second);
        else onEnd?.(first, second);
      });
    }
  }

  /** Events are drained in `stepOnce`; nothing to bind up front. */
  bindHandlers() {}

  // === Queries ===

  /** Bodies whose padded shape could touch this one, plus the unindexed. */
  #eachCandidate(shape, position, rotation, visit) {
    this.rWorld.intersectionsWithShape(position, rotation, shape, (collider) => {
      const body = this.byCollider.get(collider.handle);
      if (body && !this.unindexed.has(body)) visit(body);
      return true;
    });
    for (const body of this.unindexed) visit(body);
  }

  /** The contact between two shapes, or null. */
  #contact(shape, position, rotation, other) {
    return shape.contactShape(
      position, rotation, other.queryShape, other.position, other.rotation, CONTACT_PAD);
  }

  /**
   * What this body touches, with the normal and gap per contact — how a
   * floor is told from a wall.
   */
  surfacesWith(body, filter) {
    const found = [];
    const position = body.position;
    const rotation = body.rotation;
    this.#eachCandidate(body.paddedShape, position, rotation, (other) => {
      if (other === body) return;
      if (filter && !filter(other)) return;
      const contact = this.#contact(body.queryShape, position, rotation, other);
      if (!contact || contact.distance > CONTACT_PAD) return;
      found.push({
        body: other,
        // normal1 points from this body toward the other.
        normal: { x: contact.normal1.x, y: contact.normal1.y, z: contact.normal1.z },
        gap: contact.distance
      });
    });
    return found;
  }

  /** What this body is touching. */
  contactsWith(body, filter) {
    return this.surfacesWith(body, filter).map(({ body: other }) => other);
  }

  /**
   * The same question for a shape that is not a body.
   * @param {object} shape - `{ x, y, z, width, height, depth }`, or
   *   `{ x, y, z, radius }` for a sphere.
   */
  overlaps(shape, filter) {
    const position = { x: shape.x, y: shape.y, z: shape.z ?? 0 };
    const rotation = shape.rotation ? Quat.normalize(shape.rotation) : Quat.identity();
    const size = shape.radius !== undefined
      ? { x: shape.radius * 2, y: shape.radius * 2, z: shape.radius * 2 }
      : { x: shape.width, y: shape.height, z: shape.depth ?? shape.width };
    const kind = shape.radius !== undefined ? 'sphere' : 'box';
    const query = makeShape(kind, size);
    const padded = makeShape(kind, size, CONTACT_PAD);

    const found = [];
    this.#eachCandidate(padded, position, rotation, (other) => {
      if (filter && !filter(other)) return;
      const contact = this.#contact(query, position, rotation, other);
      if (contact && contact.distance <= CONTACT_PAD) found.push(other);
    });
    return found;
  }

  /**
   * What is under this point. Exact, unlike the contact queries: no slack,
   * so a click just outside a body misses it.
   */
  queryPoint(point, filter) {
    const at = { x: point.x, y: point.y, z: point.z ?? 0 };
    const found = [];
    // A zero-radius ball is the cheapest broad-phase probe; the exact test
    // below is what actually decides.
    const probe = new RAPIER.Ball(0);
    this.#eachCandidate(probe, at, Quat.identity(), (other) => {
      if (filter && !filter(other)) return;
      if (other.queryShape.containsPoint(other.position, other.rotation, at)) found.push(other);
    });
    return found;
  }

  /** Every body crossing the segment, nearest first. */
  raycast(start, end, filter) {
    const from = { x: start.x, y: start.y, z: start.z ?? 0 };
    const to = { x: end.x, y: end.y, z: end.z ?? 0 };
    const delta = Vec3.subtract(to, from);
    const length = Vec3.length(delta);
    if (!length) return [];
    const direction = Vec3.scale(delta, 1 / length);

    const hits = [];
    const ray = new RAPIER.Ray(from, direction);
    this.rWorld.intersectionsWithRay(ray, length, true, (hit) => {
      const body = this.byCollider.get(hit.collider.handle);
      if (body && (!filter || filter(body))) {
        hits.push({
          body,
          point: Vec3.add(from, Vec3.scale(direction, hit.timeOfImpact)),
          normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
          distance: hit.timeOfImpact
        });
      }
      return true;
    });
    return hits.sort((a, b) => a.distance - b.distance);
  }
}

/** Compile the WASM module. Awaited by `initPhysics`. */
export function init() {
  return RAPIER.init();
}
