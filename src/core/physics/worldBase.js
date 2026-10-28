/**
 * Backend-independent half of a physics world: the fixed-step clock, the
 * interpolation alpha it produces, and the collision-handler bookkeeping.
 *
 * A backend extends this and supplies the parts only it can know — body
 * creation, the actual solver step (`stepOnce`), queries and lifecycle. See
 * ./index.js for the full contract and ./matterBackend.js for an example.
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
   * @param {boolean} [options.interpolate] - Blend drawn transforms between
   *   steps. See PhysicsBody.renderPosition.
   */
  constructor(options = {}) {
    this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 6;
    this.timeScale = options.timeScale ?? 1;
    this.interpolate = options.interpolate ?? true;

    /** Unspent real time, carried between frames. See `advance`. */
    this.accumulator = 0;
    /** Collision callbacks, retained across `reset()`. */
    this.handlers = { onStart: null, onEnd: null };
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
   * @param {number} elapsed - Real seconds since the last frame.
   * @returns {number} Steps actually taken.
   */
  advance(elapsed) {
    const { STEP_EPSILON } = PhysicsWorldBase;
    this.accumulator += elapsed * this.timeScale;

    let steps = 0;
    while (this.accumulator + STEP_EPSILON >= this.fixedTimestep && steps < this.maxSubSteps) {
      this.step(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      steps++;
    }

    // Over budget: drop the backlog instead of letting it grow without bound.
    if (this.accumulator + STEP_EPSILON >= this.fixedTimestep) this.accumulator = 0;

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
    // interpolate between for the frames that fall between steps.
    if (this.interpolate) {
      for (const body of this.bodies) body.syncInterpolation();
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

  // Backend obligations, beyond the creation/query/lifecycle methods the
  // contract lists:

  /** Run the solver for `dt` seconds. @abstract @param {number} dt */
  stepOnce(dt) {
    throw new Error('Physics backend must implement stepOnce()');
  }

  /** Attach `this.handlers` to the solver's event source. @abstract */
  bindHandlers() {
    throw new Error('Physics backend must implement bindHandlers()');
  }

  /** @abstract @returns {import('./index.js').PhysicsBody[]} */
  get bodies() {
    throw new Error('Physics backend must implement bodies');
  }
}
