/**
 * The engine's physics boundary.
 *
 * Everything in M2D talks to the simulation through `PhysicsWorld` and the
 * `PhysicsBody` handles it hands out. No other module imports a physics
 * library directly, so solver types, units and lifecycle quirks stay behind
 * this boundary instead of spreading through the codebase.
 *
 * The simulation is Rapier 2D, compiled to WASM. It is imported dynamically
 * by `initPhysics` so the WASM module lands in its own chunk and is fetched
 * only when a game actually starts a world.
 *
 * The contract, in brief:
 *
 *   World      createBox / createCircle / createCapsule, add / remove,
 *              bodies, clear, reset, destroy, setGravity / gravity, up,
 *              advance / step / interpolation, setCollisionHandlers,
 *              contactsWith, surfacesWith, overlaps, queryPoint, raycast
 *
 *   Body       position, velocity, angle, bounds, size, mass, entity,
 *              renderPosition / renderAngle / renderBounds, grounded,
 *              bodyType / isSensor / bullet / friction / frictionAir /
 *              restitution, collisionFilter, setCollisionFilter,
 *              angularVelocity, setPosition, setVelocity, setAngle,
 *              setAngularVelocity, setNextPosition, setNextAngle, setMass,
 *              translate, applyImpulse
 *
 * Units and conventions — these are the contract's, not the solver's:
 *
 * - **Time is seconds; distance depends on the dimension.** In 2D a unit is
 *   a pixel, up is -y and gravity is px/s² (`{x: 0, y: 1000}` is the
 *   "normal down" the games are tuned to). In 3D a unit is a metre, up is
 *   +y and gravity is m/s² (`{x: 0, y: -9.81, z: 0}`). `world.up` says
 *   which; shared code asks it rather than assuming an axis.
 *   `advance`/`step` take seconds.
 * - **`bodyType` is `static`, `dynamic`, `kinematic` or `character`.** A
 *   kinematic body is driven by game code but still resolves contacts
 *   properly, so it carries riders and pushes what is in its way. Drive it
 *   with `setVelocity`, which the world integrates once per step — a
 *   position target set from frame time is consumed per *step* instead, so
 *   a frame running two steps or none makes it lurch. `setNextPosition` is
 *   for placing it exactly (arriving at a path point); `setPosition`
 *   teleports and carries nobody, for respawns rather than motion.
 * - **`character` is the body type for a player.** Game code keeps the
 *   dynamic-body interface — `setVelocity` intent, gravity and `frictionAir`
 *   apply, `applyImpulse` works — but a character controller does the
 *   moving: it slides along walls instead of catching on them, never
 *   rotates, snaps to the ground it walks on, rides kinematic platforms,
 *   shoves dynamic bodies with its weight, and reports `grounded` (which is
 *   `null` on every other body type).
 * - **`applyImpulse` is mass-dependent**, in px·mass/s. It moves dynamic
 *   and character bodies and does nothing to static or kinematic ones.
 *   Multiply by `body.mass` when you want a flat velocity change
 *   regardless of weight.
 * - **`bullet` opts a body into continuous collision detection**, so a fast
 *   mover cannot tunnel through a thin wall.
 * - **`bounds` is a tight AABB** (rotation-aware), never a broadphase box.
 * - **Creation and insertion are separate.** `createBox` returns a body that
 *   is not simulated until `add`; a body that cannot exist outside a world
 *   buffers its spec and materializes in `add`. Queries see a body as soon
 *   as it is added, without waiting for a step.
 * - **Reads are snapshots or read-only views; writes are methods.** Mutating
 *   a returned object (e.g. `collisionFilter`) is never part of the contract.
 * - **Overlap queries carry normals.** `contactsWith` answers "what am I
 *   touching"; `surfacesWith` adds the normal and gap per contact, which is
 *   how a floor is told from a wall. `overlaps` asks the same question for a
 *   shape that is not a body at all.
 * - **`queryPoint` is exact, unlike the contact queries.** It answers "what
 *   is under this point" — pointer hit testing is the reason it exists — and
 *   deliberately applies no contact slack, so a click just outside a body
 *   misses it.
 * - **`raycast` returns every body crossing the segment, nearest first**,
 *   each with the hit point, surface normal and distance.
 *
 * `test/physics.test.js` is this contract written as executable, tolerance-
 * based tests.
 */

import type { RapierBody, RapierPhysicsWorld, RapierWorldOptions } from './rapierBackend.ts';
import type { RapierBody3D, RapierPhysicsWorld3D, RapierWorld3DOptions } from './rapier3dBackend.ts';

export type { BodyType, CollisionFilter, MaterialOptions, MaterialSpec } from './rapierShared.ts';
export type { CollisionHandler, PhysicsWorldBaseOptions } from './worldBase.ts';

/**
 * A body in the world, whichever backend made it. The two Rapier backends
 * are the only implementations, so this is what `createBox` and friends
 * hand out and what `entity.body` is — the type the JSDoc across the
 * engine has been naming all along.
 */
export type PhysicsBody = RapierBody | RapierBody3D;

/** A world, whichever dimension it simulates in. */
export type PhysicsWorld = RapierPhysicsWorld | RapierPhysicsWorld3D;

/**
 * What `createPhysicsWorld` takes. The dimension picks the rest: gravity is
 * px/s² and two axes in 2D, m/s² and three in 3D.
 */
export type PhysicsWorldOptions =
  | (RapierWorldOptions & { dimensions?: 2 })
  | (RapierWorld3DOptions & { dimensions: 3 });

/**
 * World constructors by dimension, once `initPhysics` has compiled the
 * matching WASM module. A game that only ever runs 2D never fetches the 3D
 * one, and the reverse.
 */
const PhysicsWorlds: {
  2: (new (options?: RapierWorldOptions) => RapierPhysicsWorld) | null;
  3: (new (options?: RapierWorld3DOptions) => RapierPhysicsWorld3D) | null;
} = { 2: null, 3: null };

const notInitialized = (dimensions: number) => new Error(
  `M2D: ${dimensions}D physics is not initialized — `
  + `await initPhysics({ dimensions: ${dimensions} }) first`);

/**
 * Load and initialize the physics simulation. Await once before
 * constructing M2D: this is where Rapier's WASM module is fetched and
 * compiled, and no world can exist until it resolves. Calling it again for
 * the same dimension is a no-op.
 *
 * @param options.dimensions - Which solver to load (2 by default). The two
 *   are separate worlds and separate WASM modules; see
 *   `knowledge-base/projects/3d/3d-and-editor.md` for why the engine runs
 *   both rather than treating 2D as a special case of 3D.
 */
export async function initPhysics({ dimensions = 2 }: { dimensions?: 2 | 3 } = {}): Promise<void> {
  if (dimensions !== 2 && dimensions !== 3) {
    throw new Error(`M2D: physics dimensions must be 2 or 3, got ${JSON.stringify(dimensions)}`);
  }
  if (PhysicsWorlds[dimensions]) return;
  if (dimensions === 3) {
    const rapier = await import('./rapier3dBackend.ts');
    await rapier.init();
    PhysicsWorlds[3] = rapier.RapierPhysicsWorld3D;
    return;
  }
  const rapier = await import('./rapierBackend.ts');
  await rapier.init();
  PhysicsWorlds[2] = rapier.RapierPhysicsWorld;
}

/**
 * Create the physics world for a game.
 *
 * @param options.gravity - px/s² in 2D, m/s² in 3D.
 * @param options.fixedTimestep - Seconds per solver step (default 1/60).
 *   The solver always sees exactly this dt.
 * @param options.maxSubSteps - Most steps `advance` will run in one frame
 *   (default 6 — exactly the engine loop's 0.1s frame-delta clamp),
 *   bounding catch-up work after a stall.
 * @param options.timeScale - Multiplier on elapsed time, for slow motion or
 *   for matching a previously mistuned simulation rate. Ignored when
 *   `clock` is given.
 * @param options.clock - The engine's `Time`; the world then reads its step
 *   settings, time scale and accumulator from it so the solver and the
 *   gameplay tick cannot disagree.
 * @param options.interpolate - Blend drawn transforms between steps
 *   (default true). See PhysicsBody.renderPosition.
 * @param options.dimensions - Which solver to build on (2 by default). It
 *   must already be loaded by `initPhysics`.
 */
export function createPhysicsWorld(options: PhysicsWorldOptions = {}): PhysicsWorld {
  // A dimension the engine does not have a solver for reads back as one
  // that was never initialized, which is the same answer as before it was.
  const dimensions: number = options.dimensions ?? 2;
  if (dimensions !== 2 && dimensions !== 3) throw notInitialized(dimensions);

  if (options.dimensions === 3) {
    const PhysicsWorld = PhysicsWorlds[3];
    if (!PhysicsWorld) throw notInitialized(3);
    return new PhysicsWorld(options);
  }
  const PhysicsWorld = PhysicsWorlds[2];
  if (!PhysicsWorld) throw notInitialized(2);
  return new PhysicsWorld(options);
}
