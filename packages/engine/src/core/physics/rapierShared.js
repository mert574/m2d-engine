/**
 * What the 2D and 3D Rapier backends have in common.
 *
 * The two differ in exactly the places a dimension shows: shapes, the
 * position vector, the rotation, and the axis arithmetic of the character
 * controller. Everything else — the tuning the engine was fitted to, the
 * `frictionAir` conversion inherited from Matter.js, and the long run of
 * material accessors that only ever forward to a collider — is the same
 * code twice, and lives here once.
 *
 * Nothing in this file imports Rapier. A backend passes its own module in,
 * because `@dimforge/rapier2d-compat` and `@dimforge/rapier3d-compat` are
 * different WASM modules with the same API, and importing either here
 * would pull both into every build.
 *
 * See ./index.js for the contract both backends implement.
 */

/** Tells Rapier's solver tolerances that world units are pixels (~100/m). */
export const LENGTH_UNIT = 100;

/**
 * Body density, inherited from Matter.js's default when the engine moved off
 * it: a 32x32 box weighs ~1.024. Mass only matters relatively, so the number
 * itself is arbitrary — but game code sets absolute masses (`setMass(1)`)
 * against this scale, so changing it silently re-tunes every game.
 */
export const DEFAULT_DENSITY = 0.001;

/**
 * Contact slack for the overlap queries, in px. The solver holds resting
 * bodies a hair apart, so an exact intersection test would flicker on the
 * "standing on the ground" case the queries exist for. 1px was also what
 * Matter.js's slightly-overlapping resting contacts gave, which is why games
 * are tuned to it.
 */
export const CONTACT_PAD = 1;

/**
 * Gap, in px, a character controller keeps between its shape and whatever it
 * collides with. Rapier wants a small nonzero margin (around 1-2% of the
 * character's size) for numerical robustness; at 0.5px it is invisible.
 */
export const CHARACTER_OFFSET = 0.5;

/**
 * How far below its feet a character snaps back onto ground it was standing
 * on, in px. Covers descending platforms and the crest of slopes; Rapier
 * skips the snap when the character moves upward, so jumps are unaffected.
 */
export const CHARACTER_SNAP = 4;

/**
 * How hard the controller pushes a character back out along contact normals,
 * in px. Rapier's default (1e-4) assumes meters; at pixel scale it is
 * nothing, so a character pressed against a wall crept ~1px inside it — and
 * once flat against a face, the slide around that wall's corner deadlocks
 * (a face contact has no tangential escape). Tuned by sweep: 0.02 still
 * deadlocks the corner, while 0.1 holds the character so far off the ground
 * that `grounded` detection loses it and it hangs hovering. 0.05 does both.
 */
export const CHARACTER_NUDGE = 0.05;

/**
 * `frictionAir` is the contract's drag knob, carried over from Matter.js,
 * which damped velocity by that fraction per 60Hz step. Rapier instead damps
 * by `1 / (1 + dt * linearDamping)` per step; equating the two per-step
 * multipliers gives this conversion, so existing values still feel right.
 */
export function frictionAirToDamping(frictionAir) {
  if (!frictionAir) return 0;
  return (frictionAir * 60) / (1 - frictionAir);
}

export function dampingToFrictionAir(damping) {
  if (!damping) return 0;
  return damping / (60 + damping);
}

/** The buffered material state every body carries, whatever its dimension. */
export function materialSpec(spec) {
  return {
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
}

export function bodyDescFor(R, bodyType) {
  if (bodyType === 'static') return R.RigidBodyDesc.fixed();
  // A character is a kinematic body too — the controller computes its moves,
  // the solver never does.
  if (bodyType === 'kinematic' || bodyType === 'character') {
    return R.RigidBodyDesc.kinematicPositionBased();
  }
  return R.RigidBodyDesc.dynamic();
}

export function rigidBodyTypeFor(R, bodyType) {
  if (bodyType === 'static') return R.RigidBodyType.Fixed;
  if (bodyType === 'kinematic' || bodyType === 'character') {
    return R.RigidBodyType.KinematicPositionBased;
  }
  return R.RigidBodyType.Dynamic;
}

/**
 * The dimension-free half of a body handle: what it is made of, rather than
 * where it is.
 *
 * A subclass owns the transform — position, rotation, velocity, the shapes
 * and the character controller — and supplies `R`, its Rapier module. These
 * accessors read through to the live collider once there is one and fall
 * back to the buffered spec before that, which is what lets a body be
 * created outside a world and configured before it is added.
 */
export class RapierBodyMaterial {
  /**
   * @param {object} world - The owning PhysicsWorld.
   * @param {object} R - The backend's Rapier module.
   * @param {object} spec - Creation spec; material keys are read here.
   */
  constructor(world, R, spec) {
    this.world = world;
    this.R = R;
    this.spec = materialSpec(spec);

    this.rigidBody = null;
    this.collider = null;
    /** Set for a `character` body; see the backend's controller setup. */
    this.controller = null;
    /** @type {import('../entity.js').Entity|null} */
    this.entity = null;
  }

  /**
   * Whether the solver should report collision events for this body.
   *
   * Events fire when *either* collider asks for them, so plain static
   * scenery can stay quiet: whatever hits it is dynamic or kinematic and
   * carries the flag itself, and fixed-vs-fixed pairs are never reported at
   * all. Sensors are the exception — reporting is their only purpose.
   */
  get wantsEvents() {
    return this.spec.bodyType !== 'static' || this.spec.isSensor;
  }

  applyEventFlag() {
    this.collider?.setActiveEvents(this.wantsEvents
      ? this.R.ActiveEvents.COLLISION_EVENTS
      : this.R.ActiveEvents.NONE);
  }

  /**
   * The material half of a collider description, applied to the shape the
   * subclass built. The combine rules and the pair set are not Rapier's
   * defaults and the games are tuned to these.
   */
  applyColliderMaterial(desc) {
    const s = this.spec;
    desc
      .setSensor(s.isSensor)
      .setFriction(s.friction)
      .setRestitution(s.restitution)
      .setDensity(s.density)
      .setCollisionGroups(((s.category & 0xFFFF) << 16) | (s.mask & 0xFFFF))
      // Resolve pairs with min(friction) and max(restitution), the rule the
      // games are tuned to. Rapier's default is averaging, which would
      // soften every bounce.
      .setFrictionCombineRule(this.R.CoefficientCombineRule.Min)
      .setRestitutionCombineRule(this.R.CoefficientCombineRule.Max)
      // Rapier's default pair set covers dynamic-vs-anything but omits
      // kinematic-vs-static and kinematic-vs-kinematic, so a moving platform
      // would silently stop reporting once it met a wall or another platform.
      .setActiveCollisionTypes(this.R.ActiveCollisionTypes.ALL);
    if (s.mass !== null) desc.setMass(s.mass);
    return desc;
  }

  /** The rigid-body half, minus the transform the subclass sets. */
  applyBodyMaterial(desc) {
    const s = this.spec;
    desc
      .setLinearDamping(frictionAirToDamping(s.frictionAir))
      .setCcdEnabled(s.bullet);
    // For velocity-driven actors whose sprites never rotate: contact
    // friction would otherwise feed torque into the box and the collider
    // visibly spins while the drawn sprite does not.
    if (s.lockRotation) desc.lockRotations();
    return desc;
  }

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

    this.rigidBody.setBodyType(rigidBodyTypeFor(this.R, value), true);
    // The event flag is derived from the body type, so moving to or from
    // static has to re-derive it.
    this.applyEventFlag();
  }

  get isSensor() {
    return this.collider ? this.collider.isSensor() : this.spec.isSensor;
  }

  set isSensor(value) {
    this.spec.isSensor = value;
    if (!this.collider) return;
    this.collider.setSensor(value);
    this.applyEventFlag();
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
      this.collider.setCollisionGroups((this.spec.category << 16) | this.spec.mask);
    }
  }

  get mass() {
    // Only trust the live body for dynamics — Rapier reports kinematic and
    // fixed bodies as massless, but a character's weight is still real (it
    // sizes the shove it gives dynamic bodies, and impulse responses).
    if (this.rigidBody && this.spec.bodyType === 'dynamic') {
      return this.rigidBody.mass();
    }
    if (this.spec.mass !== null) return this.spec.mass;
    return this.shapeMeasure() * this.spec.density;
  }

  setMass(mass) {
    this.spec.mass = mass;
    if (this.collider) this.collider.setMass(mass);
    if (this.controller) this.controller.setCharacterMass(mass);
  }

  /**
   * The shape's area or volume, for the density-derived mass a body that
   * is not a live dynamic one reports. The one piece of `mass` a dimension
   * changes.
   * @abstract @returns {number}
   */
  shapeMeasure() {
    throw new Error('RapierBodyMaterial must implement shapeMeasure()');
  }
}
