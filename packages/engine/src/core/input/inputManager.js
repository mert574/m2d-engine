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
import { InputSnapshot } from './snapshot.js';

export { InputSnapshot };

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

    /**
     * The input the simulation reads. Taken by `sample()` at the top of
     * every tick (`game.fixedUpdate` does it) so each tick sees one
     * well-defined state however the frames fall, and so a replay or a
     * network layer can later substitute what a peer sent for that tick.
     * @type {InputSnapshot}
     */
    this.snapshot = InputSnapshot.empty();
    /** Whether this frame's key edges have already been handed to a tick. */
    this.edgesSampled = false;
    /**
     * Edges from frames that ran no tick, held for the next tick. At 144 Hz
     * every other frame is tickless; without this a press landing in one
     * would be cleared at frame end and the simulation would never see it.
     */
    this.carriedPressed = new Set();
    this.carriedReleased = new Set();
    /**
     * The buttons that went down since the last tick sampled edges, as a
     * mask. A click can press and release inside one frame, so the tick
     * that samples it would otherwise see no button held at all.
     */
    this.pointerPressed = 0;
    /**
     * Buttons whose press the UI took (a screen consumed it, or it landed on
     * a scene UI element), as a mask. They stay out of every snapshot until
     * released, so a button held over a menu is not seen as held by the
     * world once the menu closes. See `#onDown`.
     */
    this.claimedButtons = 0;
    /**
     * When set, `sample()` asks this instead of the live devices — the seam
     * a replay (or, one day, a network layer) feeds recorded ticks through.
     * @type {(() => InputSnapshot|object|null)|null}
     */
    this.snapshotSource = null;

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
        return self.toWorld(view);
      },
      get isDown() { return self.buttons !== 0; },
      get buttons() { return self.buttons; },
      get type() { return self.pointerType; },
      get locked() { return self.cursor.locked; }
    };
  }

  // === Public API ===

  /**
   * A view position as a point on the ground: through the camera, then
   * through the scene's projection if it has one, so `event.world` is
   * where a click lands on the plane the simulation runs on.
   */
  toWorld(view) {
    const render = this.game.camera.screenToWorld(view.x, view.y);
    return this.game.projection ? this.game.projection.toWorld(render.x, render.y) : render;
  }

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
    this.edgesSampled = false;
  }

  /** End-of-frame: retire this frame's key edges, unless no tick took them. */
  endFrame() {
    if (!this.edgesSampled) {
      for (const code of this.keyboard.pressed) this.carriedPressed.add(code);
      for (const code of this.keyboard.released) this.carriedReleased.add(code);
    }
    this.keyboard.endFrame();
  }

  /**
   * Replace the live devices as what `sample()` reads, tick by tick.
   *
   * While a source is installed, every tick's snapshot comes from it: the
   * player's keyboard still works for the UI (menus, the console) but the
   * simulation no longer sees it. That inversion is what an input replay
   * is — the recorded log plays the game, the engine runs it exactly as it
   * ran live — and it is the same seam a network layer would use to feed a
   * peer's commands for a tick.
   *
   * The source may return an `InputSnapshot`, plain `toJSON()` output, or
   * null for "nothing held". Pass `null` to give the devices back.
   *
   * @param {(() => InputSnapshot|object|null)|null} source
   */
  setSnapshotSource(source) {
    this.snapshotSource = source ?? null;
  }

  /**
   * Capture the current input as the state for one simulation tick.
   *
   * Held keys and the pointer are copied as they are. Press and release
   * edges go to the *first* tick sampled in a frame and to no other, so a
   * frame that runs two ticks to catch up does not fire a jump twice. The
   * per-frame `justPressed` API is unaffected; the UI and game code outside
   * the tick still see the edges for the whole frame.
   *
   * @returns {InputSnapshot} Also stored as `snapshot`.
   */
  sample() {
    if (this.snapshotSource) {
      const fed = this.snapshotSource();
      this.snapshot = fed instanceof InputSnapshot
        ? fed
        : fed ? InputSnapshot.from(fed) : InputSnapshot.empty();
      return this.snapshot;
    }
    // A blocking screen (an inventory, a dialog, the console) owns the
    // keyboard and the pointer while it is up: typing in it or holding an
    // arrow over it must not move the avatar. The tick sees nothing held.
    if (this.game.ui?.capturesInput) {
      this.edgesSampled = true;
      // Nothing that happened under the screen survives it.
      this.carriedPressed.clear();
      this.carriedReleased.clear();
      this.pointerPressed = 0;
      this.snapshot = InputSnapshot.empty();
      return this.snapshot;
    }
    const keyboard = this.keyboard;
    const edges = !this.edgesSampled;
    this.edgesSampled = true;
    const pointer = this.pointer;
    const pressed = edges ? new Set([...this.carriedPressed, ...keyboard.pressed]) : new Set();
    const released = edges ? new Set([...this.carriedReleased, ...keyboard.released]) : new Set();
    const pointerPressed = edges ? this.pointerPressed : 0;
    const worldButtons = pointer.buttons & ~this.claimedButtons;
    if (edges) {
      this.carriedPressed.clear();
      this.carriedReleased.clear();
      this.pointerPressed = 0;
    }
    this.snapshot = new InputSnapshot({
      down: new Set(keyboard.down),
      pressed,
      released,
      pointer: {
        ui: { ...pointer.ui },
        world: { ...pointer.world },
        isDown: worldButtons !== 0,
        pressed: pointerPressed !== 0,
        pressedButtons: pointerPressed,
        buttons: worldButtons,
        type: pointer.type
      }
    });
    return this.snapshot;
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

  /**
   * A press is dispatched before it is recorded for the simulation, like a
   * key. One the UI took (a screen consumed it, or it landed on a scene UI
   * element) never reaches a snapshot, and its button reads as up to the
   * world until it is released: clicking a menu item, or the button that
   * closes the menu, must not also walk the avatar to where the cursor was.
   */
  #onDown(record) {
    this.pointerType = record.pointerType;
    this.buttons = record.buttons;
    const event = this.#resolve('pointerdown', record);
    // Inside the originating gesture, which is the only place the browser
    // will grant a lock.
    this.cursor.request();
    this.router.dispatch(event);
    const bit = 1 << (record.button ?? 0);
    if (event.handledByUI) this.claimedButtons |= bit;
    else this.pointerPressed |= bit;
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
    // A claimed button is the world's again once it is up.
    this.claimedButtons &= record.buttons ?? 0;
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
        world: this.toWorld(mapped.view),
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
      world: this.toWorld(view),
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
      /** Set by the router when the UI took the event. */
      handledByUI: false,
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
        event.world = this.toWorld(event.view);
      }
    }
    return event;
  }
}
