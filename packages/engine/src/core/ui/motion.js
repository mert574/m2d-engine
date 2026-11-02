/**
 * Tweens for UI.
 *
 * ## Why the UI needs its own driver
 *
 * Entities move because physics moves them. UI does not: a panel sliding in,
 * a button settling after a press and a menu fading out are all *authored*
 * motion over wall-clock time. Without somewhere to put it, every component
 * grows its own timer and its own easing, and the engine ends up with five
 * slightly different ideas of what 200 milliseconds feels like.
 *
 * This is the one place that interpolates, and the theme is the one place
 * that decides how long and with what curve (`$motion.duration.*`,
 * `$motion.easing.*`), so a game can change the feel of every transition at
 * once.
 *
 * ## It runs while the game is paused
 *
 * `game.motion` is ticked from the engine loop outside the `paused` gate,
 * for the same reason the UI tree is: the pause menu animating itself in is
 * the thing the player is looking at, and freezing it along with the
 * simulation is what makes a pause look like a hang.
 *
 * ## One tween per property
 *
 * Starting a tween on a property that is already animating cancels the
 * earlier one *for that property only*. Two animations fighting over the
 * same number is never what anyone wants — a menu told to fade out while it
 * is still fading in should reverse, not flicker — while a tween on
 * `opacity` has no quarrel with one on `offsetY`.
 */

/** Tweening a property that is not a finite number is a no-op, loudly. */
function readNumber(target, property) {
  const value = target[property];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * One animation: a set of properties on one object, over one duration.
 *
 * Created by `MotionManager`; not constructed directly.
 */
export class Tween {
  constructor(manager, target, properties, options = {}) {
    this.manager = manager;
    this.target = target;
    /** @type {Array<{property: string, from: number, to: number}>} */
    this.tracks = [];
    this.duration = options.duration ?? 0;
    this.delay = options.delay ?? 0;
    this.easing = options.easing ?? ((t) => t);
    this.onUpdate = options.onUpdate ?? null;
    this.onComplete = options.onComplete ?? null;

    this.elapsed = 0;
    this.done = false;
    this.cancelled = false;

    for (const [property, to] of Object.entries(properties)) {
      const from = options.from?.[property] ?? readNumber(target, property);
      if (from === null) {
        console.warn(`M2D motion: '${property}' is not a number on the target; skipping`);
        continue;
      }
      this.tracks.push({ property, from, to });
      // Applied now, not on the first update. An entrance that waited a
      // frame would show one frame of the final state before jumping back
      // to the start of its own animation.
      target[property] = from;
    }

    /**
     * Resolves when the tween finishes or is cancelled.
     *
     * Deliberately resolved with nothing. A tween is itself *thenable*, so
     * resolving this with `this` would make the promise adopt the tween's
     * own `then`, which returns this same promise — it would never settle.
     */
    this.finished = new Promise((resolve) => { this.#settle = resolve; });
  }

  #settle;

  /** Property names this tween writes. */
  get properties() {
    return this.tracks.map((track) => track.property);
  }

  /**
   * Advance by one frame.
   * @param {number} deltaTime - Seconds
   * @returns {boolean} Whether the tween is still running
   */
  update(deltaTime) {
    if (this.done) return false;

    if (this.delay > 0) {
      this.delay -= deltaTime;
      if (this.delay > 0) return true;
      // Spend whatever of this frame was left after the delay ran out, so a
      // staggered sequence does not quantise to frame boundaries.
      deltaTime = -this.delay;
      this.delay = 0;
    }

    this.elapsed += deltaTime;
    const linear = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1;
    const eased = this.easing(linear);

    for (const { property, from, to } of this.tracks) {
      this.target[property] = from + (to - from) * eased;
    }
    this.onUpdate?.(eased, this.target);

    if (linear < 1) return true;
    this.#complete();
    return false;
  }

  /** Jump to the end and run the completion callback. */
  finish() {
    if (this.done) return this;
    for (const { property, to } of this.tracks) this.target[property] = to;
    this.#complete();
    return this;
  }

  /** Stop where it is. The completion callback does not run. */
  cancel() {
    if (this.done) return this;
    this.done = true;
    this.cancelled = true;
    this.manager?.forget(this);
    this.#settle();
    return this;
  }

  #complete() {
    this.done = true;
    this.manager?.forget(this);
    this.onComplete?.(this.target);
    this.#settle();
  }

  /**
   * Add a callback to run the instant this tween completes.
   *
   * Synchronous, unlike `then`: anything that has to be true before the
   * next line of the same frame — a screen marking itself open, a stack
   * detaching it — cannot wait for a microtask.
   * @param {(target: object) => void} callback
   */
  whenComplete(callback) {
    const prior = this.onComplete;
    this.onComplete = (target) => {
      prior?.(target);
      callback(target);
    };
    return this;
  }

  /** Thenable, so a sequence of transitions can be awaited. */
  then(onFulfilled, onRejected) {
    return this.finished.then(onFulfilled, onRejected);
  }
}

export class MotionManager {
  /**
   * @param {import('../m2d.js').M2D} game
   */
  constructor(game) {
    this.game = game;
    /** @type {Set<Tween>} */
    this.tweens = new Set();
  }

  /** How many tweens are running. */
  get activeCount() {
    return this.tweens.size;
  }

  /**
   * Animate properties to new values.
   *
   * @param {object} target - Any object with numeric properties
   * @param {Record<string, number>} properties - Final values
   * @param {Object} [options]
   * @param {number|string} [options.duration='$motion.duration.normal'] -
   *   Seconds, or a motion token
   * @param {number|string} [options.delay=0] - Seconds, or a motion token
   * @param {Function|string} [options.easing='$motion.easing.standard'] -
   *   An easing function, or a motion token naming one
   * @param {Record<string, number>} [options.from] - Starting values;
   *   defaults to the target's current ones
   * @param {(progress: number, target: object) => void} [options.onUpdate]
   * @param {(target: object) => void} [options.onComplete]
   * @returns {Tween}
   */
  to(target, properties, options = {}) {
    const tween = new Tween(this, target, properties, {
      ...options,
      duration: this.#seconds(options.duration, '$motion.duration.normal'),
      delay: this.#seconds(options.delay, 0),
      easing: this.#easing(options.easing)
    });

    // Whatever was animating these properties loses them.
    this.cancel(target, tween.properties);

    if (tween.tracks.length === 0) {
      tween.finish();
      return tween;
    }
    this.tweens.add(tween);
    return tween;
  }

  /**
   * Animate *from* given values to wherever the target already is. The usual
   * shape of an entrance: the final layout is the truth, and the animation
   * is an offset from it that disappears.
   */
  from(target, properties, options = {}) {
    const to = {};
    for (const property of Object.keys(properties)) {
      to[property] = readNumber(target, property) ?? 0;
    }
    return this.to(target, to, { ...options, from: properties });
  }

  /** Explicit both ends, for when the target is not already where it should end. */
  fromTo(target, from, to, options = {}) {
    return this.to(target, to, { ...options, from });
  }

  /**
   * The same animation across many targets, each starting a little after the
   * last. A menu whose items arrive in sequence rather than all at once is
   * the cheapest thing that makes it feel considered.
   *
   * @param {Iterable<object>} targets
   * @param {Record<string, number>} properties
   * @param {Object} [options] - `to` options, plus:
   * @param {number|string} [options.stagger='$motion.duration.fast'] - Delay
   *   added per target
   * @param {'forward'|'reverse'} [options.order='forward']
   * @returns {Tween[]}
   */
  stagger(targets, properties, options = {}) {
    const list = [...targets];
    if (options.order === 'reverse') list.reverse();
    const step = this.#seconds(options.stagger, '$motion.duration.fast');
    const base = this.#seconds(options.delay, 0);

    return list.map((target, index) =>
      this.to(target, properties, { ...options, delay: base + index * step }));
  }

  /**
   * Stop tweens on a target.
   * @param {object} target
   * @param {string[]} [properties] - Only these; all of them if omitted
   */
  cancel(target, properties = null) {
    for (const tween of [...this.tweens]) {
      if (tween.target !== target) continue;
      if (!properties) {
        tween.cancel();
        continue;
      }
      // Drop just the contested tracks, so an entrance animating `offsetY`
      // survives a separate fade taking over `opacity`.
      tween.tracks = tween.tracks.filter((track) => !properties.includes(track.property));
      if (tween.tracks.length === 0) tween.cancel();
    }
  }

  /** Jump every tween on a target to its end. */
  finish(target) {
    for (const tween of [...this.tweens]) {
      if (tween.target === target) tween.finish();
    }
  }

  /** Whether anything is animating this target. */
  isAnimating(target) {
    for (const tween of this.tweens) {
      if (tween.target === target) return true;
    }
    return false;
  }

  /** Internal: a tween reporting that it is over. */
  forget(tween) {
    this.tweens.delete(tween);
  }

  /**
   * Advance every tween.
   * @param {number} deltaTime - Seconds
   */
  update(deltaTime) {
    if (this.tweens.size === 0) return;
    // A snapshot: a completion callback is allowed to start the next tween.
    for (const tween of [...this.tweens]) tween.update(deltaTime);
  }

  /** Cancel everything. */
  destroy() {
    for (const tween of [...this.tweens]) tween.cancel();
    this.tweens.clear();
  }

  /** Resolve a duration that may be a token. */
  #seconds(value, fallback) {
    const resolved = this.game?.theme?.resolve(value ?? fallback) ?? (value ?? fallback);
    return typeof resolved === 'number' ? resolved : 0;
  }

  /** Resolve an easing that may be a token or a function. */
  #easing(value) {
    if (typeof value === 'function') return value;
    const resolved = this.game?.theme?.resolve(value ?? '$motion.easing.standard');
    return typeof resolved === 'function' ? resolved : ((t) => t);
  }
}
