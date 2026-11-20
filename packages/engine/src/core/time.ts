/**
 * The engine's clocks, its fixed-step tick and its scheduler, mounted as
 * `game.time`.
 *
 * ## Two clocks
 *
 * A game has two different ideas of "how much time passed". *Game time*
 * stops when the game is paused and stretches under slow motion: it is what
 * a cooldown, a spawn interval or a "level complete" delay should count. The
 * *unscaled* clock is wall time as seen by the frame loop: it keeps going
 * through a pause and ignores the time scale, which is what a menu
 * animating over a frozen game wants.
 *
 * ## The simulation tick
 *
 * Game time is spent in whole steps of `fixedTimestep`. Each frame `tick`
 * adds the frame's game-time delta to an accumulator and runs as many fixed
 * steps as it paid for, calling the `step` callback once per step with the
 * constant dt. The engine's callback is `game.fixedUpdate`: input sampling,
 * entity and constraint `fixedUpdate`, due timers, then one physics step.
 *
 * That is what makes the simulation independent of the frame rate. A
 * machine drawing 144 frames a second and one drawing 30 both run exactly
 * 60 ticks of 1/60 s per second of game time, in the same order, with the
 * same dt. Only how the result is *presented* differs: the remainder left in
 * the accumulator is the `interpolation` fraction bodies draw with, so the
 * faster display still shows smooth motion between ticks.
 *
 * `elapsed` therefore advances in tick-sized increments and `steps` counts
 * them. `delta` is the frame's game-time delta, for per-frame presentation
 * that should still slow down in slow motion (an animation cycle, a glow).
 *
 * Nothing in here reads `performance.now()`: the loop feeds in the frame
 * delta, so the same class runs in a test with hand-fed deltas and in a loop
 * that corrects its clock against a server.
 *
 * ## Why game code should not use the wall clock
 *
 * `performance.now()` and `setTimeout` do not know about `game.paused`, the
 * time scale or ticks. A banner timed with the former keeps counting under
 * the pause menu; a respawn scheduled with the latter fires into a frozen
 * game. `after` and `every` run on game time by default and fire on tick
 * boundaries, so they freeze, stretch and replay with everything else;
 * `{ unscaled: true }` opts one onto the wall clock when that is what it
 * means.
 *
 * ## Deadlines, not countdowns
 *
 * A timer stores the clock reading it fires at. Nothing is decremented per
 * frame, so a timer's state is one number comparable against the clock —
 * which is what makes it serialisable, rewindable and robust against a loop
 * that later nudges the clock to agree with a remote one.
 */

/**
 * Slack in the accumulator comparison. Summing and subtracting timesteps
 * leaves the accumulator a few ulps short of a whole step, which without
 * this would silently skip that step and let simulated time drift behind
 * real time.
 */
const STEP_EPSILON = 1e-9;

/** Validate a seconds argument where NaN or a negative would silently misfire. */
function checkSeconds(name: string, seconds: number): void {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`M2D time: ${name} needs a non-negative number of seconds, got ${seconds}`);
  }
}

/** What `tick` takes besides the delta. */
export interface TickOptions {
  /**
   * Hold game time still: no ticks, no game-time timers. The unscaled
   * clock, the frame counter and unscaled timers run regardless.
   */
  paused?: boolean;
  /**
   * Run once per tick with the fixed dt, after `elapsed` and `steps` have
   * advanced and the game-time timers due at that tick have fired.
   * Returning `false` ends the frame's ticks there and drops the rest of
   * the accumulator, which is how the engine stops ticking a scene that is
   * being left.
   */
  step?: (dt: number) => boolean | void;
}

/**
 * One scheduled callback. Created by `Time.after` / `Time.every`; not
 * constructed directly.
 */
export class Timer {
  time: Time;
  /** Clock reading the timer fires at. */
  at: number;
  /** Seconds between repeats; 0 for a one-shot. */
  interval: number;
  callback: () => void;
  /** Count the wall clock instead of game time. */
  unscaled: boolean;
  /** False once cancelled or, for a one-shot, once fired. */
  active: boolean;
  /** How many times the callback has run. */
  fired: number;

  constructor(time: Time, at: number, interval: number, callback: () => void, unscaled: boolean) {
    this.time = time;
    this.at = at;
    this.interval = interval;
    this.callback = callback;
    this.unscaled = unscaled;
    this.active = true;
    this.fired = 0;
  }

  /** The clock this timer is measured against. */
  get clock(): number {
    return this.unscaled ? this.time.unscaledElapsed : this.time.elapsed;
  }

  /** Seconds until the next firing on its clock; 0 once inactive. */
  get remaining(): number {
    return this.active ? Math.max(0, this.at - this.clock) : 0;
  }

  /** Stop the timer. Idempotent. A cancelled timer never fires again. */
  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.time.timers.delete(this);
  }
}

export class Time {
  /** Seconds per simulation tick. Every `fixedUpdate` and every physics step sees exactly this. */
  fixedTimestep: number;
  /**
   * Most ticks one frame may run. Bounds catch-up work after a stall so a
   * slow frame cannot cascade into slower ones; the backlog past it is
   * dropped.
   */
  maxSubSteps: number;
  /**
   * Longest frame `tick` will account for, in seconds. A tab left in the
   * background returns with a multi-second delta; clamping it is what keeps
   * that from becoming one enormous catch-up.
   */
  maxDelta: number;
  /** Seconds of game time this frame: scaled, and 0 while paused. */
  delta: number;
  /** Seconds of wall time this frame, after the `maxDelta` clamp. */
  unscaledDelta: number;
  /**
   * Simulation time since start or the last `reset`, in seconds. Advances
   * by `fixedTimestep` per tick, so it is always `steps × fixedTimestep`.
   */
  elapsed: number;
  /** Wall time since start or the last `reset`, in seconds. */
  unscaledElapsed: number;
  /** Frames ticked. */
  frame: number;
  /**
   * Simulation ticks run. The simulation's own clock: the number netcode,
   * replays and snapshots key on.
   */
  steps: number;
  /** Game time paid in but not yet spent on a whole tick. */
  accumulator: number;
  /** Whether the last `tick` was a paused one. */
  paused: boolean;
  /** True while a tick runs: its game-time timers and its step callback. */
  inStep: boolean;
  timers: Set<Timer>;

  constructor(options: { scale?: number; fixedTimestep?: number; maxSubSteps?: number; maxDelta?: number } = {}) {
    this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 6;
    this.maxDelta = options.maxDelta ?? 0.1;
    this.#scale = 1;
    this.scale = options.scale ?? 1;

    this.delta = 0;
    this.unscaledDelta = 0;
    this.elapsed = 0;
    this.unscaledElapsed = 0;
    this.frame = 0;
    this.steps = 0;
    this.accumulator = 0;
    this.paused = false;
    this.inStep = false;

    this.timers = new Set();
  }

  #scale: number;

  /**
   * Multiplier on game time. 1 is real time, 0.5 slow motion, 0 freezes
   * game time without pausing. Slow motion means fewer ticks per second;
   * each tick's dt never changes. The physics world reads this through its
   * own `timeScale`, so there is one knob.
   */
  get scale(): number {
    return this.#scale;
  }

  set scale(value: number) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`M2D time: scale needs a non-negative number, got ${value}`);
    }
    this.#scale = value;
  }

  /** `fixedTimestep` under the name game code reads inside a tick. */
  get fixedDelta(): number {
    return this.fixedTimestep;
  }

  /**
   * How far the current frame sits between the last tick and the next, in
   * [0, 1]. Bodies blend by this to draw smoothly on displays faster than
   * the tick rate.
   */
  get interpolation(): number {
    return Math.min(1, this.accumulator / this.fixedTimestep);
  }

  /**
   * Advance one frame: both clocks, the ticks the frame paid for and the
   * timers that came due.
   *
   * `rawDelta` is wall seconds since the previous tick, clamped to
   * `maxDelta`. Returns the ticks run this frame.
   */
  tick(rawDelta: number, { paused = false, step }: TickOptions = {}): number {
    const unscaled = Math.min(Math.max(0, rawDelta || 0), this.maxDelta);
    this.paused = paused;
    this.unscaledDelta = unscaled;
    this.unscaledElapsed += unscaled;
    this.delta = paused ? 0 : unscaled * this.#scale;
    this.frame += 1;

    // Wall-time timers are presentation and fire per frame.
    this.#fireDue(true);

    if (paused) return 0;
    this.accumulator += this.delta;
    return this.#runSteps(step);
  }

  /**
   * Run exactly one tick regardless of the accumulator: a debugger's step
   * button, or a loop that drives ticks itself (a replay, a lockstep peer).
   * Returns what the step callback returned.
   */
  stepOnce(step?: (dt: number) => boolean | void): boolean | void {
    return this.#step(step);
  }

  /** Spend the accumulator in whole ticks, up to the budget. */
  #runSteps(step?: (dt: number) => boolean | void): number {
    const dt = this.fixedTimestep;
    let ticks = 0;
    while (this.accumulator + STEP_EPSILON >= dt && ticks < this.maxSubSteps) {
      this.accumulator -= dt;
      const proceed = this.#step(step);
      ticks++;
      if (proceed === false) {
        this.accumulator = 0;
        return ticks;
      }
    }
    // Over budget: drop the backlog instead of letting it grow without bound.
    if (this.accumulator + STEP_EPSILON >= dt) this.accumulator = 0;
    return ticks;
  }

  #step(step?: (dt: number) => boolean | void): boolean | void {
    this.elapsed += this.fixedTimestep;
    this.steps += 1;
    this.inStep = true;
    try {
      // Timers before the callback: a timer due this tick observes the
      // world as it was at the end of the previous one, and whatever it
      // spawns is simulated by this tick like anything else.
      this.#fireDue(false);
      return step?.(this.fixedTimestep);
    } finally {
      this.inStep = false;
    }
  }

  /**
   * Run a callback once after `seconds` of game time, on the first tick at
   * or past the deadline. `unscaled` counts wall time instead, so the
   * timer runs through a pause, ignores the time scale and fires per frame
   * rather than per tick.
   */
  after(seconds: number, callback: () => void, { unscaled = false }: { unscaled?: boolean } = {}): Timer {
    checkSeconds('after', seconds);
    return this.#schedule(seconds, 0, callback, unscaled);
  }

  /**
   * Run a callback every `seconds` of game time until cancelled. `seconds`
   * must be greater than 0.
   *
   * An interval shorter than a tick fires once per tick and realigns to the
   * clock, so a stalled frame produces one call per tick, not a burst.
   */
  every(seconds: number, callback: () => void, { unscaled = false }: { unscaled?: boolean } = {}): Timer {
    checkSeconds('every', seconds);
    if (seconds === 0) throw new Error('M2D time: every() needs an interval greater than 0');
    return this.#schedule(seconds, seconds, callback, unscaled);
  }

  /**
   * `after` as a promise, for sequencing with `await`.
   *
   * Resolves `true` when the delay elapses and `false` if the timer is
   * cancelled or cleared first, so an awaiting sequence can stop cleanly on
   * a scene switch instead of hanging.
   *
   * The timer fires on a tick, but the code after `await` runs once the
   * whole frame has finished, after however many more ticks that frame
   * ran. Use it for presentation and scene flow (a banner, a switch). Code
   * that changes the simulation belongs in an `after` callback.
   */
  wait(seconds: number, options: { unscaled?: boolean } = {}): Promise<boolean> & { timer: Timer } {
    let timer!: Timer;
    const promise = new Promise<boolean>((resolve) => {
      timer = this.after(seconds, () => resolve(true), options);
      const cancel = timer.cancel.bind(timer);
      timer.cancel = () => {
        const wasActive = timer.active;
        cancel();
        if (wasActive) resolve(false);
      };
    });
    return Object.assign(promise, { timer });
  }

  /** Cancel every timer. The clocks are untouched. */
  clear(): void {
    for (const timer of [...this.timers]) timer.cancel();
  }

  /** Number of timers waiting to fire. */
  get activeCount(): number {
    return this.timers.size;
  }

  /**
   * Zero both clocks, the counters and the accumulator, and drop every
   * timer. The time scale and the step settings survive. The engine calls
   * this from `game.reset()`.
   */
  reset(): void {
    this.clear();
    this.delta = 0;
    this.unscaledDelta = 0;
    this.elapsed = 0;
    this.unscaledElapsed = 0;
    this.frame = 0;
    this.steps = 0;
    this.accumulator = 0;
    this.paused = false;
  }

  #schedule(seconds: number, interval: number, callback: () => void, unscaled: boolean): Timer {
    if (typeof callback !== 'function') {
      throw new Error('M2D time: a timer needs a callback function');
    }
    const now = unscaled ? this.unscaledElapsed : this.elapsed;
    const timer = new Timer(this, now + seconds, interval, callback, unscaled);
    this.timers.add(timer);
    return timer;
  }

  /**
   * Fire what is due on one clock, earliest deadline first. Timers created
   * inside a callback are not considered until the next pass: their
   * deadline is measured from a clock that has already moved on, and
   * running them now would let a zero-delay timer re-arm itself forever.
   */
  #fireDue(unscaled: boolean): void {
    if (this.timers.size === 0) return;
    const due: Timer[] = [];
    for (const timer of this.timers) {
      if (timer.unscaled === unscaled && timer.at <= timer.clock + STEP_EPSILON) due.push(timer);
    }
    if (due.length === 0) return;
    due.sort((a, b) => a.at - b.at);

    for (const timer of due) {
      if (!timer.active) continue; // cancelled by an earlier callback this pass
      if (timer.interval > 0) {
        timer.at += timer.interval;
        // Fell more than one interval behind (a stalled frame, or an
        // interval shorter than a tick): realign instead of bursting.
        if (timer.at <= timer.clock + STEP_EPSILON) timer.at = timer.clock + timer.interval;
      } else {
        timer.active = false;
        this.timers.delete(timer);
      }
      timer.fired += 1;
      timer.callback();
    }
  }
}
