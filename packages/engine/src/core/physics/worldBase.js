/**
 * The solver-independent half of a physics world: the fixed-step clock, the
 * interpolation alpha it produces, and the collision-handler bookkeeping.
 *
 * Kept apart from the solver because it is pure timing arithmetic — it holds
 * simulated time to whole constant-size steps regardless of frame rate, and
 * is worth reading and testing without Rapier in the picture. `RapierBody`'s
 * world extends this and supplies the rest: body creation, the actual solver
 * step (`stepOnce`), queries and lifecycle. See ./index.js for the contract.
 *
 * Inside the engine the clock is not this world's own: it is `game.time`,
 * passed as `clock`, and the step settings, the time scale and the
 * accumulator all read through to it. The engine loop runs the tick (see
 * `Time.tick` and `M2D.fixedUpdate`) and calls `step` once per tick, so
 * gameplay and the solver advance together. `advance` stays for a world
 * used on its own and for games driving physics directly.
 */
export class PhysicsWorldBase {
  /**
   * Slack in the accumulator comparison. Summing and subtracting timesteps
   * leaves the accumulator a few ulps short of a whole step, which without
   * this would silently skip that step and let simulated time drift behind
   * real time.
   */
  static STEP_EPSILON = 1e-9;

  /**
   * @param {object} [options]
   * @param {number} [options.fixedTimestep] - Seconds per solver step.
   * @param {number} [options.maxSubSteps] - Step budget per frame.
   * @param {number} [options.timeScale] - Multiplier on elapsed time.
   *   Ignored when `clock` is given.
   * @param {import('../time.js').Time} [options.clock] - The engine's
   *   `Time`. When set, `fixedTimestep`, `maxSubSteps`, `timeScale` and the
   *   accumulator all read and write the clock's, so the solver and the
   *   gameplay tick cannot disagree about any of them. `fixedTimestep`,
   *   `maxSubSteps` and `timeScale` here are then ignored.
   * @param {boolean} [options.interpolate] - Blend drawn transforms between
   *   steps. See PhysicsBody.renderPosition.
   */
  constructor(options = {}) {
    this.clock = options.clock ?? null;
    if (!this.clock) {
      this.own = {
        fixedTimestep: options.fixedTimestep ?? 1 / 60,
        maxSubSteps: options.maxSubSteps ?? 6,
        timeScale: options.timeScale ?? 1,
        /** Unspent real time, carried between frames. See `advance`. */
        accumulator: 0
      };
    }
    this.interpolate = options.interpolate ?? true;

    /** Collision callbacks, retained across `reset()`. */
    this.handlers = { onStart: null, onEnd: null };
  }

  /**
   * How many dimensions this world simulates in, 2 or 3. Engine code that
   * has to build a shape or read a rotation asks the world rather than
   * being told separately, so there is one answer and it cannot drift.
   * @abstract @type {2|3}
   */
  get dimensions() {
    throw new Error('PhysicsWorld must implement dimensions');
  }

  /**
   * Which way is up, as a unit vector: -y in 2D (screen coordinates grow
   * downward), +y in 3D (as all 3D content is). Shared code that needs to
   * tell a floor from a wall asks this rather than assuming an axis.
   * @abstract @type {{x: number, y: number, z?: number}}
   */
  get up() {
    throw new Error('PhysicsWorld must implement up');
  }

  /** Seconds per solver step. @type {number} */
  get fixedTimestep() { return this.clock ? this.clock.fixedTimestep : this.own.fixedTimestep; }
  set fixedTimestep(value) { if (this.clock) this.clock.fixedTimestep = value; else this.own.fixedTimestep = value; }

  /** Step budget per `advance`. @type {number} */
  get maxSubSteps() { return this.clock ? this.clock.maxSubSteps : this.own.maxSubSteps; }
  set maxSubSteps(value) { if (this.clock) this.clock.maxSubSteps = value; else this.own.maxSubSteps = value; }

  /** Game time paid in but not yet spent on a whole step. @type {number} */
  get accumulator() { return this.clock ? this.clock.accumulator : this.own.accumulator; }
  set accumulator(value) { if (this.clock) this.clock.accumulator = value; else this.own.accumulator = value; }

  /**
   * Multiplier on elapsed time. Delegates to the engine clock when one was
   * given, so `physics.timeScale` and `game.time.scale` are the same value.
   * @type {number}
   */
  get timeScale() {
    return this.clock ? this.clock.scale : this.own.timeScale;
  }

  set timeScale(value) {
    if (this.clock) this.clock.scale = value;
    else this.own.timeScale = value;
  }

  /**
   * Advance the simulation by `elapsed` seconds of real time, in whole steps
   * of `fixedTimestep`.
   *
   * The solver only ever sees a constant dt, which is what keeps resting
   * contacts stable — a variable dt changes effective restitution frame to
   * frame and reads as jitter. Leftover time is carried in the accumulator
   * and spent next frame, so uneven frame pacing still plays back smoothly.
   *
   * `maxSubSteps` caps the work per frame: if the simulation cannot keep up
   * it runs slow rather than spiralling, taking ever longer to catch up.
   *
   * Physics only. Inside the engine the loop runs `game.time.tick`, which
   * steps gameplay and physics together through `game.fixedUpdate`; a game
   * that owns its loop does the same. This is for a world used alone.
   *
   * @param {number} elapsed - Real seconds since the last frame.
   * @returns {number} Steps actually taken.
   */
  advance(elapsed) {
    const { STEP_EPSILON } = PhysicsWorldBase;
    const dt = this.fixedTimestep;
    const budget = this.maxSubSteps;
    this.accumulator += elapsed * this.timeScale;

    let steps = 0;
    while (this.accumulator + STEP_EPSILON >= dt && steps < budget) {
      this.step(dt);
      this.accumulator -= dt;
      steps++;
    }

    // Over budget: drop the backlog instead of letting it grow without bound.
    if (this.accumulator + STEP_EPSILON >= dt) this.accumulator = 0;

    return steps;
  }

  /**
   * How far the current frame sits between the last solver step and the next,
   * in [0, 1]. Bodies blend by this to draw smoothly on displays faster than
   * the solver; 1 means "draw the current state exactly".
   * @returns {number}
   */
  get interpolation() {
    if (!this.interpolate) return 1;
    return Math.min(1, this.accumulator / this.fixedTimestep);
  }

  /**
   * Run one solver step. Prefer `advance`, which handles the fixed-step
   * bookkeeping; this is for tests and for games driving physics themselves.
   * @param {number} dt - Seconds.
   */
  step(dt) {
    // Snapshot before solving, so every body has a before/after pair to
    // interpolate between for the frames that fall between steps. This walks
    // the live set rather than `bodies`, whose defensive copy would allocate
    // an array per step — up to `maxSubSteps` of them per frame.
    if (this.interpolate) {
      for (const body of this.bodyIterator()) body.syncInterpolation();
    }
    this.stepOnce(dt);
  }

  /**
   * Install collision callbacks, replacing any already set. Both receive the
   * two bodies involved, in no particular order.
   * @param {{onStart?: (a, b) => void, onEnd?: (a, b) => void}} handlers
   */
  setCollisionHandlers({ onStart, onEnd } = {}) {
    this.handlers = { onStart: onStart ?? null, onEnd: onEnd ?? null };
    this.bindHandlers();
  }

  // Subclass obligations, beyond the creation/query/lifecycle methods the
  // contract lists:

  /** Run the solver for `dt` seconds. @abstract @param {number} dt */
  /**
   * Advance one body as a tick would, without stepping the world.
   *
   * For a client predicting its own avatar (see net/prediction.js): the
   * rest of the world is the server's and must not move, so the whole
   * solver cannot run. Only a body whose motion is entirely its own —
   * a character body, moved by its controller against the colliders around
   * it rather than by the solver — can be advanced alone, and the result is
   * the same one the server's tick produces from the same velocity.
   *
   * @param {object} body
   * @param {number} dt - Seconds; the tick's fixed timestep.
   * @returns {boolean} Whether the body was advanced. False means this body
   *   cannot be advanced on its own and must be drawn from the server.
   */
  advanceBody(body, dt) {
    return false;
  }

  stepOnce(dt) {
    throw new Error('PhysicsWorld must implement stepOnce()');
  }

  /** Attach `this.handlers` to the solver's event source. @abstract */
  bindHandlers() {
    throw new Error('PhysicsWorld must implement bindHandlers()');
  }

  /** @abstract @returns {import('./index.js').PhysicsBody[]} */
  get bodies() {
    throw new Error('PhysicsWorld must implement bodies');
  }

  /**
   * The same bodies as `bodies`, but as a live view that must not be
   * mutated while iterating. For internal per-step work only, where the
   * copy `bodies` makes would be pure garbage.
   * @abstract @returns {Iterable<import('./index.js').PhysicsBody>}
   */
  bodyIterator() {
    throw new Error('PhysicsWorld must implement bodyIterator()');
  }
}
