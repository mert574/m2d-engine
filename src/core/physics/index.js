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
 *              bodies, clear, reset, destroy, setGravity / gravity,
 *              advance / step / interpolation, setCollisionHandlers,
 *              contactsWith, surfacesWith, overlaps, raycast
 *
 *   Body       position, velocity, angle, bounds, size, mass, entity,
 *              renderPosition / renderAngle / renderBounds, grounded,
 *              bodyType / isSensor / bullet / friction / frictionAir /
 *              restitution, collisionFilter, setCollisionFilter,
 *              setPosition, setVelocity, setAngle, setNextPosition,
 *              setNextAngle, setMass, translate, applyImpulse
 *
 * Units and conventions — these are the contract's, not the solver's:
 *
 * - **Distance is pixels, time is seconds.** Velocity is px/s, gravity is
 *   px/s² (`{x: 0, y: 1000}` is the "normal down" the games are tuned to),
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
 * - **`applyImpulse` is mass-dependent**, in px·mass/s, and inert on
 *   anything but a dynamic body. Multiply by `body.mass` when you want a
 *   flat velocity change regardless of weight.
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
 * - **`raycast` returns every body crossing the segment, nearest first**,
 *   each with the hit point, surface normal and distance.
 *
 * `test/physics.test.js` is this contract written as executable, tolerance-
 * based tests.
 */

/** The world constructor, once `initPhysics` has compiled the WASM module. */
let PhysicsWorld = null;

/**
 * Load and initialize the physics simulation. Await once before constructing
 * M2D: this is where Rapier's WASM module is fetched and compiled, and no
 * world can exist until it resolves. Calling it again is a no-op.
 */
export async function initPhysics() {
  if (PhysicsWorld) return;
  const rapier = await import('./rapierBackend.js');
  await rapier.init();
  PhysicsWorld = rapier.RapierPhysicsWorld;
}

/**
 * Create the physics world for a game.
 * @param {object} [options]
 * @param {{x: number, y: number}} [options.gravity] - px/s².
 * @param {number} [options.fixedTimestep] - Seconds per solver step
 *   (default 1/60). The solver always sees exactly this dt.
 * @param {number} [options.maxSubSteps] - Most steps `advance` will run in
 *   one frame (default 6 — exactly the engine loop's 0.1s frame-delta clamp),
 *   bounding catch-up work after a stall.
 * @param {number} [options.timeScale] - Multiplier on elapsed time, for
 *   slow motion or for matching a previously mistuned simulation rate.
 * @param {boolean} [options.interpolate] - Blend drawn transforms between
 *   steps (default true). See PhysicsBody.renderPosition.
 */
export function createPhysicsWorld(options = {}) {
  if (!PhysicsWorld) {
    throw new Error('M2D: physics is not initialized — await initPhysics() first');
  }
  return new PhysicsWorld(options);
}
