/**
 * The engine's physics boundary.
 *
 * Everything in M2D talks to the simulation through `PhysicsWorld` and the
 * `PhysicsBody` handles it hands out. No other module imports a physics
 * library directly, so the solver is a choice made here, not a dependency
 * spread through the codebase.
 *
 * Two backends implement the contract:
 *
 * - **rapier** (default) — Rapier 2D via WASM. Accurate solver, stable
 *   stacking, continuous collision detection for `bullet` bodies. Loaded
 *   lazily by `initPhysics`, so it is only fetched when used.
 * - **matter** — Matter.js, plain JavaScript, needs no initialization.
 *   Loaded statically as the fallback, and what `createPhysicsWorld` gives
 *   you if `initPhysics` was never awaited (headless tests do this).
 *
 * Append `?physics=matter` (or `rapier`) to any example URL to compare them
 * live, same as the renderer's `?renderer=` override.
 *
 * The contract, in brief:
 *
 *   World      createBox / createCircle, add / remove, bodies, clear,
 *              clearContacts, reset, destroy, setGravity / gravity,
 *              advance / step / interpolation, setCollisionHandlers,
 *              contactsWith, raycast
 *
 *   Body       position, velocity, angle, bounds, size, entity,
 *              renderPosition / renderAngle / renderBounds,
 *              isStatic / isSensor / bullet / friction / frictionStatic /
 *              frictionAir / restitution, collisionFilter,
 *              setCollisionFilter, setPosition, setVelocity, setAngle,
 *              setMass, translate, applyImpulse
 *
 * Units and conventions — these are the contract's, not any backend's:
 *
 * - **Distance is pixels, time is seconds.** Velocity is px/s, gravity is
 *   px/s² (`{x: 0, y: 1000}` is the "normal down" the games are tuned to),
 *   `advance`/`step` take seconds. Backends convert internally.
 * - **`applyImpulse` is a velocity change in px/s**, mass-independent and
 *   inert on static bodies — "kick it back at 300 px/s", portable across
 *   solvers with different force and mass conventions.
 * - **`bullet` opts a body into continuous collision detection** where the
 *   backend has it; elsewhere it is advisory and fast bodies can tunnel.
 * - **`bounds` is a tight AABB** (rotation-aware), never a broadphase box.
 * - **Creation and insertion are separate.** `createBox` returns a body that
 *   is not simulated until `add`; backends that cannot build a body outside
 *   a world buffer the spec and materialize it in `add`.
 * - **Reads are snapshots or read-only views; writes are methods.** Mutating
 *   a returned object (e.g. `collisionFilter`) is never part of the contract.
 * - **`raycast` returns all bodies crossing the segment**, unordered — it
 *   answers "is anything in the way", not "what is nearest".
 *
 * `test/physics.test.js` is this contract written as executable, tolerance-
 * based tests, run against every registered backend.
 */

import { MatterPhysicsWorld } from './matterBackend.js';

export { PhysicsWorldBase } from './worldBase.js';

/** The backend games get when they don't ask for one. */
export const DEFAULT_PHYSICS = 'rapier';

/** Loaded backend constructors. Matter is always available. */
const backends = new Map([['matter', MatterPhysicsWorld]]);

/** What `createPhysicsWorld` uses when options don't name a backend. */
let activeBackend = 'matter';

function physicsOverrideFromURL() {
  if (typeof location === 'undefined' || !location.search) return null;
  return new URLSearchParams(location.search).get('physics');
}

/**
 * Load and initialize a physics backend, and make it the default for
 * subsequent `createPhysicsWorld` calls. Await once before constructing M2D.
 *
 * With no argument this resolves the game's choice: the `?physics=` URL
 * override if present, otherwise DEFAULT_PHYSICS. Matter initializes
 * instantly; Rapier compiles its WASM module here (and is fetched only here,
 * so games that never init stay light).
 *
 * @param {'rapier'|'matter'} [name]
 * @returns {Promise<string>} The backend that became active.
 */
export async function initPhysics(name) {
  const requested = name ?? physicsOverrideFromURL() ?? DEFAULT_PHYSICS;

  if (requested === 'rapier' && !backends.has('rapier')) {
    const rapier = await import('./rapierBackend.js');
    await rapier.init();
    backends.set('rapier', rapier.RapierPhysicsWorld);
  }

  if (!backends.has(requested)) {
    throw new Error(`M2D: unknown physics backend '${requested}' (rapier, matter)`);
  }
  activeBackend = requested;
  return requested;
}

/**
 * Create the physics world for a game, using the active backend.
 * @param {object} [options]
 * @param {'rapier'|'matter'} [options.backend] - Override the active backend
 *   for this world; it must already be loaded via `initPhysics`.
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
  const { backend = activeBackend, ...rest } = options;
  const Backend = backends.get(backend);
  if (!Backend) {
    throw new Error(`M2D: physics backend '${backend}' is not loaded — await initPhysics('${backend}') first`);
  }
  return new Backend(rest);
}
