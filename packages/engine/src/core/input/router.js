/**
 * Where an input event goes.
 *
 * Every event walks the same three bands, highest first:
 *
 *   1. **overlay** — engine-level UI drawn above everything (the settings
 *      menu). An overlay that is open sees input before anything else and
 *      consumes it, which is what makes it modal without any global capture
 *      listeners.
 *   2. **ui** — the current scene's screen-space elements.
 *   3. **world** — entities carrying the `Interactive` constraint, hit-tested
 *      in world coordinates.
 *
 * Anything a band hands the event to may call `event.consume()`, which stops
 * the descent. That single rule replaces the ad-hoc `stopPropagation` flag
 * the UI layer used to carry.
 *
 * ## Targets
 *
 * A *target* is anything with a `handleInput(event)` method: a `UIElement`,
 * an `Interactive` constraint, an overlay. The router resolves at most one
 * target per event — the topmost hit in the highest band that has one — so
 * two overlapping buttons never both fire.
 *
 * A drag is the exception: whatever `dragstart` landed on captures the rest
 * of the gesture and receives it without any further hit testing. Without
 * that, dragging quickly across the screen would hand the drag to whatever
 * the pointer flew over.
 *
 * ## World hit testing is opt-in and costs nothing unused
 *
 * With no `Interactive` entities registered the world band resolves to null
 * immediately and never asks physics anything. With them, one `queryPoint`
 * per event answers for all of them at once.
 */

/** Band order. Earlier bands see events first and can consume them. */
const BANDS = ['overlay', 'ui', 'world'];

/** Pointer types that have a hover state at all. A finger does not. */
const HOVER_TYPES = new Set(['mouse', 'pen']);

export class InputRouter {
  /**
   * @param {import('../m2d.js').M2D} game
   */
  constructor(game) {
    this.game = game;
    /** type -> Set<{handler, band}> */
    this.subscribers = new Map();
    /** Registered `Interactive` constraints. @type {Set<object>} */
    this.interactives = new Set();
    /** Whether any interactive needs a physics point query. */
    this.needsPhysicsQuery = false;
    /** The current scene's UI container, or null between scenes. */
    this.uiContainer = null;
    /** What the pointer is currently over, across all bands. */
    this.hovered = null;
  }

  // === Subscriptions ===

  /**
   * Listen for an event type.
   * @param {string} type - Event type, e.g. 'click' or 'pinch'
   * @param {(event: object) => void} handler
   * @param {Object} [options]
   * @param {'overlay'|'ui'|'world'} [options.band='world'] - Relative order
   *   among subscribers; all subscribers run after targets either way
   * @returns {() => void} Unsubscribe
   */
  on(type, handler, options = {}) {
    const entry = { handler, band: options.band || 'world' };
    let set = this.subscribers.get(type);
    if (!set) {
      set = new Set();
      this.subscribers.set(type, set);
    }
    set.add(entry);
    return () => {
      set.delete(entry);
      if (set.size === 0) this.subscribers.delete(type);
    };
  }

  /**
   * Whether anything at all would receive one of these event types. Gesture
   * recognizers ask before doing any work, and for pinch the answer also
   * decides whether a second finger joins a gesture or starts its own drag.
   * @param {...string} types
   */
  listening(...types) {
    for (const type of types) {
      if (this.subscribers.has(type)) return true;
      if (this.uiContainer?.handles(type)) return true;
      for (const interactive of this.interactives) {
        if (interactive.handles(type)) return true;
      }
    }
    return false;
  }

  // === Registration ===

  /** Point the UI band at the active scene's container. */
  setUIContainer(container) {
    if (this.uiContainer !== container) this.clearHover();
    this.uiContainer = container;
  }

  /** Add an `Interactive` constraint to the world band. */
  addInteractive(interactive) {
    this.interactives.add(interactive);
    this.#refreshQueryNeed();
  }

  /** Remove an `Interactive` constraint; also drops it as the hover target. */
  removeInteractive(interactive) {
    this.interactives.delete(interactive);
    if (this.hovered === interactive) this.hovered = null;
    this.#refreshQueryNeed();
  }

  #refreshQueryNeed() {
    this.needsPhysicsQuery = false;
    for (const interactive of this.interactives) {
      if (interactive.usesBodyShape) {
        this.needsPhysicsQuery = true;
        return;
      }
    }
  }

  // === Dispatch ===

  /**
   * Route one event through the bands.
   * @param {object} event - A built input event
   */
  dispatch(event) {
    // Overlays are modal: open ones take the event before any target gets a
    // chance at it, which is the whole of "the menu blocks the game".
    for (const overlay of this.game.overlays) {
      overlay.handleInput?.(event);
      if (event.consumed) return;
    }

    // Resolved before the subject runs, so a dragged entity's own onDrop can
    // already see what it landed on.
    if (event.type === 'drop') {
      event.dropTarget = this.#resolveTarget(event, event.subject);
    }

    const target = event.subject ?? this.#resolveTarget(event);
    event.target = target;
    if (target) {
      target.handleInput(event);
      if (event.consumed) return;
    }

    if (event.type === 'drop' && event.dropTarget && event.dropTarget !== target) {
      event.dropTarget.handleInput(event);
      if (event.consumed) return;
    }

    this.#notifySubscribers(event);
  }

  #notifySubscribers(event) {
    const set = this.subscribers.get(event.type);
    if (!set || set.size === 0) return;
    // Snapshot: a handler is allowed to unsubscribe itself, or anything else.
    const entries = [...set].sort(
      (a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band));
    for (const { handler } of entries) {
      handler(event);
      if (event.consumed) return;
    }
  }

  /**
   * The topmost thing under the event, searched band by band.
   * @param {object} event
   * @param {object} [exclude] - Target to skip (the subject of a drop)
   */
  #resolveTarget(event, exclude = null) {
    const element = this.uiContainer?.hitTest(event.ui.x, event.ui.y, exclude);
    if (element) return element;
    return this.#worldTarget(event, exclude);
  }

  #worldTarget(event, exclude) {
    if (this.interactives.size === 0) return null;

    // One query answers for every body-shaped interactive at once.
    let bodies = null;
    if (this.needsPhysicsQuery) {
      bodies = new Set(this.game.physics.queryPoint(event.world));
    }

    let best = null;
    let bestPriority = -Infinity;
    for (const interactive of this.interactives) {
      if (interactive === exclude || !interactive.active) continue;
      const hit = interactive.usesBodyShape
        ? bodies.has(interactive.entity.body)
        : interactive.containsWorld(event.world);
      if (!hit) continue;
      // `>=` so that, at equal priority, the most recently registered wins —
      // registration order is creation order, which is also draw order.
      if (interactive.priority >= bestPriority) {
        best = interactive;
        bestPriority = interactive.priority;
      }
    }
    return best;
  }

  // === Hover ===

  /**
   * Recompute what the pointer is over and fire enter/leave.
   *
   * Touch has no hover: a finger is either pressing something or not
   * touching the screen at all, and synthesising a hover from a tap leaves
   * every button it passed over stuck highlighted.
   *
   * @param {object} event - The move event driving the update
   * @param {(type: string, source: object, extra?: object) => object} makeEvent
   */
  updateHover(event, makeEvent) {
    if (!HOVER_TYPES.has(event.pointerType)) return;

    // An open overlay owns the pointer; anything under it is not hovered.
    for (const overlay of this.game.overlays) {
      if (overlay.capturesInput) {
        this.clearHover(makeEvent, event);
        return;
      }
    }

    const target = this.#resolveTarget(event);
    if (target === this.hovered) return;

    const previous = this.hovered;
    this.hovered = target;
    if (previous) previous.handleInput(makeEvent('hoverend', event));
    if (target) target.handleInput(makeEvent('hover', event));
  }

  /** Drop the hover target, telling it so when there is an event to build from. */
  clearHover(makeEvent = null, source = null) {
    if (!this.hovered) return;
    const previous = this.hovered;
    this.hovered = null;
    if (makeEvent && source) previous.handleInput(makeEvent('hoverend', source));
  }

  destroy() {
    this.subscribers.clear();
    this.interactives.clear();
    this.uiContainer = null;
    this.hovered = null;
  }
}
