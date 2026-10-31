import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsWorldBase } from './worldBase.js';

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

/** Tells Rapier's solver tolerances that world units are pixels (~100/m). */
const LENGTH_UNIT = 100;

/**
 * Body density, inherited from Matter.js's default when the engine moved off
 * it: a 32x32 box weighs ~1.024. Mass only matters relatively, so the number
 * itself is arbitrary — but game code sets absolute masses (`setMass(1)`)
 * against this scale, so changing it silently re-tunes every game.
 */
const DEFAULT_DENSITY = 0.001;

/**
 * Contact slack for the overlap queries, in px. The solver holds resting
 * bodies a hair apart, so an exact intersection test would flicker on the
 * "standing on the ground" case the queries exist for. 1px was also what
 * Matter.js's slightly-overlapping resting contacts gave, which is why games
 * are tuned to it.
 */
const CONTACT_PAD = 1;

/**
 * Gap, in px, a character controller keeps between its shape and whatever it
 * collides with. Rapier wants a small nonzero margin (around 1-2% of the
 * character's size) for numerical robustness; at 0.5px it is invisible.
 */
const CHARACTER_OFFSET = 0.5;

/**
 * How far below its feet a character snaps back onto ground it was standing
 * on, in px. Covers descending platforms and the crest of slopes; Rapier
 * skips the snap when the character moves upward, so jumps are unaffected.
 */
const CHARACTER_SNAP = 4;

/**
 * How hard the controller pushes a character back out along contact normals,
 * in px. Rapier's default (1e-4) assumes meters; at pixel scale it is
 * nothing, so a character pressed against a wall crept ~1px inside it — and
 * once flat against a face, the slide around that wall's corner deadlocks
 * (a face contact has no tangential escape). Tuned by sweep: 0.02 still
 * deadlocks the corner, while 0.1 holds the character so far off the ground
 * that `grounded` detection loses it and it hangs hovering. 0.05 does both.
 */
const CHARACTER_NUDGE = 0.05;

/**
 * `frictionAir` is the contract's drag knob, carried over from Matter.js,
 * which damped velocity by that fraction per 60Hz step. Rapier instead damps
 * by `1 / (1 + dt * linearDamping)` per step; equating the two per-step
 * multipliers gives this conversion, so existing values still feel right.
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

function bodyDescFor(bodyType) {
  if (bodyType === 'static') return RAPIER.RigidBodyDesc.fixed();
  // A character is a kinematic body too — the controller computes its moves,
  // the solver never does.
  if (bodyType === 'kinematic' || bodyType === 'character') {
    return RAPIER.RigidBodyDesc.kinematicPositionBased();
  }
  return RAPIER.RigidBodyDesc.dynamic();
}

function rigidBodyTypeFor(bodyType) {
  if (bodyType === 'static') return RAPIER.RigidBodyType.Fixed;
  if (bodyType === 'kinematic' || bodyType === 'character') {
    return RAPIER.RigidBodyType.KinematicPositionBased;
  }
  return RAPIER.RigidBodyType.Dynamic;
}

/**
 * A rigid body over Rapier, implementing the contract's PhysicsBody surface.
 * Before `add()` it is pure bookkeeping (`this.spec`); after, reads and
 * writes go to the live rigid body and collider.
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
      angle: spec.angle ?? 0,
      velocity: { x: 0, y: 0 },
      bodyType: spec.bodyType ?? 'dynamic',
      lockRotation: spec.lockRotation ?? false,
      isSensor: spec.isSensor ?? false,
      friction: spec.friction ?? 0.1,
      frictionAir: spec.frictionAir ?? 0.01,
      restitution: spec.restitution ?? 0,
      density: spec.density ?? DEFAULT_DENSITY,
      category: spec.category ?? 0x0001,
      mask: spec.mask ?? 0xFFFF,
      mass: null,
      bullet: false
    };

    /** @type {import('@dimforge/rapier2d-compat').RigidBody|null} */
    this.rigidBody = null;
    /** @type {import('@dimforge/rapier2d-compat').Collider|null} */
    this.collider = null;

    /**
     * Character-only state. The controller computes each step's collision-
     * aware movement; `spec.velocity` stays the live intent (what game code
     * set, reconciled against what actually happened) because a kinematic
     * rigid body's own linvel is derived, not driven. `groundBody` is what
     * the character stood on after the last step, kept so a moving platform
     * underfoot can carry it.
     */
    this.controller = null;
    this.charGrounded = false;
    this.groundBody = null;

    /** Set by `setNextPosition`; consumed by the world's next step. */
    this.hasTarget = false;

    /** Interpolation baseline; see `renderPosition`. */
    this.previous = { x: spec.x, y: spec.y, angle: spec.angle ?? 0 };

    /** @type {import('../entity.js').Entity|null} */
    this.entity = null;

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

  /**
   * Whether the solver should report collision events for this body.
   *
   * Events fire when *either* collider asks for them, so plain static
   * scenery can stay quiet: whatever hits it is dynamic or kinematic and
   * carries the flag itself, and fixed-vs-fixed pairs are never reported at
   * all. Sensors are the exception — reporting is their only purpose.
   */
  get #wantsEvents() {
    return this.spec.bodyType !== 'static' || this.spec.isSensor;
  }

  #applyEventFlag() {
    this.collider?.setActiveEvents(this.#wantsEvents
      ? RAPIER.ActiveEvents.COLLISION_EVENTS
      : RAPIER.ActiveEvents.NONE);
  }

  /** Build the rigid body + collider. Called by the world's `add()`. */
  materialize() {
    const s = this.spec;
    const bodyDesc = bodyDescFor(s.bodyType)
      .setTranslation(s.x, s.y)
      .setRotation(s.angle)
      .setLinvel(s.velocity.x, s.velocity.y)
      .setLinearDamping(frictionAirToDamping(s.frictionAir))
      .setCcdEnabled(s.bullet);
    // For velocity-driven actors whose sprites never rotate: contact
    // friction would otherwise feed torque into the box and the collider
    // visibly spins while the drawn sprite does not.
    if (s.lockRotation) bodyDesc.lockRotations();

    const shapeDesc = colliderDescFor(this.shape, this.width, this.height);
    shapeDesc
      .setSensor(s.isSensor)
      .setFriction(s.friction)
      .setRestitution(s.restitution)
      .setDensity(s.density)
      .setCollisionGroups(((s.category & 0xFFFF) << 16) | (s.mask & 0xFFFF))
      // Resolve pairs with min(friction) and max(restitution), the rule the
      // games are tuned to. Rapier's default is averaging, which would
      // soften every bounce.
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
      // Rapier's default pair set covers dynamic-vs-anything but omits
      // kinematic-vs-static and kinematic-vs-kinematic, so a moving platform
      // would silently stop reporting once it met a wall or another platform.
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    if (s.mass !== null) shapeDesc.setMass(s.mass);

    this.rigidBody = this.world.rWorld.createRigidBody(bodyDesc);
    this.collider = this.world.rWorld.createCollider(shapeDesc, this.rigidBody);
    this.#applyEventFlag();

    if (s.bodyType === 'character') {
      const c = this.world.rWorld.createCharacterController(CHARACTER_OFFSET);
      // Screen coordinates grow downward, so "up" — the direction that makes
      // a surface count as ground — is -y. Without this, ceilings ground.
      c.setUp({ x: 0, y: -1 });
      c.setSlideEnabled(true);
      c.setNormalNudgeFactor(CHARACTER_NUDGE);
      c.enableSnapToGround(CHARACTER_SNAP);
      // Walking into a crate shoves it, with this body's weight behind it.
      c.setApplyImpulsesToDynamicBodies(true);
      c.setCharacterMass(this.mass);
      this.controller = c;
    }

    this.syncInterpolation();
  }

  /** Fold live state back into the spec and detach. Called by `remove()`. */
  dematerialize() {
    const s = this.spec;
    const t = this.rigidBody.translation();
    s.x = t.x;
    s.y = t.y;
    s.angle = this.rigidBody.rotation();
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

  /** Mass on the engine's density scale; see DEFAULT_DENSITY. */
  get mass() {
    // Only trust the live body for dynamics — Rapier reports kinematic and
    // fixed bodies as massless, but a character's weight is still real (it
    // sizes the shove it gives dynamic bodies, and impulse responses).
    if (this.rigidBody && this.spec.bodyType === 'dynamic') {
      return this.rigidBody.mass();
    }
    if (this.spec.mass !== null) return this.spec.mass;
    const area = this.shape === 'circle'
      ? Math.PI * (this.width / 2) ** 2
      : this.width * this.height;
    return area * this.spec.density;
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

  /**
   * `static` never moves, `dynamic` is driven by the solver, `kinematic` is
   * driven by game code through `setNextPosition` and pushes dynamic bodies
   * without being pushed back.
   * @returns {'static'|'dynamic'|'kinematic'}
   */
  get bodyType() {
    return this.spec.bodyType;
  }

  set bodyType(value) {
    const previous = this.spec.bodyType;
    if (value === previous) return;
    if (this.rigidBody && (value === 'character' || previous === 'character')) {
      // A character is more than a body type — it owns a controller with
      // world-side state. Rebuilding that mid-simulation is not supported.
      throw new Error(
        "M2D: cannot change bodyType to or from 'character' while the body is "
        + 'in a world — remove it, change the type, and add it again');
    }
    this.spec.bodyType = value;
    if (!this.rigidBody) return;

    this.rigidBody.setBodyType(rigidBodyTypeFor(value), true);
    // The event flag is derived from the body type, so moving to or from
    // static has to re-derive it.
    this.#applyEventFlag();
  }

  get isSensor() {
    return this.collider ? this.collider.isSensor() : this.spec.isSensor;
  }

  set isSensor(value) {
    this.spec.isSensor = value;
    if (!this.collider) return;
    this.collider.setSensor(value);
    this.#applyEventFlag();
  }

  get friction() {
    return this.collider ? this.collider.friction() : this.spec.friction;
  }

  set friction(value) {
    this.spec.friction = value;
    if (this.collider) this.collider.setFriction(value);
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
    const { category, mask } = this.spec;
    return { category, mask };
  }

  setCollisionFilter({ category, mask } = {}) {
    if (category !== undefined) this.spec.category = category;
    if (mask !== undefined) this.spec.mask = mask;
    if (this.collider) {
      this.collider.setCollisionGroups(
        ((this.spec.category & 0xFFFF) << 16) | (this.spec.mask & 0xFFFF));
    }
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

  setMass(mass) {
    this.spec.mass = mass;
    if (this.collider) this.collider.setMass(mass);
    if (this.controller) this.controller.setCharacterMass(mass);
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
    const g = this.currentGravity;

    v.x += g.x * dt;
    v.y += g.y * dt;
    const damping = 1 + frictionAirToDamping(body.spec.frictionAir) * dt;
    v.x /= damping;
    v.y /= damping;

    // Standing on ground, pin the downward speed to a probe of just over
    // the hover gap the offset and nudge maintain: far enough to re-prove
    // the ground contact (and `grounded`) every step, nowhere near the fall
    // speed that would accumulate if gravity were left to integrate against
    // a floor that keeps absorbing it. +y is down; an upward (negative)
    // velocity — a jump — passes untouched, and in zero gravity a character
    // is never grounded so nothing changes.
    if (body.charGrounded && v.y >= 0) {
      v.y = (CHARACTER_OFFSET + CHARACTER_NUDGE + 0.5) / dt;
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
    return null;
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
