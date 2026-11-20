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
 * Nothing in this file imports Rapier at runtime. A backend passes its own
 * module in, because `@dimforge/rapier2d-compat` and
 * `@dimforge/rapier3d-compat` are different WASM modules with the same API,
 * and importing either here would pull both into every build. The types
 * below are imported from the 2D package and name only public members, so
 * either package's objects satisfy them: they are derived from Rapier's own
 * declarations rather than a second description that could drift.
 *
 * See ./index.ts for the contract both backends implement.
 */

import type {
  ActiveCollisionTypes, ActiveEvents, CoefficientCombineRule, Collider,
  KinematicCharacterController, RigidBody, RigidBodyType
} from '@dimforge/rapier2d-compat';
import type { Entity } from '../entity.js';
import type { PhysicsWorldBase } from './worldBase.ts';

/**
 * What a body is driven by. A `character` is a kinematic body with a
 * controller; see the contract in ./index.ts.
 */
export type BodyType = 'static' | 'dynamic' | 'kinematic' | 'character';

/** Which collision layers a body is on, and which it collides with. */
export interface CollisionFilter {
  category: number;
  mask: number;
}

/** The material half of a creation spec: what a body is made of. */
export interface MaterialOptions {
  bodyType?: BodyType;
  lockRotation?: boolean;
  isSensor?: boolean;
  friction?: number;
  frictionAir?: number;
  restitution?: number;
  density?: number;
  category?: number;
  mask?: number;
  mass?: number | null;
}

/** The buffered material state, with every default resolved. */
export interface MaterialSpec {
  bodyType: BodyType;
  lockRotation: boolean;
  isSensor: boolean;
  friction: number;
  frictionAir: number;
  restitution: number;
  density: number;
  category: number;
  mask: number;
  /** Set explicitly, or null to derive it from density and shape. */
  mass: number | null;
  bullet: boolean;
}

/** The enums the material half reads. Either compat package satisfies it. */
export interface RapierEnums {
  RigidBodyType: typeof RigidBodyType;
  ActiveEvents: typeof ActiveEvents;
  CoefficientCombineRule: typeof CoefficientCombineRule;
  ActiveCollisionTypes: typeof ActiveCollisionTypes;
}

/** The collider members the material accessors touch. */
export type MaterialCollider = Pick<Collider,
  'handle' | 'isSensor' | 'setSensor' | 'friction' | 'setFriction' | 'restitution'
  | 'setRestitution' | 'setActiveEvents' | 'setCollisionGroups' | 'setMass'>;

/** The rigid-body members the material accessors touch. */
export type MaterialRigidBody = Pick<RigidBody,
  'handle' | 'setBodyType' | 'linearDamping' | 'setLinearDamping' | 'isCcdEnabled'
  | 'enableCcd' | 'mass'>;

/** The controller member the material accessors touch. */
export type MaterialController = Pick<KinematicCharacterController, 'setCharacterMass'>;

/**
 * The collider description the material half fills in. The builders return
 * their own package's descriptor, which the two packages do not share, so
 * the result is `unknown` here and the caller keeps the descriptor it
 * passed in.
 */
export interface MaterialColliderDesc {
  setSensor(sensor: boolean): unknown;
  setFriction(friction: number): unknown;
  setRestitution(restitution: number): unknown;
  setDensity(density: number): unknown;
  setCollisionGroups(groups: number): unknown;
  setFrictionCombineRule(rule: CoefficientCombineRule): unknown;
  setRestitutionCombineRule(rule: CoefficientCombineRule): unknown;
  setActiveCollisionTypes(types: ActiveCollisionTypes): unknown;
  setMass(mass: number): unknown;
}

/** The rigid-body description the material half fills in. */
export interface MaterialBodyDesc {
  setLinearDamping(damping: number): unknown;
  setCcdEnabled(enabled: boolean): unknown;
  lockRotations(): unknown;
}

/**
 * Tells Rapier's solver tolerances that the 2D world's units are pixels
 * (~100/m). The 3D world is in metres and keeps its own constants; see
 * rapier3dBackend.ts. Everything below that carries a px unit is 2D tuning.
 */
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
 * `frictionAir` is the contract's drag knob, carried over from Matter.js,
 * which damped velocity by that fraction per 60Hz step. Rapier instead damps
 * by `1 / (1 + dt * linearDamping)` per step; equating the two per-step
 * multipliers gives this conversion, so existing values still feel right.
 */
export function frictionAirToDamping(frictionAir: number): number {
  if (!frictionAir) return 0;
  return (frictionAir * 60) / (1 - frictionAir);
}

export function dampingToFrictionAir(damping: number): number {
  if (!damping) return 0;
  return damping / (60 + damping);
}

/**
 * The buffered material state every body carries, whatever its dimension.
 * `defaults.density` is the backend's, since it depends on the unit the
 * backend measures in.
 */
export function materialSpec(spec: MaterialOptions, defaults: { density?: number } = {}): MaterialSpec {
  return {
    bodyType: spec.bodyType ?? 'dynamic',
    lockRotation: spec.lockRotation ?? false,
    isSensor: spec.isSensor ?? false,
    friction: spec.friction ?? 0.1,
    frictionAir: spec.frictionAir ?? 0.01,
    restitution: spec.restitution ?? 0,
    density: spec.density ?? defaults.density ?? DEFAULT_DENSITY,
    category: spec.category ?? 0x0001,
    mask: spec.mask ?? 0xFFFF,
    mass: spec.mass ?? null,
    bullet: false
  };
}

/**
 * The rigid-body description for a body type, built by the caller's own
 * Rapier module — which is what the description's type comes from, so a 2D
 * backend gets a 2D descriptor and a 3D one a 3D descriptor.
 */
export function bodyDescFor<Desc>(
  R: { RigidBodyDesc: { fixed(): Desc; kinematicPositionBased(): Desc; dynamic(): Desc } },
  bodyType: BodyType
): Desc {
  if (bodyType === 'static') return R.RigidBodyDesc.fixed();
  // A character is a kinematic body too — the controller computes its moves,
  // the solver never does.
  if (bodyType === 'kinematic' || bodyType === 'character') {
    return R.RigidBodyDesc.kinematicPositionBased();
  }
  return R.RigidBodyDesc.dynamic();
}

export function rigidBodyTypeFor(R: RapierEnums, bodyType: BodyType): RigidBodyType {
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
 *
 * A subclass redeclares `world`, `spec`, `rigidBody`, `collider` and
 * `controller` with its own dimension's types: `declare`, never a field, so
 * nothing is redefined at construction time.
 */
export class RapierBodyMaterial {
  world: PhysicsWorldBase;
  R: RapierEnums;
  spec: MaterialSpec;
  rigidBody: MaterialRigidBody | null;
  collider: MaterialCollider | null;
  /** Set for a `character` body; see the backend's controller setup. */
  controller: MaterialController | null;
  entity: Entity | null;

  /**
   * @param world - The owning PhysicsWorld.
   * @param R - The backend's Rapier module.
   * @param spec - Creation spec; material keys are read here.
   * @param defaults - Backend defaults for keys the spec leaves out.
   */
  constructor(world: PhysicsWorldBase, R: RapierEnums, spec: MaterialOptions, defaults?: { density?: number }) {
    this.world = world;
    this.R = R;
    this.spec = materialSpec(spec, defaults);

    this.rigidBody = null;
    this.collider = null;
    this.controller = null;
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
  get wantsEvents(): boolean {
    return this.spec.bodyType !== 'static' || this.spec.isSensor;
  }

  applyEventFlag(): void {
    this.collider?.setActiveEvents(this.wantsEvents
      ? this.R.ActiveEvents.COLLISION_EVENTS
      : this.R.ActiveEvents.NONE);
  }

  /**
   * The material half of a collider description, applied to the shape the
   * subclass built. The combine rules and the pair set are not Rapier's
   * defaults and the games are tuned to these.
   */
  applyColliderMaterial<Desc extends MaterialColliderDesc>(desc: Desc): Desc {
    const s = this.spec;
    desc.setSensor(s.isSensor);
    desc.setFriction(s.friction);
    desc.setRestitution(s.restitution);
    desc.setDensity(s.density);
    desc.setCollisionGroups(((s.category & 0xFFFF) << 16) | (s.mask & 0xFFFF));
    // Resolve pairs with min(friction) and max(restitution), the rule the
    // games are tuned to. Rapier's default is averaging, which would
    // soften every bounce.
    desc.setFrictionCombineRule(this.R.CoefficientCombineRule.Min);
    desc.setRestitutionCombineRule(this.R.CoefficientCombineRule.Max);
    // Rapier's default pair set covers dynamic-vs-anything but omits
    // kinematic-vs-static and kinematic-vs-kinematic, so a moving platform
    // would silently stop reporting once it met a wall or another platform.
    desc.setActiveCollisionTypes(this.R.ActiveCollisionTypes.ALL);
    if (s.mass !== null) desc.setMass(s.mass);
    return desc;
  }

  /** The rigid-body half, minus the transform the subclass sets. */
  applyBodyMaterial<Desc extends MaterialBodyDesc>(desc: Desc): Desc {
    const s = this.spec;
    desc.setLinearDamping(frictionAirToDamping(s.frictionAir));
    desc.setCcdEnabled(s.bullet);
    // For velocity-driven actors whose sprites never rotate: contact
    // friction would otherwise feed torque into the box and the collider
    // visibly spins while the drawn sprite does not.
    if (s.lockRotation) desc.lockRotations();
    return desc;
  }

  get bodyType(): BodyType {
    return this.spec.bodyType;
  }

  set bodyType(value: BodyType) {
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

  get isSensor(): boolean {
    return this.collider ? this.collider.isSensor() : this.spec.isSensor;
  }

  set isSensor(value: boolean) {
    this.spec.isSensor = value;
    if (!this.collider) return;
    this.collider.setSensor(value);
    this.applyEventFlag();
  }

  get friction(): number {
    return this.collider ? this.collider.friction() : this.spec.friction;
  }

  set friction(value: number) {
    this.spec.friction = value;
    if (this.collider) this.collider.setFriction(value);
  }

  get frictionAir(): number {
    if (!this.rigidBody) return this.spec.frictionAir;
    return dampingToFrictionAir(this.rigidBody.linearDamping());
  }

  set frictionAir(value: number) {
    this.spec.frictionAir = value;
    if (this.rigidBody) this.rigidBody.setLinearDamping(frictionAirToDamping(value));
  }

  get restitution(): number {
    return this.collider ? this.collider.restitution() : this.spec.restitution;
  }

  set restitution(value: number) {
    this.spec.restitution = value;
    if (this.collider) this.collider.setRestitution(value);
  }

  /** Continuous collision detection: fast bodies stop instead of tunneling. */
  get bullet(): boolean {
    return this.rigidBody ? this.rigidBody.isCcdEnabled() : this.spec.bullet;
  }

  set bullet(value: boolean) {
    this.spec.bullet = value;
    if (this.rigidBody) this.rigidBody.enableCcd(value);
  }

  get collisionFilter(): CollisionFilter {
    const { category, mask } = this.spec;
    return { category, mask };
  }

  setCollisionFilter({ category, mask }: Partial<CollisionFilter> = {}): void {
    if (category !== undefined) this.spec.category = category;
    if (mask !== undefined) this.spec.mask = mask;
    if (this.collider) {
      this.collider.setCollisionGroups((this.spec.category << 16) | this.spec.mask);
    }
  }

  get mass(): number {
    // Only trust the live body for dynamics — Rapier reports kinematic and
    // fixed bodies as massless, but a character's weight is still real (it
    // sizes the shove it gives dynamic bodies, and impulse responses).
    if (this.rigidBody && this.spec.bodyType === 'dynamic') {
      return this.rigidBody.mass();
    }
    if (this.spec.mass !== null) return this.spec.mass;
    return this.shapeMeasure() * this.spec.density;
  }

  setMass(mass: number): void {
    this.spec.mass = mass;
    if (this.collider) this.collider.setMass(mass);
    if (this.controller) this.controller.setCharacterMass(mass);
  }

  /**
   * The shape's area or volume, for the density-derived mass a body that
   * is not a live dynamic one reports. The one piece of `mass` a dimension
   * changes.
   */
  shapeMeasure(): number {
    throw new Error('RapierBodyMaterial must implement shapeMeasure()');
  }
}
