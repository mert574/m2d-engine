/**
 * Temporal pointer gestures: click, double click, right click, drag and
 * pinch.
 *
 * This module is deliberately ignorant of *where* things are — it never hit
 * tests and never touches the DOM. It consumes resolved pointer events (which
 * already carry UI and world coordinates) and emits higher-level ones. That
 * is what makes every rule below testable by feeding it a synthetic stream.
 *
 * ## Recognizers are lazy
 *
 * A recognizer only runs when something is listening for what it produces,
 * and for pinch that is a behavioural guarantee rather than an optimization:
 * with no pinch listener two fingers are simply two independent drags, which
 * is exactly what twin-stick touch controls need. Subscribing to `pinch` is
 * what claims the second pointer.
 *
 * Long-press-as-right-click works the same way. It suppresses the click that
 * would otherwise follow, so a game that never asked for right clicks must
 * not pay for one.
 *
 * ## Click and double click both fire
 *
 * Distinguishing them by waiting would add the double-click interval to the
 * latency of every single click. Instead the first click dispatches
 * immediately and a second one dispatches `click` *and* `doubleclick`.
 * Handlers that must not run twice listen only for `doubleclick` and check
 * nothing; handlers that genuinely need "single click only" are rare enough
 * to debounce themselves.
 */

/**
 * How far a pointer may travel and still count as a click when it pressed
 * nothing in particular, in UI units. A press that *did* land on a target
 * uses the stricter and more useful rule of having to be released on the
 * same target — a button is far wider than any slop radius, and releasing on
 * the far side of the one you pressed is still a click.
 */
const CLICK_SLOP = 16;

/** Travel past this promotes a press into a drag, in UI units. */
const DRAG_SLOP = 16;

/** A quick moving click gets this long before motion may start a drag. */
const DRAG_DELAY = 100;

/** Longest gap between two clicks that still makes a double click, in ms. */
const DOUBLE_INTERVAL = 300;

/** How far apart two clicks may land and still pair up, in UI units. */
const DOUBLE_SLOP = 12;

/** How long a touch must be held to stand in for a right click, in ms. */
const LONG_PRESS = 500;

/** Mouse button numbers, as the DOM reports them. */
const PRIMARY = 0;
const SECONDARY = 2;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function delta(from, to) {
  return { x: to.x - from.x, y: to.y - from.y };
}

export class GestureRecognizer {
  /**
   * @param {Object} deps
   * @param {(type: string, source: object, extra?: object) => object} deps.makeEvent -
   *   Builds a dispatchable event from a source pointer event
   * @param {(event: object) => void} deps.dispatch - Routes a built event
   * @param {(...types: string[]) => boolean} deps.listening - Whether anything
   *   subscribes to any of these event types
   */
  constructor({ makeEvent, dispatch, listening }) {
    this.makeEvent = makeEvent;
    this.dispatch = dispatch;
    this.listening = listening;

    /** Live press state per pointer id. @type {Map<number, object>} */
    this.pointers = new Map();
    /** The last click, for pairing a double. */
    this.lastClick = null;
    /** Two-pointer pinch state, or null. */
    this.pinch = null;
  }

  /** Press state for `id`, or undefined if that pointer is not down. */
  get(id) {
    return this.pointers.get(id);
  }

  /** Whether any pointer is mid-drag. */
  get dragging() {
    for (const state of this.pointers.values()) if (state.dragging) return true;
    return false;
  }

  /**
   * @param {object} event - The dispatched `pointerdown`. It has already been
   *   routed, so `event.target` is resolved — which is what lets a click be
   *   defined as "pressed and released on the same thing".
   */
  pointerDown(event) {
    const state = {
      id: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      downTarget: event.target,
      downTime: event.time,
      downUI: { ...event.ui },
      downWorld: { ...event.world },
      lastUI: { ...event.ui },
      lastWorld: { ...event.world },
      dragging: false,
      subject: null,
      suppressClick: false,
      longPressed: false
    };
    this.pointers.set(state.id, state);

    if (this.pointers.size === 2 && this.listening('pinch', 'pinchstart', 'pinchend')) {
      this.#startPinch(event);
    }
  }

  pointerMove(event) {
    const state = this.pointers.get(event.pointerId);

    if (this.pinch) {
      // A pinch is computed from where both fingers are *now*, so this one
      // has to be current before the span is measured.
      this.#advance(state, event);
      this.#updatePinch(event);
      return;
    }
    if (!state) return;

    if (!state.dragging) {
      if (event.time - state.downTime < DRAG_DELAY ||
          distance(state.downUI, event.ui) <= DRAG_SLOP ||
          !this.listening('dragstart', 'drag', 'dragend', 'drop')) {
        this.#advance(state, event);
        return;
      }
      state.dragging = true;
      state.suppressClick = true;
      // What was *pressed* owns the drag, not what happens to be under the
      // pointer once it has travelled past the slop radius — by then it has
      // usually left the thing it grabbed. The same capture keeps a fast
      // drag from being handed to everything it flies over.
      state.subject = state.downTarget;
      this.dispatch(this.#dragEvent('dragstart', event, state));
      this.#advance(state, event);
      return;
    }

    this.dispatch(this.#dragEvent('drag', event, state));
    this.#advance(state, event);
  }

  /**
   * Record where a pointer now is. Deliberately after dispatch, since drag
   * deltas are measured from the previous position and advancing first
   * would make every one of them zero.
   */
  #advance(state, event) {
    if (!state) return;
    state.lastUI = { ...event.ui };
    state.lastWorld = { ...event.world };
  }

  pointerUp(event, { cancelled = false } = {}) {
    const state = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);

    if (this.pinch) {
      this.#endPinch(event);
      return;
    }
    if (!state) return;

    if (state.dragging) {
      this.dispatch(this.#dragEvent('dragend', event, state, { cancelled }));
      if (!cancelled) this.dispatch(this.#dragEvent('drop', event, state));
      return;
    }

    if (cancelled || state.suppressClick) return;
    if (!this.#completesClick(state, event)) return;

    if (state.button === SECONDARY) {
      this.dispatch(this.makeEvent('rightclick', event));
      return;
    }
    if (state.button !== PRIMARY) return;

    this.dispatch(this.makeEvent('click', event));

    const previous = this.lastClick;
    const paired = previous &&
      event.time - previous.time <= DOUBLE_INTERVAL &&
      distance(previous.ui, event.ui) <= DOUBLE_SLOP;
    if (paired && this.listening('doubleclick')) {
      this.dispatch(this.makeEvent('doubleclick', event));
    }
    // A pair is consumed by the double it produced, so a third click starts
    // a new pair instead of firing doubleclick on every press from then on.
    this.lastClick = paired ? null : { time: event.time, ui: { ...event.ui } };
  }

  /**
   * Advance time-based recognition. Called once per frame rather than from a
   * timer: a long press that fires at a frame boundary is indistinguishable
   * to the player, and there is no timer left to leak on teardown.
   * @param {number} now - Milliseconds on the same clock as event times
   */
  update(now) {
    if (this.pointers.size === 0) return;
    if (!this.listening('rightclick')) return;
    for (const state of this.pointers.values()) {
      if (state.pointerType !== 'touch') continue;
      if (state.longPressed || state.dragging) continue;
      if (now - state.downTime < LONG_PRESS) continue;
      if (distance(state.downUI, state.lastUI) > CLICK_SLOP) continue;
      state.longPressed = true;
      // The press has become a right click, so the release must not also
      // read as an ordinary tap.
      state.suppressClick = true;
      this.dispatch(this.makeEvent('rightclick', {
        ...this.#sourceFrom(state),
        time: now
      }));
    }
  }

  /**
   * Whether a release completes the press it belongs to.
   *
   * Pressing a button and releasing it counts however far apart the two
   * points are, as long as both landed on that button — which is how
   * pressing one edge and releasing the other stays a click, and how sliding
   * off the button before releasing cancels it. With nothing pressed there
   * is no target to compare: quick releases count as clicks despite motion,
   * and longer presses must stay within the click radius.
   */
  #completesClick(state, event) {
    if (state.downTarget) return event.target === state.downTarget;
    return event.time - state.downTime < DRAG_DELAY ||
      distance(state.downUI, event.ui) <= CLICK_SLOP;
  }

  /** A synthetic source event at a pointer's current position. */
  #sourceFrom(state) {
    return {
      pointerId: state.id,
      pointerType: state.pointerType,
      button: SECONDARY,
      buttons: 0,
      ui: state.lastUI,
      world: state.lastWorld
    };
  }

  #dragEvent(type, event, state, extra = {}) {
    return this.makeEvent(type, event, {
      start: { ui: { ...state.downUI }, world: { ...state.downWorld } },
      delta: {
        ui: delta(state.lastUI, event.ui),
        world: delta(state.lastWorld, event.world)
      },
      total: {
        ui: delta(state.downUI, event.ui),
        world: delta(state.downWorld, event.world)
      },
      subject: state.subject,
      ...extra
    });
  }

  // === Pinch ===

  /** The two live pointers as a span: centre, separation and angle. */
  #span() {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    return {
      centre: {
        ui: { x: (a.lastUI.x + b.lastUI.x) / 2, y: (a.lastUI.y + b.lastUI.y) / 2 },
        world: { x: (a.lastWorld.x + b.lastWorld.x) / 2, y: (a.lastWorld.y + b.lastWorld.y) / 2 }
      },
      distance: distance(a.lastUI, b.lastUI),
      angle: Math.atan2(b.lastUI.y - a.lastUI.y, b.lastUI.x - a.lastUI.x)
    };
  }

  #startPinch(event) {
    const span = this.#span();
    if (!span || span.distance === 0) return;

    // A drag already under way was a one-finger gesture; the second finger
    // reinterprets it. End it without a drop, since nothing was dropped.
    for (const state of this.pointers.values()) {
      if (!state.dragging) continue;
      this.dispatch(this.#dragEvent('dragend', event, state, { cancelled: true }));
      state.dragging = false;
      state.subject = null;
    }
    for (const state of this.pointers.values()) state.suppressClick = true;

    this.pinch = { initial: span, last: span };
    this.dispatch(this.makeEvent('pinchstart', event, this.#pinchDetail(span)));
  }

  #updatePinch(event) {
    const span = this.#span();
    if (!span) return;
    this.dispatch(this.makeEvent('pinch', event, this.#pinchDetail(span)));
    this.pinch.last = span;
  }

  #endPinch(event) {
    const span = this.pinch.last;
    this.dispatch(this.makeEvent('pinchend', event, this.#pinchDetail(span)));
    this.pinch = null;
    // The remaining finger is not a fresh press — leaving it live would make
    // lifting the first finger start a drag from a stale origin.
    for (const state of this.pointers.values()) state.suppressClick = true;
  }

  #pinchDetail(span) {
    const { initial, last } = this.pinch;
    return {
      centre: span.centre,
      ui: span.centre.ui,
      world: span.centre.world,
      distance: span.distance,
      scale: span.distance / initial.distance,
      scaleDelta: last.distance === 0 ? 1 : span.distance / last.distance,
      rotation: span.angle - initial.angle,
      rotationDelta: span.angle - last.angle
    };
  }

  /** Forget all in-flight gestures, e.g. on scene change or teardown. */
  reset() {
    this.pointers.clear();
    this.pinch = null;
    this.lastClick = null;
  }
}
