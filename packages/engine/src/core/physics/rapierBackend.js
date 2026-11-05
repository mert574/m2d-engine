import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsWorldBase } from './worldBase.js';
import {
  LENGTH_UNIT, CONTACT_PAD, CHARACTER_OFFSET, CHARACTER_SNAP,
  RapierBodyMaterial, bodyDescFor, frictionAirToDamping
} from './rapierShared.js';

/**
 * How hard the controller pushes a character back out along contact
 * normals, in px. Rapier's default (1e-4) assumes meters; at pixel scale it
 * is nothing, so a character pressed against a wall crept ~1px inside it —
 * and once flat against a face, the slide around that wall's corner
 * deadlocks (a face contact has no tangential escape). Tuned by sweep: 0.02
 * still deadlocks the corner, while 0.1 holds the character so far off the
 * ground that `grounded` detection loses it and it hangs hovering. 0.05
 * does both.
 *
 * This is a 2D number. The same sweep against the 3D solver found neither
 * problem to fix and a real cost: at 0.05 a walking character covered 70px
 * of a commanded 120, because the nudge eats part of every step's
 * horizontal move and the controller's velocity reconciliation feeds that
 * loss back in. The 3D backend leaves Rapier's default alone.
 */
/** What a character that collides with nothing falls under: see #driveCharacter. */
const NO_GRAVITY = Object.freeze({ x: 0, y: 0 });

const CHARACTER_NUDGE = 0.05;

/** Which way is up; see `RapierPhysicsWorld.up`. */
const UP = Object.freeze({ x: 0, y: -1 });

/**
 * The Rapier 2D implementation of the physics contract described in
 * ./index.js.
 *
 * Rapier runs in WASM, which drives two structural quirks the contract has
 * to absorb:
 *
 * - **It must be initialized**: `init()` below compiles the module;
 *   `initPhysics()` awaits it before any world exists.
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

/**
 * The equivalent of `angle` nearest zero, in (-π, π].
 *
 * Rotations come back wrapped to that range, so a body spinning past π
 * reports a ~2π jump. Interpolating that difference raw sends the drawn
 * angle the long way round — a tumbling sprite snaps flat for one frame
 * every revolution.
 */
function shortestTurn(angle) {
  const turn = (angle + Math.PI) % (Math.PI * 2);
  return (turn < 0 ? turn + Math.PI * 2 : turn) - Math.PI;
}

/**
 * A capsule is given as the box that bounds it: `width` is the diameter and
 * `height` the full tip-to-tip length, so it drops into the same prefab
 * fields a box uses. Rapier wants the radius and the half-length of the
 * straight midsection, which is what is left once the two caps are removed.
 */
function capsuleHalfHeight(width, height) {
  return Math.max(0, (height - width) / 2);
}

/** A standalone (world-less) shape, for queries and pairwise tests. */
function makeShape(shape, width, height, grow = 0) {
  if (shape === 'circle') return new RAPIER.Ball(width / 2 + grow);
  if (shape === 'capsule') {
    return new RAPIER.Capsule(capsuleHalfHeight(width, height), width / 2 + grow);
  }
  return new RAPIER.Cuboid(width / 2 + grow, height / 2 + grow);
}

function colliderDescFor(shape, width, height) {
  if (shape === 'circle') return RAPIER.ColliderDesc.ball(width / 2);
  if (shape === 'capsule') {
    return RAPIER.ColliderDesc.capsule(capsuleHalfHeight(width, height), width / 2);
  }
  return RAPIER.ColliderDesc.cuboid(width / 2, height / 2);
}

/**
 * A rigid body over Rapier, implementing the contract's PhysicsBody surface.
 * Before `add()` it is pure bookkeeping (`this.spec`); after, reads and
 * writes go to the live rigid body and collider.
 */
export class RapierBody extends RapierBodyMaterial {
  constructor(world, spec) {
    super(world, RAPIER, spec);
    this.shape = spec.shape;
    this.width = spec.width;
    this.height = spec.height;

    /** The transform half of the buffered state; see RapierBodyMaterial. */
    Object.assign(this.spec, {
      x: spec.x,
      y: spec.y,
      angle: spec.angle ?? 0,
      velocity: { x: 0, y: 0 },
      angularVelocity: 0
    });

    /**
     * Character-only state. The controller computes each step's collision-
     * aware movement; `spec.velocity` stays the live intent (what game code
     * set, reconciled against what actually happened) because a kinematic
     * rigid body's own linvel is derived, not driven. `groundBody` is what
     * the character stood on after the last step, kept so a moving platform
     * underfoot can carry it.
     */
    this.charGrounded = false;
    this.groundBody = null;

    /** Set by `setNextPosition`; consumed by the world's next step. */
    this.hasTarget = false;

    /**
     * A drawn transform supplied from outside, in place of interpolating
     * between solver steps: `{ x, y, angle }`, or null. A replica's
     * interpolator writes it; nothing else does. See net/interpolation.js.
     * @type {{x: number, y: number, angle: number}|null}
     */
    this.renderOverride = null;
    /** Interpolation baseline; see `renderPosition`. */
    this.previous = { x: spec.x, y: spec.y, angle: spec.angle ?? 0 };

    /**
     * This body's shape as a standalone query object (a plain JS descriptor,
     * no WASM resource to free), plus the same shape grown by CONTACT_PAD.
     * The padded one is the broad-phase filter for overlap queries: growing
     * a box by a square margin is a superset of the rounded margin the exact
     * test uses, so it narrows candidates without ever dropping a real one.
     */
    this.queryShape = makeShape(this.shape, this.width, this.height);
    this.paddedShape = makeShape(this.shape, this.width, this.height, CONTACT_PAD);
  }

  /** Build the rigid body + collider. Called by the world's `add()`. */
  materialize() {
    const s = this.spec;
    const bodyDesc = this.applyBodyMaterial(bodyDescFor(RAPIER, s.bodyType)
      .setTranslation(s.x, s.y)
      .setRotation(s.angle)
      .setLinvel(s.velocity.x, s.velocity.y)
      .setAngvel(s.angularVelocity));

    const shapeDesc = this.applyColliderMaterial(
      colliderDescFor(this.shape, this.width, this.height));

    this.rigidBody = this.world.rWorld.createRigidBody(bodyDesc);
    this.collider = this.world.rWorld.createCollider(shapeDesc, this.rigidBody);
    this.applyEventFlag();

    if (s.bodyType === 'character') this.#createController();

    this.syncInterpolation();
  }

  #createController() {
    const c = this.world.rWorld.createCharacterController(CHARACTER_OFFSET);
    // Screen coordinates grow downward, so "up" — the direction that makes
    // a surface count as ground — is -y. Without this, ceilings ground.
    c.setUp(UP);
    c.setSlideEnabled(true);
    c.setNormalNudgeFactor(CHARACTER_NUDGE);
    c.enableSnapToGround(CHARACTER_SNAP);
    // Walking into a crate shoves it, with this body's weight behind it.
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(this.mass);
    this.controller = c;
  }

  /**
   * This body's own state, beside what Rapier keeps: the buffered spec
   * (a character's live intent velocity among it), the interpolation
   * baseline and the character's ground. For `RapierPhysicsWorld.snapshot`.
   */
  saveState() {
    const s = this.spec;
    return {
      spec: { ...s, velocity: { ...s.velocity } },
      previous: { ...this.previous },
      charGrounded: this.charGrounded,
      groundBody: this.groundBody,
      hasTarget: this.hasTarget,
      rigidBody: this.rigidBody?.handle ?? null,
      collider: this.collider?.handle ?? null
    };
  }

  /**
   * Take back saved state and, if the body was simulated when it was
   * saved, reattach to its rigid body and collider in a world restored
   * from the same snapshot, where they keep their handles.
   */
  loadState(state) {
    this.spec = { ...state.spec, velocity: { ...state.spec.velocity } };
    this.previous = { ...state.previous };
    this.charGrounded = state.charGrounded;
    this.groundBody = state.groundBody;
    this.hasTarget = state.hasTarget;
    this.controller = null;
    if (state.rigidBody === null) {
      this.rigidBody = null;
      this.collider = null;
      return;
    }
    this.rigidBody = this.world.rWorld.getRigidBody(state.rigidBody);
    this.collider = this.world.rWorld.getCollider(state.collider);
    if (this.spec.bodyType === 'character') this.#createController();
  }

  /** Fold live state back into the spec and detach. Called by `remove()`. */
  dematerialize() {
    const s = this.spec;
    const t = this.rigidBody.translation();
    s.x = t.x;
    s.y = t.y;
    s.angle = this.rigidBody.rotation();
    if (s.bodyType !== 'character') s.angularVelocity = this.rigidBody.angvel();
    // A character's velocity is its intent, already live in the spec; a
    // solver-driven body's lives in the rigid body.
    if (s.bodyType !== 'character') {
      const v = this.rigidBody.linvel();
      s.velocity = { x: v.x, y: v.y };
    }
    if (this.controller) {
      this.world.rWorld.removeCharacterController(this.controller);
      this.controller = null;
    }
    this.charGrounded = false;
    this.groundBody = null;
    this.rigidBody = null;
    this.collider = null;
  }

  get position() {
    if (!this.rigidBody) return { x: this.spec.x, y: this.spec.y };
    return this.rigidBody.translation();
  }

  get renderPosition() {
    // A replica draws a world it never steps: its transforms come from the
    // server, interpolated between states rather than between solver steps.
    // See net/interpolation.js.
    const override = this.renderOverride;
    if (override) return { x: override.x, y: override.y };

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
    const override = this.renderOverride;
    const alpha = this.world?.interpolation ?? 1;
    if (!override && alpha >= 1) return bounds;

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
    const override = this.renderOverride;
    if (override) return override.angle;

    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return this.angle;

    // Blend along the shorter arc, so crossing the ±π seam reads as
    // continuing to turn rather than snapping back through zero.
    return this.previous.angle + shortestTurn(this.angle - this.previous.angle) * alpha;
  }

  syncInterpolation() {
    const { x, y } = this.position;
    this.previous.x = x;
    this.previous.y = y;
    this.previous.angle = this.angle;
  }

  /** Whether an explicit target is pending, clearing it either way. */
  consumeTarget() {
    const had = this.hasTarget;
    this.hasTarget = false;
    return had;
  }

  /** @returns {{x: number, y: number}} px/s. */
  get velocity() {
    // Character and kinematic velocity is commanded, not solved: the spec
    // holds what game code asked for, which is also what it should read
    // back — including before the first step has derived anything.
    const type = this.spec.bodyType;
    if (!this.rigidBody || type === 'character' || type === 'kinematic') {
      return { ...this.spec.velocity };
    }
    const { x, y } = this.rigidBody.linvel();
    return { x, y };
  }

  /**
   * Whether this character stood on ground after the last step; `null` for
   * everything that is not a character. Grounding for other bodies is a
   * geometric question — see `surfacesWith`.
   */
  get grounded() {
    return this.spec.bodyType === 'character' ? this.charGrounded : null;
  }

  get angle() {
    return this.rigidBody ? this.rigidBody.rotation() : this.spec.angle;
  }

  /** Area, for the density-derived mass in RapierBodyMaterial. */
  shapeMeasure() {
    return this.shape === 'circle'
      ? Math.PI * (this.width / 2) ** 2
      : this.width * this.height;
  }

  /** Tight AABB from the shape and rotation, matching the contract. */
  get bounds() {
    const { x, y } = this.position;
    let ex;
    let ey;
    if (this.shape === 'circle') {
      ex = this.width / 2;
      ey = ex;
    } else if (this.shape === 'capsule') {
      // The hull of the two cap circles: their centres sit a half-length
      // along the body's local +y, and each adds the radius all round.
      const r = this.width / 2;
      const hh = capsuleHalfHeight(this.width, this.height);
      ex = Math.abs(hh * Math.sin(this.angle)) + r;
      ey = Math.abs(hh * Math.cos(this.angle)) + r;
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

  setPosition(position) {
    if (this.rigidBody) {
      this.rigidBody.setTranslation(position, true);
      this.world.unindex(this);
    } else {
      this.spec.x = position.x;
      this.spec.y = position.y;
    }
    this.syncInterpolation();
  }

  /**
   * @param {{x: number, y: number}} velocity - px/s. On a kinematic body
   *   this is a cruise velocity the world integrates each step — the
   *   frame-rate-independent way to move a platform; see `setNextPosition`
   *   for exact placement.
   */
  setVelocity(velocity) {
    const type = this.spec.bodyType;
    if (this.rigidBody && type !== 'character' && type !== 'kinematic') {
      this.rigidBody.setLinvel(velocity, true);
    } else {
      this.spec.velocity = { x: velocity.x, y: velocity.y };
    }
  }

  /**
   * Spin, rad/s. On a dynamic body the solver keeps integrating it, so
   * contacts still knock the heading around between writes — which is what
   * a steering model that sets it every tick wants.
   * @type {number}
   */
  get angularVelocity() {
    if (!this.rigidBody || this.spec.bodyType === 'character') {
      return this.spec.angularVelocity;
    }
    return this.rigidBody.angvel();
  }

  /** @param {number} omega - rad/s. */
  setAngularVelocity(omega) {
    if (this.rigidBody && this.spec.bodyType !== 'character') {
      this.rigidBody.setAngvel(omega, true);
    } else {
      this.spec.angularVelocity = omega;
    }
  }

  setAngle(angle) {
    if (this.rigidBody) {
      this.rigidBody.setRotation(angle, true);
      this.world.unindex(this);
    } else {
      this.spec.angle = angle;
    }
    this.syncInterpolation();
  }

  /**
   * Where a kinematic body should be by the end of the next step.
   *
   * Unlike `setPosition`, which teleports, this lets the solver derive the
   * body's velocity from the move, so contacts resolve properly: riders are
   * carried along by friction and anything in the way is pushed rather than
   * overlapped. No effect on static or dynamic bodies.
   * @param {{x: number, y: number}} position
   */
  setNextPosition(position) {
    if (this.spec.bodyType !== 'kinematic') return;
    if (this.rigidBody) {
      this.rigidBody.setNextKinematicTranslation(position);
      this.hasTarget = true;
    } else {
      this.spec.x = position.x;
      this.spec.y = position.y;
    }
  }

  /** Rotational counterpart of `setNextPosition`. */
  setNextAngle(angle) {
    if (this.spec.bodyType !== 'kinematic') return;
    if (this.rigidBody) {
      this.rigidBody.setNextKinematicRotation(angle);
    } else {
      this.spec.angle = angle;
    }
  }

  translate(delta) {
    const { x, y } = this.position;
    this.setPosition({ x: x + delta.x, y: y + delta.y });
  }

  /**
   * Apply an impulse, in px·mass/s. Mass-dependent, so the same hit shoves a
   * light body further than a heavy one and knockback reads as weight;
   * multiply by `body.mass` for a flat velocity change instead. Works on
   * dynamic and character bodies; inert on static and kinematic ones.
   */
  applyImpulse(impulse) {
    const type = this.spec.bodyType;
    if (type !== 'dynamic' && type !== 'character') return;
    if (this.rigidBody && type === 'dynamic') {
      this.rigidBody.applyImpulse(impulse, true);
    } else {
      const m = this.mass;
      this.spec.velocity = {
        x: this.spec.velocity.x + impulse.x / m,
        y: this.spec.velocity.y + impulse.y / m
      };
    }
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
    /** Character bodies, driven through their controllers in `stepOnce`. */
    this.characters = new Set();
    /** Kinematic bodies, which wake their riders before each step. */
    this.kinematics = new Set();
    /** Collider handle -> RapierBody, for events and query results. */
    this.byCollider = new Map();

    /**
     * Bodies the broad phase cannot be trusted about: those added, or moved
     * by game code, since the last step. `step()` is what (re)indexes a
     * body, so until the next one a newly added body is missing from the
     * structure entirely and a teleported one is still filed under where it
     * used to be.
     *
     * Queries skip these in the broad-phase results and test them directly
     * instead, which keeps the contract's promise that a body can be added
     * or moved and queried in the same frame. Solver-driven motion does not
     * land here, so the set is empty in the steady state and queries stay
     * proportional to what they actually hit.
     *
     * One blind spot this cannot cover: Rapier's *own* internal queries —
     * the character controller's collision sweeps — read the same index, so
     * a character cannot see a body until the step after it was added. In
     * practice that is one step of exposure for things spawned within one
     * step's travel of a character; spawn with clearance.
     */
    this.unindexed = new Set();
  }

  get dimensions() {
    return 2;
  }

  /**
   * Which way is up. Screen coordinates grow downward, so in two
   * dimensions it is -y. Shared code that needs to know (`Entity.groundBody`)
   * asks the world rather than assuming an axis.
   */
  get up() {
    return UP;
  }

  #createWorld() {
    const world = new RAPIER.World(this.currentGravity);
    world.integrationParameters.lengthUnit = LENGTH_UNIT;
    return world;
  }

  /** Called by a body that teleported, so queries stop trusting the index. */
  unindex(body) {
    if (this.added.has(body)) this.unindexed.add(body);
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

  /**
   * A capsule: a box with semicircular caps top and bottom. Characters use
   * it so they ride over the seams between floor tiles instead of catching
   * on a corner the way a flat-bottomed box does.
   * @param {object} spec - `width` is the diameter, `height` is tip to tip.
   */
  createCapsule({ x, y, width, height, ...options }) {
    return new RapierBody(this, { x, y, width, height, shape: 'capsule', ...options });
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
    if (!this.added.has(body)) return body;
    this.byCollider.delete(body.collider.handle);
    this.added.delete(body);
    this.characters.delete(body);
    this.kinematics.delete(body);
    this.unindexed.delete(body);
    const rigidBody = body.rigidBody;
    body.dematerialize();
    this.rWorld.removeRigidBody(rigidBody);
    // A removed body can no longer be anyone's ground.
    for (const character of this.characters) {
      if (character.groundBody === body) character.groundBody = null;
    }
    return body;
  }

  get bodies() {
    return [...this.added];
  }

  /** Live view for per-step internal work; see PhysicsWorldBase.step. */
  bodyIterator() {
    return this.added;
  }

  // === World state ===

  setGravity({ x, y }) {
    this.currentGravity = { x, y };
    this.rWorld.gravity.x = x;
    this.rWorld.gravity.y = y;
    // Gravity is a world-wide change but the solver only integrates awake
    // bodies, so without this a settled stack would hang in mid-air when
    // gravity flips.
    for (const body of this.added) body.rigidBody?.wakeUp();
  }

  get gravity() {
    return { ...this.currentGravity };
  }

  clear() {
    for (const body of [...this.added]) this.remove(body);
  }

  reset() {
    this.rWorld.free();
    this.eventQueue.free();
    this.rWorld = this.#createWorld();
    this.eventQueue = new RAPIER.EventQueue(true);
    this.added.clear();
    this.characters.clear();
    this.kinematics.clear();
    this.byCollider.clear();
    this.unindexed.clear();
    this.accumulator = 0;
  }

  /**
   * The whole world as it is now: Rapier's own snapshot, every body
   * wrapper's state and the query bookkeeping. Kept in memory; restoring
   * it into this world reproduces the steps that follow bit for bit.
   *
   * Bodies created later are detached by `restore`; bodies removed later
   * are attached again, the same objects with the same handles.
   */
  snapshot() {
    return {
      bytes: this.rWorld.takeSnapshot(),
      gravity: { ...this.currentGravity },
      bodies: [...this.added].map((body) => [body, body.saveState()]),
      unindexed: [...this.unindexed]
    };
  }

  /** Put the world back to a `snapshot()` taken from it. */
  restore(snapshot) {
    // Fold every live body into its spec and drop its controller while the
    // old world still exists, then replace the world wholesale.
    for (const body of this.added) body.dematerialize();
    this.rWorld.free();
    this.eventQueue.free();
    this.rWorld = RAPIER.World.restoreSnapshot(snapshot.bytes);
    this.rWorld.integrationParameters.lengthUnit = LENGTH_UNIT;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.currentGravity = { ...snapshot.gravity };

    this.added.clear();
    this.characters.clear();
    this.kinematics.clear();
    this.byCollider.clear();
    this.unindexed.clear();
    for (const [body, state] of snapshot.bodies) {
      body.loadState(state);
      this.added.add(body);
      if (body.bodyType === 'character') this.characters.add(body);
      if (body.bodyType === 'kinematic') this.kinematics.add(body);
      this.byCollider.set(body.collider.handle, body);
    }
    for (const body of snapshot.unindexed) this.unindexed.add(body);
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
   * One step of a character: integrate its intent velocity the way the
   * solver would a dynamic body's (gravity, then drag), let the controller
   * turn that into a collision-aware move (slide along walls, stay out of
   * the floor, snap to ground), and hand the result to the kinematic body.
   *
   * Runs on the fixed step, not the frame — game code only writes intent
   * (`setVelocity`), so character motion integrates exactly like everything
   * else in the world.
   */
  #driveCharacter(body, dt) {
    const v = body.spec.velocity;
    // A character that collides with nothing (mask 0: the console's
    // noclip) has no floor to absorb gravity, so it is not under any.
    const g = body.spec.mask === 0 ? NO_GRAVITY : this.currentGravity;

    v.x += g.x * dt;
    v.y += g.y * dt;
    const damping = 1 + frictionAirToDamping(body.spec.frictionAir) * dt;
    v.x /= damping;
    v.y /= damping;

    // Standing on ground, drop the downward speed. Gravity must not
    // accumulate against a floor that keeps absorbing it, and snap-to-ground
    // (CHARACTER_SNAP) is what keeps the contact and `grounded` alive from
    // step to step. Probing downward into the floor instead made the
    // controller clip the horizontal move every few steps, so a walking
    // character covered about 85% of its commanded distance in a stutter.
    // +y is down; an upward (negative) velocity — a jump — passes untouched,
    // and in zero gravity a character is never grounded so nothing changes.
    if (body.charGrounded && v.y >= 0) {
      v.y = body.groundBody?.bodyType === 'kinematic'
        ? (CHARACTER_OFFSET + CHARACTER_NUDGE + 0.5) / dt
        : 0;
    }

    // A kinematic platform underfoot. The controller carries the character
    // along with it on its own — sideways and upward, where the platform can
    // physically push — and that carry arrives *on top of* whatever movement
    // is asked for here. So the ground's pending step delta is needed twice
    // below: added as a downward assist (the one direction a platform cannot
    // push, it can only drop away), and subtracted when reconciling, so the
    // ride never reads back as the character's own intent.
    let groundDeltaX = 0;
    let groundDeltaY = 0;
    const ground = body.groundBody;
    if (ground?.bodyType === 'kinematic' && ground.rigidBody) {
      const now = ground.rigidBody.translation();
      const next = ground.rigidBody.nextTranslation();
      groundDeltaX = next.x - now.x;
      groundDeltaY = next.y - now.y;
    }
    const descent = Math.max(0, groundDeltaY);

    body.controller.computeColliderMovement(
      body.collider,
      { x: v.x * dt, y: v.y * dt + descent },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const move = body.controller.computedMovement();
    const t = body.rigidBody.translation();
    body.rigidBody.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y });

    body.charGrounded = body.controller.computedGrounded();
    body.groundBody = this.#characterGround(body);

    // Reconcile intent with what actually happened, net of the ride: a wall
    // zeroes the velocity into it, the ground absorbs the fall, free flight
    // passes through unchanged — and a moving platform never bleeds its own
    // motion into what `velocity` reads.
    v.x = (move.x - groundDeltaX) / dt;
    v.y = (move.y - groundDeltaY) / dt;
  }

  /** The body this character is standing on, if any. */
  #characterGround(body) {
    if (!body.charGrounded) return null;
    const controller = body.controller;
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const collision = controller.computedCollision(i);
      const collider = collision?.collider;
      if (!collider) continue;
      // normal1 is the obstacle's outward normal; ground points up (-y).
      if (collision.normal1.y < -0.5) {
        const other = this.byCollider.get(collider.handle);
        if (other) return other;
      }
    }
    // A character at rest on static ground hovers in the controller's gap
    // and reports no collision, only `grounded`. Find the floor the same
    // way `Entity.isOnGround` does for every other body: by contact normal.
    const surface = this.surfacesWith(body, (other) => !other.isSensor)
      .find(({ normal }) => normal.y > 0.5);
    return surface ? surface.body : null;
  }

  /**
   * Wake whatever is resting on a kinematic body that is about to move.
   *
   * Sleeping is woken by contact *force*, and a platform pulling away from
   * its rider — descending, or sliding out from under it — applies none. The
   * rider would stay asleep: frozen in mid-air while the platform leaves,
   * then snapping into a fall whenever something else happened to wake it.
   */
  #wakeRiders() {
    for (const body of this.kinematics) {
      const now = body.rigidBody.translation();
      const next = body.rigidBody.nextTranslation();
      if (next.x === now.x && next.y === now.y) continue;
      // Geometric contacts, not the solver's: a sleeping body's pairs drop
      // out of the narrow phase, so asking the solver who is touching this
      // platform returns exactly the riders that do not need waking.
      for (const rider of this.contactsWith(body)) rider.rigidBody?.wakeUp();
    }
  }

  /**
   * Carry kinematic bodies along their commanded velocity.
   *
   * Done here, per step, rather than by whoever set the velocity, because
   * game code runs on frame time: a position target set once per frame is
   * consumed once per *step*, so a frame that happens to run two steps or
   * none makes the body lurch. Integrating the velocity here gives exactly
   * `v·dt` every step however the frames fall. An explicit
   * `setNextPosition` still wins for the step it was issued in.
   */
  #driveKinematics(dt) {
    for (const body of this.kinematics) {
      if (body.consumeTarget()) continue;
      const v = body.spec.velocity;
      if (v.x === 0 && v.y === 0) continue;
      const t = body.rigidBody.translation();
      body.rigidBody.setNextKinematicTranslation({ x: t.x + v.x * dt, y: t.y + v.y * dt });
    }
  }

  /**
   * Advance one character body as a tick would, without stepping the world.
   * See `PhysicsWorldBase.advanceBody`.
   */
  advanceBody(body, dt) {
    if (body.bodyType !== 'character' || !body.controller || !body.rigidBody) return false;
    // The same computation the tick runs, against the same colliders.
    this.#driveCharacter(body, dt);
    // `#driveCharacter` queues the move as the next kinematic translation,
    // which only a world step would commit. Nothing is going to step, so
    // commit it here; for a character body the two are the same move.
    const next = body.rigidBody.nextTranslation();
    body.rigidBody.setTranslation({ x: next.x, y: next.y }, true);
    body.rigidBody.setNextKinematicTranslation({ x: next.x, y: next.y });
    // The broad phase has not seen this move: queries fall back to the
    // direct pass until the next step reindexes it.
    this.unindex(body);
    return true;
  }

  stepOnce(dt) {
    this.#driveKinematics(dt);
    this.#wakeRiders();
    for (const body of this.characters) this.#driveCharacter(body, dt);
    this.rWorld.timestep = dt;
    this.rWorld.step(this.eventQueue);
    // The step is what (re)indexes every body, so nothing is stale now.
    this.unindexed.clear();

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

  /**
   * Visit every body that could overlap `shape` at the given transform: the
   * broad phase for everything it has correctly indexed, then a direct pass
   * over the bodies it cannot be trusted about. Results are deduplicated by
   * construction — a body is in exactly one of the two groups.
   */
  #eachCandidate(shape, position, angle, visit) {
    this.rWorld.intersectionsWithShape(position, angle, shape, (collider) => {
      const body = this.byCollider.get(collider.handle);
      if (body && !this.unindexed.has(body)) visit(body);
      return true;
    });
    for (const body of this.unindexed) visit(body);
  }

  /** The exact test both overlap queries agree on, after broad-phase. */
  #contact(shape, position, angle, other) {
    return shape.contactShape(
      position, angle, other.queryShape, other.position, other.angle, CONTACT_PAD);
  }

  /**
   * Contacts touching `body`, each with the surface normal pointing *from*
   * `body` towards the other body, and the gap between them (negative while
   * they overlap). The normal is what separates a floor from a wall or a
   * ceiling.
   * @returns {{body: RapierBody, normal: {x: number, y: number},
   *   distance: number}[]}
   */
  surfacesWith(body, filter) {
    const { position, angle, queryShape } = body;
    const results = [];
    this.#eachCandidate(body.paddedShape, position, angle, (other) => {
      if (other === body) return;
      if (filter && !filter(other)) return;
      const contact = this.#contact(queryShape, position, angle, other);
      if (contact === null) return;
      results.push({
        body: other,
        normal: { x: contact.normal1.x, y: contact.normal1.y },
        distance: contact.distance
      });
    });
    return results;
  }

  /**
   * Bodies touching `body`, within CONTACT_PAD slack so resting contact
   * (which the solver holds a hair apart) reliably counts.
   */
  contactsWith(body, filter) {
    const { position, angle, queryShape } = body;
    const results = [];
    this.#eachCandidate(body.paddedShape, position, angle, (other) => {
      if (other === body) return;
      if (filter && !filter(other)) return;
      if (this.#contact(queryShape, position, angle, other) !== null) results.push(other);
    });
    return results;
  }

  /**
   * Bodies touching a shape that need not exist in the world — for one-shot
   * questions like "what is inside this blast radius", which would otherwise
   * need a throwaway body to be added, moved and queried every frame.
   * @param {object} shape - `{x, y, radius}` for a circle, or
   *   `{x, y, width, height, angle}` for a box.
   */
  overlaps(shape, filter) {
    const isCircle = shape.radius !== undefined;
    const kind = isCircle ? 'circle' : 'box';
    const width = isCircle ? shape.radius * 2 : shape.width;
    const height = isCircle ? shape.radius * 2 : shape.height;
    const position = { x: shape.x, y: shape.y };
    const angle = shape.angle ?? 0;

    const exact = makeShape(kind, width, height);
    const padded = makeShape(kind, width, height, CONTACT_PAD);
    const results = [];
    this.#eachCandidate(padded, position, angle, (other) => {
      if (filter && !filter(other)) return;
      if (this.#contact(exact, position, angle, other) !== null) results.push(other);
    });
    return results;
  }

  /**
   * Bodies whose shape contains a point — "what is under the cursor".
   *
   * Unlike the contact queries this one is *exact*, with no CONTACT_PAD
   * slack: padding exists so resting contact reliably counts as touching,
   * and a click a pixel outside a body should miss it.
   * @param {{x: number, y: number}} point
   * @param {(body: RapierBody) => boolean} [filter]
   * @returns {RapierBody[]}
   */
  queryPoint(point, filter) {
    const results = [];
    // A zero-radius ball is the cheapest broad-phase probe; the exact test
    // below is what actually decides.
    const probe = makeShape('circle', 0);
    this.#eachCandidate(probe, point, 0, (other) => {
      if (filter && !filter(other)) return;
      if (other.queryShape.containsPoint(other.position, other.angle, point)) {
        results.push(other);
      }
    });
    return results;
  }

  /**
   * Everything the segment crosses, nearest first, with the point and
   * surface normal of each hit.
   * @returns {{body: RapierBody, point: {x: number, y: number},
   *   normal: {x: number, y: number}, distance: number}[]}
   */
  raycast(start, end, filter) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return [];

    const direction = { x: dx / length, y: dy / length };
    const ray = new RAPIER.Ray(start, direction);
    const hits = [];
    const record = (body, distance, normal) => {
      hits.push({
        body,
        point: {
          x: start.x + direction.x * distance,
          y: start.y + direction.y * distance
        },
        normal: { x: normal.x, y: normal.y },
        distance
      });
    };

    this.rWorld.intersectionsWithRay(ray, length, true, (hit) => {
      const body = this.byCollider.get(hit.collider.handle);
      if (body && !this.unindexed.has(body) && (!filter || filter(body))) {
        record(body, hit.timeOfImpact, hit.normal);
      }
      return true;
    });
    for (const body of this.unindexed) {
      if (filter && !filter(body)) continue;
      const hit = body.queryShape.castRayAndGetNormal(
        ray, body.position, body.angle, length, true);
      if (hit) record(body, hit.timeOfImpact, hit.normal);
    }

    return hits.sort((a, b) => a.distance - b.distance);
  }
}

/** Compile the WASM module. Called once by `initPhysics()`. */
export async function init() {
  await RAPIER.init();
}
