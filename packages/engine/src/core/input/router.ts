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

import type { M2D } from '../m2d.js';
import type { Interactive } from '../../constraints/interactive.ts';

/** Anything input can land on: a UI element, an Interactive, an overlay. */
export interface InputTarget {
  handleInput(event: RoutedEvent): void;
}

/**
 * A built input event as the router sees it. The input manager builds the
 * full shape (core/input/inputManager, JavaScript until later this phase);
 * these are the members routing itself reads and writes.
 */
export interface RoutedEvent {
  type: string;
  pointerType?: string;
  ui: { x: number; y: number };
  world: { x: number; y: number; z?: number };
  consumed: boolean;
  consume(): void;
  /** A capture's owner: the drag's subject receives the gesture unresolved. */
  subject?: InputTarget | null;
  target?: InputTarget | null;
  dropTarget?: InputTarget | null;
  handledByUI?: boolean;
  [key: string]: unknown;
}

/** The scene UI container's side of the router. */
interface UIContainerLike {
  hitTest(x: number, y: number, exclude?: InputTarget | null): InputTarget | null;
  treeHandles(type: string): boolean;
}

type Band = 'overlay' | 'ui' | 'world';

/** Band order. Earlier bands see events first and can consume them. */
const BANDS: Band[] = ['overlay', 'ui', 'world'];

/** Pointer types that have a hover state at all. A finger does not. */
const HOVER_TYPES = new Set(['mouse', 'pen']);

type Subscriber = { handler: (event: RoutedEvent) => void; band: Band };

export class InputRouter {
  game: M2D;
  subscribers: Map<string, Set<Subscriber>>;
  /** Registered `Interactive` constraints. */
  interactives: Set<Interactive>;
  /** Whether any interactive needs a physics point query. */
  needsPhysicsQuery: boolean;
  /** The current scene's UI container, or null between scenes. */
  uiContainer: UIContainerLike | null;
  /** What the pointer is currently over, across all bands. */
  hovered: InputTarget | null;

  constructor(game: M2D) {
    this.game = game;
    this.subscribers = new Map();
    this.interactives = new Set();
    this.needsPhysicsQuery = false;
    this.uiContainer = null;
    this.hovered = null;
  }

  // === Subscriptions ===

  /**
   * Listen for an event type (`'click'`, `'pinch'`). `band` orders
   * subscribers relative to each other; all run after targets either way.
   * Returns the unsubscribe.
   */
  on(type: string, handler: (event: RoutedEvent) => void, options: { band?: Band } = {}): () => void {
    const entry: Subscriber = { handler, band: options.band || 'world' };
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
   */
  listening(...types: string[]): boolean {
    for (const type of types) {
      if (this.subscribers.has(type)) return true;
      // The whole tree, not just the root: the root never wants anything
      // itself, and a button nested three panels deep still has to switch
      // on the gesture it needs.
      if (this.uiContainer?.treeHandles(type)) return true;
      for (const interactive of this.interactives) {
        if (interactive.handles(type)) return true;
      }
    }
    return false;
  }

  // === Registration ===

  /** Point the UI band at the active scene's container. */
  setUIContainer(container: UIContainerLike | null): void {
    if (this.uiContainer !== container) this.clearHover();
    this.uiContainer = container;
  }

  /** Add an `Interactive` constraint to the world band. */
  addInteractive(interactive: Interactive): void {
    this.interactives.add(interactive);
    this.#refreshQueryNeed();
  }

  /** Remove an `Interactive` constraint; also drops it as the hover target. */
  removeInteractive(interactive: Interactive): void {
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
   */
  dispatch(event: RoutedEvent): void {
    const notified = this.#route(event);
    // A release is cleanup, not an action: whatever is holding something
    // for that pointer (an on-screen key under a thumb that slid away) must
    // hear it, whichever band took the event.
    if (event.type === 'pointerup' && !notified) this.#notifySubscribers(event, true);
  }

  /** The bands, then the subscribers. Returns whether the subscribers were told. */
  #route(event: RoutedEvent): boolean {
    // The engine's own UI is modal: a blocking screen takes the event before
    // any target gets a chance at it, which is the whole of "the menu blocks
    // the game". The stack decides which of its layers that is; the router
    // no longer asks each one in turn.
    (this.game.ui as { handleInput(event: RoutedEvent): void } | null)?.handleInput(event);
    if (event.consumed) {
      // Tells the input manager to keep this press out of the simulation.
      event.handledByUI = true;
      return false;
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
      if (event.consumed) return false;
    }

    if (event.type === 'drop' && event.dropTarget && event.dropTarget !== target) {
      event.dropTarget.handleInput(event);
      if (event.consumed) return false;
    }

    this.#notifySubscribers(event, event.type === 'pointerup');
    return true;
  }

  /** With `all`, tell every subscriber, even once one has consumed the event. */
  #notifySubscribers(event: RoutedEvent, all = false): void {
    const set = this.subscribers.get(event.type);
    if (!set || set.size === 0) return;
    // Snapshot: a handler is allowed to unsubscribe itself, or anything else.
    const entries = [...set].sort(
      (a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band));
    for (const { handler } of entries) {
      handler(event);
      if (event.consumed && !all) return;
    }
  }

  /** The topmost thing under the event, searched band by band; `exclude` skips the subject of a drop. */
  #resolveTarget(event: RoutedEvent, exclude: InputTarget | null = null): InputTarget | null {
    const element = this.uiContainer?.hitTest(event.ui.x, event.ui.y, exclude);
    if (element) {
      event.handledByUI = true;
      return element;
    }
    return this.#worldTarget(event, exclude);
  }

  #worldTarget(event: RoutedEvent, exclude: InputTarget | null): InputTarget | null {
    if (this.interactives.size === 0) return null;

    // One query answers for every body-shaped interactive at once. The
    // receiver is cast (the union's point types disagree until phase 10).
    let bodies: Set<unknown> | null = null;
    if (this.needsPhysicsQuery) {
      const physics = this.game.physics as unknown as { queryPoint(point: { x: number; y: number; z?: number }): unknown[] };
      bodies = new Set(physics.queryPoint(event.world));
    }

    let best: InputTarget | null = null;
    let bestPriority = -Infinity;
    for (const interactive of this.interactives) {
      if (interactive === exclude || !interactive.active) continue;
      const hit = interactive.usesBodyShape
        ? bodies!.has(interactive.entity.body)
        : interactive.containsWorld(event.world);
      if (!hit) continue;
      // `>=` so that, at equal priority, the most recently registered wins —
      // registration order is creation order, which is also draw order.
      if (interactive.priority >= bestPriority) {
        best = interactive as InputTarget;
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
   * `event` is the move event driving the update; `makeEvent` builds the
   * enter/leave events from it.
   */
  updateHover(event: RoutedEvent, makeEvent: (type: string, source: RoutedEvent, extra?: Record<string, unknown>) => RoutedEvent): void {
    if (!HOVER_TYPES.has(event.pointerType!)) return;

    // The engine's UI resolves its own hover first. When it owns the
    // pointer — a control under it, or any blocking screen — nothing in the
    // scene or the world may show a hover state.
    const ui = this.game.ui as { updateHover(event: RoutedEvent): void; ownsPointer(event: RoutedEvent): boolean } | null;
    if (ui) {
      ui.updateHover(event);
      if (ui.ownsPointer(event)) {
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
  clearHover(makeEvent: ((type: string, source: RoutedEvent) => RoutedEvent) | null = null, source: RoutedEvent | null = null): void {
    if (!this.hovered) return;
    const previous = this.hovered;
    this.hovered = null;
    if (makeEvent && source) previous.handleInput(makeEvent('hoverend', source));
  }

  destroy(): void {
    this.subscribers.clear();
    this.interactives.clear();
    this.uiContainer = null;
    this.hovered = null;
  }
}
