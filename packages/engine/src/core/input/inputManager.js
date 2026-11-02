/**
 * The engine's input boundary: `game.input`.
 *
 * Everything a game needs from the keyboard, the mouse, a touchscreen or a
 * pen arrives through this one object, and nothing else in the engine
 * registers a DOM input listener. It composes four pieces, each of which is
 * useful to read on its own:
 *
 *   - `PointerSource` — DOM pointer/wheel events, normalized (pointerSource.js)
 *   - `Keyboard`      — held keys by physical code (keyboard.js)
 *   - `Cursor`        — pointer position and pointer lock (cursor.js)
 *   - `GestureRecognizer` — click/drag/pinch from the raw stream (gestures.js)
 *   - `InputRouter`   — overlay -> UI -> world delivery (router.js)
 *
 * ## When events are delivered
 *
 * Records are queued, never dispatched from the DOM handler directly, but
 * the queue is drained at two different moments:
 *
 *   - **Presses, releases and key events drain immediately**, inside the
 *     originating DOM handler. `requestFullscreen()` and
 *     `requestPointerLock()` are gated on running within a real user gesture,
 *     and a settings-menu button that only ran at the next frame boundary
 *     would be refused by the browser.
 *   - **Moves and wheel ticks wait for the frame**, where they are coalesced
 *     into one update per pointer. Nothing reacts usefully to the fourth
 *     mouse-move of a frame, and hit testing each one is pure waste.
 *
 * Draining on a press also drains everything queued before it, so events are
 * always delivered in the order they happened.
 *
 * ## The event object
 *
 * Every event carries both coordinate spaces, resolved once at dispatch:
 *
 *   { type, pointerId, pointerType, button, buttons,
 *     ui: {x, y}, view: {x, y}, world: {x, y}, inContent,
 *     modifiers: {shift, ctrl, alt, meta}, time,
 *     target, consume() }
 *
 * Drags add `start`, `delta`, `total` (each with `ui` and `world`), plus
 * `subject`; drops add `dropTarget`; pinches add `scale`, `rotation` and
 * their per-event deltas; scrolls add `scroll`.
 */

import { mapPointer, uiToView } from '../viewport.js';
import { PointerSource } from './pointerSource.js';
import { Keyboard } from './keyboard.js';
import { Cursor } from './cursor.js';
import { GestureRecognizer } from './gestures.js';
import { InputRouter } from './router.js';

const NO_MODIFIERS = Object.freeze({ shift: false, ctrl: false, alt: false, meta: false });

export class InputManager {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options]
   * @param {boolean} [options.pointerLock=false] - Confine the pointer to the
   *   canvas and draw a virtual cursor (see cursor.js)
   * @param {Iterable<string>} [options.preventDefault] - Key codes whose
   *   browser default is suppressed
   */
  constructor(game, options = {}) {
    this.game = game;
    /** Pending records, drained by `flush`. */
    this.queue = [];
    /** Guards against a handler re-entering the drain loop. */
    this.draining = false;
    /** After destroy() the manager is inert; late records are dropped. */
    this.destroyed = false;
    /** Buttons currently held, as a DOM `buttons` bitmask. */
    this.buttons = 0;
    /** Which kind of device moved the pointer last. */
    this.pointerType = 'mouse';

    this.cursor = new Cursor(game, options);
    this.router = new InputRouter(game);
    this.recognizer = new GestureRecognizer({
      makeEvent: (type, source, extra) => this.#makeEvent(type, source, extra),
      dispatch: (event) => this.router.dispatch(event),
      listening: (...types) => this.router.listening(...types)
    });

    const sink = { push: (record) => this.push(record), flush: () => this.flush() };
    this.pointerSource = new PointerSource(game.canvas, sink);
    this.keyboard = new Keyboard(game.canvas, sink, options);

    /**
     * Live pointer state for code that polls instead of subscribing.
     * `world` is a getter on purpose: the camera can move under a pointer
     * that never reported another event, and a cached world position would
     * quietly go stale.
     */
    const self = this;
    this.pointer = {
      get ui() { return self.cursor.ui; },
      get view() { return uiToView({ ...self.cursor.ui, viewport: self.game.viewport }); },
      get world() {
        const view = this.view;
        return self.game.camera.screenToWorld(view.x, view.y);
      },
      get isDown() { return self.buttons !== 0; },
      get buttons() { return self.buttons; },
      get type() { return self.pointerType; },
      get locked() { return self.cursor.locked; }
    };
  }

  // === Public API ===

  /**
   * Listen for an input event.
   * @param {string} type - e.g. 'click', 'drag', 'pinch', 'scroll', 'keydown'
   * @param {(event: object) => void} handler
   * @param {{band?: 'overlay'|'ui'|'world'}} [options]
   * @returns {() => void} Unsubscribe
   */
  on(type, handler, options) {
    return this.router.on(type, handler, options);
  }

  /** Whether a physical key is held. @param {string} code e.g. 'KeyW' */
  isDown(code) { return this.keyboard.isDown(code); }

  /** Whether a physical key went down this frame. */
  justPressed(code) { return this.keyboard.justPressed(code); }

  /** Whether a physical key came up this frame. */
  justReleased(code) { return this.keyboard.justReleased(code); }

  /** A -1..1 axis from two keys. @see Keyboard#axis */
  axis(negative, positive) { return this.keyboard.axis(negative, positive); }

  /** A normalized direction vector from four keys. @see Keyboard#vector */
  vector(up, down, left, right) { return this.keyboard.vector(up, down, left, right); }

  /** What the player's keyboard prints on a code, for binding UI. */
  keyLabel(code) { return this.keyboard.label(code); }

  /** Whether the browser currently has the pointer locked to the canvas. */
  get pointerLocked() { return this.cursor.locked; }

  /**
   * Turn pointer lock on or off. Off by default; turning it on takes effect
   * at the next press, since the browser requires a user gesture.
   * @param {boolean} enabled
   */
  setPointerLock(enabled) { this.cursor.setEnabled(enabled); }

  /** Release pointer lock without disabling it; the next press re-acquires. */
  unlockPointer() { this.cursor.exit(); }

  /** Register an `Interactive` constraint with the world band. */
  addInteractive(interactive) { this.router.addInteractive(interactive); }

  /** Unregister an `Interactive` constraint. */
  removeInteractive(interactive) { this.router.removeInteractive(interactive); }

  /** Point the UI band at a scene's container (null between scenes). */
  setUIContainer(container) { this.router.setUIContainer(container); }

  /**
   * Build an event that did not come from a device.
   *
   * Keyboard and gamepad activation of a focused control goes through this:
   * a control that tracks `isPressed`, or that only implements
   * `onPointerUp`, then behaves identically however it was triggered. The
   * event carries the cursor's current position, so a handler reading
   * coordinates still gets sensible ones.
   *
   * It is built, not dispatched — the caller delivers it to the target it
   * already resolved, rather than sending it back through hit testing that
   * would land somewhere else entirely.
   *
   * @param {string} type - Event type, e.g. 'click'
   * @param {object} [extra] - Fields merged onto the event
   * @returns {object}
   */
  makeSyntheticEvent(type, extra = {}) {
    return this.#makeEvent(type, {
      ui: this.cursor.ui,
      pointerType: this.pointerType,
      time: performance.now()
    }, { synthetic: true, ...extra });
  }

  // === Engine hooks ===

  /**
   * Start-of-frame: deliver everything buffered since the last frame, then
   * let time-based gestures (long press) fire.
   * @param {number} now - Frame timestamp in ms
   */
  beginFrame(now) {
    this.flush();
    this.recognizer.update(now);
  }

  /** End-of-frame: retire this frame's key edges. */
  endFrame() {
    this.keyboard.endFrame();
  }

  /** Keep the cursor inside UI space after a viewport change. */
  onResize() {
    this.cursor.clampToViewport();
  }

  /** Draw the virtual cursor, above everything. No-op unless locked. */
  draw() {
    this.cursor.draw();
  }

  /** Called by Cursor when the browser grants or drops the lock. */
  emitLockChange(locked) {
    this.router.dispatch(this.#makeEvent('pointerlockchange', {
      ui: this.cursor.ui,
      pointerType: this.pointerType
    }, { locked }));
  }

  destroy() {
    this.destroyed = true;
    this.pointerSource.destroy();
    this.keyboard.destroy();
    this.cursor.destroy();
    this.recognizer.reset();
    this.router.destroy();
    this.queue.length = 0;
  }

  // === Queue ===

  /**
   * Queue an input record as if it had come from the DOM.
   *
   * This is the seam the DOM sources push through, and it is public because
   * synthesized input is a real requirement, not just a testing convenience:
   * on-screen touch controls, replays and demo recordings all need to inject
   * events that no device produced. Records use the shape documented in
   * pointerSource.js; call `flush()` to deliver immediately, or let the next
   * frame do it.
   *
   * @param {object} record
   */
  push(record) {
    // A destroyed game must not keep interpreting input. An in-flight DOM
    // event can still land after teardown, and acting on it would leave a
    // key held down in an engine nobody is driving any more.
    if (this.destroyed) return;

    // Coalesce a run of moves from the same pointer into one. Deltas have to
    // accumulate rather than be dropped: under pointer lock they *are* the
    // position, and losing them would make the cursor lag the mouse.
    const last = this.queue[this.queue.length - 1];
    if (record.kind === 'move' && last?.kind === 'move' && last.pointerId === record.pointerId) {
      last.clientX = record.clientX;
      last.clientY = record.clientY;
      last.movementX += record.movementX;
      last.movementY += record.movementY;
      last.buttons = record.buttons;
      last.modifiers = record.modifiers;
      last.time = record.time;
      return;
    }
    this.queue.push(record);
  }

  /** Deliver everything queued, in order. Safe to call at any time. */
  flush() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        this.#process(this.queue.shift());
      }
    } finally {
      this.draining = false;
    }
  }

  #process(record) {
    switch (record.kind) {
      case 'keydown':
      case 'keyup':
        return this.#onKey(record);
      case 'down':
        return this.#onDown(record);
      case 'move':
        return this.#onMove(record);
      case 'up':
      case 'cancel':
        return this.#onUp(record, record.kind === 'cancel');
      case 'wheel':
        return this.#onWheel(record);
    }
  }

  /**
   * A key edge, where consumption and held state interact.
   *
   * A **press** is dispatched before it is recorded, and a consumed one is
   * never recorded at all: while a menu is open the game must not merely
   * miss the event, it must not see the key as held either, or the player
   * keeps walking behind the menu.
   *
   * A **release** is recorded first and always, even when an overlay
   * consumes the event. A key held when the menu opened has to come back up
   * in the game's state, or the player keeps running after it closes.
   */
  #onKey(record) {
    const build = () => this.#makeEvent(record.kind, {
      ui: this.cursor.ui,
      pointerType: this.pointerType,
      modifiers: record.modifiers,
      time: record.time
    }, { code: record.code, key: record.key });

    if (record.kind === 'keyup') {
      if (!this.keyboard.apply(record)) return;
      this.router.dispatch(build());
      return;
    }

    if (this.keyboard.isDown(record.code)) return;
    const event = build();
    this.router.dispatch(event);
    // Reported back on the record so the DOM listener that queued it can
    // suppress the browser's own handling of a key the engine took. The
    // listener is still on the stack: key records drain synchronously.
    record.consumed = event.consumed;
    if (!event.consumed) this.keyboard.apply(record);
  }

  #onDown(record) {
    this.pointerType = record.pointerType;
    this.buttons = record.buttons;
    const event = this.#resolve('pointerdown', record);
    // Inside the originating gesture, which is the only place the browser
    // will grant a lock.
    this.cursor.request();
    this.router.dispatch(event);
    this.recognizer.pointerDown(event);
  }

  #onMove(record) {
    this.pointerType = record.pointerType;
    this.buttons = record.buttons;
    const event = this.#resolve('pointermove', record);
    // Hover before the move itself, so a handler reading `isHovered` during
    // pointermove sees the state the move produced, not the previous one.
    this.router.updateHover(event, (type, source, extra) => this.#makeEvent(type, source, extra));
    this.router.dispatch(event);
    this.recognizer.pointerMove(event);
  }

  #onUp(record, cancelled) {
    this.buttons = record.buttons;
    const event = this.#resolve('pointerup', record, { cancelled });
    this.router.dispatch(event);
    this.recognizer.pointerUp(event, { cancelled });
  }

  #onWheel(record) {
    const event = this.#resolve('scroll', record, {
      scroll: { x: record.scrollX, y: record.scrollY }
    });
    this.router.dispatch(event);
  }

  // === Coordinates ===

  /**
   * Where a record happened, in every space the engine uses.
   *
   * Under pointer lock there is no absolute position to read: the browser
   * reports only relative motion, which the virtual cursor integrates. Both
   * modes produce the same three coordinate spaces, so nothing downstream
   * needs to know which one it is in.
   */
  #positionFor(record) {
    const viewport = this.game.viewport;
    const cursor = this.cursor;

    if (cursor.locked) {
      if (record.kind === 'move') cursor.moveBy(record.movementX, record.movementY);
    } else if (record.clientX != null && typeof this.game.canvas?.getBoundingClientRect === 'function') {
      const mapped = mapPointer({
        clientX: record.clientX,
        clientY: record.clientY,
        rect: this.game.canvas.getBoundingClientRect(),
        viewport
      });
      cursor.setUI(mapped.ui.x, mapped.ui.y);
      return {
        ui: { ...mapped.ui },
        view: mapped.view,
        world: this.game.camera.screenToWorld(mapped.view.x, mapped.view.y),
        inContent: mapped.inContent
      };
    }

    // Locked, or a synthetic record (a cancel from window blur) that carries
    // no position: the cursor is the only thing that knows where we are.
    const ui = { ...cursor.ui };
    const view = uiToView({ x: ui.x, y: ui.y, viewport });
    return {
      ui,
      view,
      world: this.game.camera.screenToWorld(view.x, view.y),
      inContent:
        view.x >= 0 && view.x <= viewport.viewWidth &&
        view.y >= 0 && view.y <= viewport.viewHeight
    };
  }

  /** Build a dispatchable event straight from a DOM record. */
  #resolve(type, record, extra) {
    const position = this.#positionFor(record);
    return this.#makeEvent(type, {
      pointerId: record.pointerId,
      pointerType: record.pointerType,
      button: record.button,
      buttons: record.buttons,
      modifiers: record.modifiers,
      time: record.time,
      ...position
    }, extra);
  }

  /**
   * Build an event from a source that already carries coordinates — either a
   * resolved record or another event a gesture is deriving from.
   */
  #makeEvent(type, source, extra = {}) {
    const event = {
      type,
      pointerId: source.pointerId ?? -1,
      pointerType: source.pointerType ?? this.pointerType,
      button: source.button ?? -1,
      buttons: source.buttons ?? this.buttons,
      ui: source.ui,
      view: source.view,
      world: source.world,
      inContent: source.inContent ?? true,
      modifiers: source.modifiers ?? NO_MODIFIERS,
      time: source.time ?? 0,
      /** Primary recipient, filled in by the router. */
      target: null,
      /** The dragged target, on drag events. */
      subject: null,
      /** What a drop landed on, underneath the subject. */
      dropTarget: null,
      consumed: false,
      consume() { this.consumed = true; },
      ...extra
    };
    // A gesture derived from a synthetic source carries at most a UI
    // position; fill in whatever spaces it left out. The cursor is always
    // current, so a source with no position at all can still be placed.
    if (!event.ui) {
      Object.assign(event, this.#positionFor({ kind: 'synthetic', clientX: null }));
    } else if (!event.view) {
      event.view = uiToView({ x: event.ui.x, y: event.ui.y, viewport: this.game.viewport });
      if (!event.world) {
        event.world = this.game.camera.screenToWorld(event.view.x, event.view.y);
      }
    }
    return event;
  }
}
