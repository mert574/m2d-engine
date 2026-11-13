import { resolveTransition, transitionTiming } from './transitions.js';

/**
 * A UI scene's motion from its data: each element's `effects` (how it
 * enters, what it does while selected, how it leaves), the scene's
 * `stagger` between entrances, and its `transition` as a whole. What a
 * hand-written menu screen did in code — a column sliding in, items
 * lighting up one after another, the selected line shaking — chosen per
 * element in the document, so two games' menus can move differently
 * without either writing a screen.
 *
 * Presentation over wall time, through `game.motion`: it runs while the
 * game is paused, and never in edit mode, where the editor shows every
 * element at rest.
 *
 * ## The resting values are the truth
 *
 * An entrance animates *from* an offset back to where the document puts
 * the element, and a select effect is added to the document's position,
 * never accumulated — so no effect can shift where an element ends up.
 */

/** How far a sliding element travels, in UI units. */
const SLIDE = 56;
const DROP = 90;

/** A little past the end and back: an element that drops in and settles. */
const settle = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/** Where each motion starts an entering element (or ends a leaving one), from its resting values. */
const MOTION_OFFSETS = {
  fade: () => ({ opacity: 0 }),
  'slide-up': (rest) => ({ opacity: 0, offsetY: rest.y + SLIDE }),
  'slide-down': (rest) => ({ opacity: 0, offsetY: rest.y - SLIDE }),
  'slide-left': (rest) => ({ opacity: 0, offsetX: rest.x + SLIDE }),
  'slide-right': (rest) => ({ opacity: 0, offsetX: rest.x - SLIDE }),
  scale: () => ({ opacity: 0, scaleX: 0.85, scaleY: 0.85 }),
  drop: (rest) => ({ opacity: 0, offsetY: rest.y - DROP })
};

/** Longest a scene waits for its exits before switching anyway. */
const MAX_EXIT = 1.5;

export class SceneEffects {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {object} config - The UI scene document, loaded
   * @param {Map<string, import('./uiElement.js').UIElement>} built - Element by id
   * @param {import('./uiElement.js').UIElement} root - The scene's container
   */
  constructor(game, config, built, root) {
    this.game = game;
    this.config = config;
    this.root = root;
    /** Each element with effects, with its resting position and its select state. */
    this.entries = (config.elements ?? [])
      .filter((element) => element.effects && built.has(element.id))
      .map((element) => ({
        element: built.get(element.id),
        effects: element.effects,
        rest: { x: element.x ?? 0, y: element.y ?? 0 },
        amount: 0,
        shake: 0,
        time: 0
      }));
  }

  get #motion() {
    return this.game.motion;
  }

  /** Play the scene's transition and every element's entrance, staggered in document order. */
  enter() {
    const timing = transitionTiming(this.game.theme, { duration: this.config.transition?.duration });
    resolveTransition(this.config.transition?.enter ?? 'none').enter(this.root, this.#motion, timing);
    const stagger = this.config.stagger ?? 0;
    let step = 0;
    for (const entry of this.entries) {
      const enter = entry.effects.enter;
      if (!enter) continue;
      this.#play(entry, enter, { delay: (enter.delay ?? 0) + stagger * step, entering: true });
      step++;
    }
  }

  /**
   * Play every exit and the scene's leaving transition; resolves when
   * they are done (or after a moment, whatever happens), so the switch
   * that asked can go on. Null when nothing leaves.
   * @returns {Promise<void>|null}
   */
  exit() {
    const waits = [];
    const timing = transitionTiming(this.game.theme, { duration: this.config.transition?.duration });
    const leaving = resolveTransition(this.config.transition?.exit ?? 'none').exit(this.root, this.#motion, timing);
    if (leaving) waits.push(leaving);
    for (const entry of this.entries) {
      const exit = entry.effects.exit;
      if (exit) waits.push(this.#play(entry, exit, { delay: exit.delay ?? 0, entering: false }));
    }
    if (!waits.length) return null;
    return Promise.race([
      Promise.all(waits.map((tween) => new Promise((resolve) => tween.whenComplete?.(resolve) ?? resolve()))),
      new Promise((resolve) => this.game.time?.after?.(MAX_EXIT, resolve, { unscaled: true }) ?? setTimeout(resolve, MAX_EXIT * 1000))
    ]).then(() => undefined);
  }

  /** One motion on one element; returns the tween to wait on. */
  #play(entry, { motion, duration }, { delay, entering }) {
    const element = entry.element;
    const seconds = duration ?? 0.32;
    if (motion === 'type') return this.#type(element, seconds, delay, entering);
    const offsets = (MOTION_OFFSETS[motion] ?? MOTION_OFFSETS.fade)(entry.rest);
    const easing = motion === 'drop' && entering ? settle : undefined;
    return entering
      ? this.#motion.from(element, offsets, { duration: seconds, delay, ...(easing && { easing }) })
      : this.#motion.to(element, offsets, { duration: seconds, delay });
  }

  /** Type an element's text out (or erase it), a character at a time. */
  #type(element, seconds, delay, entering) {
    if (typeof element.text !== 'string') return null;
    const full = element.typedText ?? element.text;
    element.typedText = full;
    const progress = { shown: entering ? 0 : full.length };
    if (entering) element.text = '';
    return this.#motion.to(progress, { shown: entering ? full.length : 0 }, {
      duration: seconds, delay, easing: (t) => t,
      onUpdate: () => { element.text = full.slice(0, Math.round(progress.shown)); }
    });
  }

  /** One frame: each element's select effect follows whether it is selected. */
  update(deltaTime) {
    for (const entry of this.entries) {
      const effect = entry.effects.select;
      if (!effect || effect === 'none') continue;
      const element = entry.element;
      // An entrance still running owns the element's position and scale.
      if (this.#motion.isAnimating(element)) continue;
      const selected = element.isSelected ?? ((element.isHovered || element.isFocused) && element.enabled !== false);
      const target = selected ? 1 : 0;
      if (selected && entry.amount < 0.5 && effect === 'shake') entry.shake = 0.35;
      entry.amount += (target - entry.amount) * (1 - Math.pow(0.002, deltaTime));
      entry.time += deltaTime;
      entry.shake = Math.max(0, entry.shake - deltaTime);
      this.#apply(entry, effect);
    }
  }

  #apply(entry, effect) {
    const element = entry.element;
    const { amount, rest } = entry;
    switch (effect) {
      case 'glow':
        element.glow = amount;
        break;
      case 'shake':
        element.offsetX = rest.x + Math.sin(entry.time * 70) * 5 * (entry.shake / 0.35);
        break;
      case 'pulse': {
        const scale = 1 + 0.05 * amount * (0.5 + 0.5 * Math.sin(entry.time * 6));
        element.scaleX = scale;
        element.scaleY = scale;
        break;
      }
      case 'lift':
        element.offsetY = rest.y - 6 * amount;
        break;
      default:
        break;
    }
  }
}
