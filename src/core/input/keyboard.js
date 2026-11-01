/**
 * Keyboard state, keyed by physical position.
 *
 * ## Why `event.code` and not `event.key`
 *
 * `key` is the character the layout produces, so a game bound to `'w'` is
 * bound to a different *key* on AZERTY and Dvorak — WASD stops being a
 * diamond under the left hand, which is the only reason anyone chose it.
 * `code` names the physical key (`'KeyW'`, `'Space'`, `'ArrowLeft'`) and is
 * identical on every layout, so that is what the engine tracks.
 *
 * The cost is that `'KeyZ'` is not what the player's keycap says. For
 * *showing* a binding, `label()` asks the browser's keyboard layout map and
 * falls back to a readable form of the code.
 *
 * ## Focus
 *
 * Listeners sit on the canvas, which is made focusable, rather than on the
 * document. An engine that listens on the document eats keystrokes meant for
 * any other element on the page — a name field, a dev console, a link. The
 * canvas is focused on construction and on every press, so a full-page game
 * behaves exactly as if the listeners were global.
 */

/**
 * Keys whose browser default is actively hostile to a game: scrolling the
 * page, moving focus out of the canvas, or going back a page. Prevented
 * unless a modifier is held, so the browser's own shortcuts still work.
 */
const DEFAULT_PREVENTED = new Set([
  'Space', 'Tab', 'Enter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End', 'Backspace'
]);

/** Human-readable fallback for a `code` the layout map cannot name. */
function readableCode(code) {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

export class Keyboard {
  /**
   * @param {HTMLCanvasElement} canvas - Element that holds keyboard focus
   * @param {{push: (record: object) => void, flush: () => void}} sink -
   *   Receives `{kind: 'keydown'|'keyup', ...}` records
   * @param {Object} [options]
   * @param {Iterable<string>} [options.preventDefault] - Codes whose browser
   *   default is suppressed; replaces the built-in list
   */
  constructor(canvas, sink, options = {}) {
    this.canvas = canvas;
    this.sink = sink;
    this.prevented = new Set(options.preventDefault ?? DEFAULT_PREVENTED);

    /** Codes currently held. @type {Set<string>} */
    this.down = new Set();
    /** Codes that went down this frame. @type {Set<string>} */
    this.pressed = new Set();
    /** Codes that came up this frame. @type {Set<string>} */
    this.released = new Set();

    this.listeners = [];
    /** Resolved layout map, when the browser offers one. */
    this.layout = null;

    if (canvas && canvas.tabIndex === undefined) canvas.tabIndex = 0;
    else if (canvas && canvas.tabIndex < 0) canvas.tabIndex = 0;

    if (typeof canvas?.addEventListener === 'function') this.#listen();
    this.#loadLayout();
  }

  #on(target, type, handler) {
    target.addEventListener(type, handler);
    this.listeners.push(() => target.removeEventListener(type, handler));
  }

  #listen() {
    this.canvas.focus?.({ preventScroll: true });

    // The listeners only enqueue; `apply` below is what moves the held-key
    // state, driven from the queue. Keeping the two in one place is what
    // lets synthesized key input (replays, on-screen keys) behave exactly
    // like the real thing.
    this.#on(this.canvas, 'keydown', (event) => {
      const code = event.code;
      if (this.prevented.has(code) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
      }
      // Auto-repeat keeps firing keydown; the held state is already true and
      // an edge that repeats is not an edge.
      if (event.repeat || this.down.has(code)) return;
      this.sink.push({ kind: 'keydown', code, key: event.key, time: event.timeStamp });
      this.sink.flush();
    });

    this.#on(this.canvas, 'keyup', (event) => {
      if (!this.down.has(event.code)) return;
      this.sink.push({ kind: 'keyup', code: event.code, key: event.key, time: event.timeStamp });
      this.sink.flush();
    });

    // Keys held while focus leaves never report their release, and the game
    // would keep running in that direction forever.
    this.#on(this.canvas, 'blur', () => this.releaseAll());
    if (typeof window !== 'undefined') this.#on(window, 'blur', () => this.releaseAll());
  }

  /** Ask the browser what the player's keycaps actually say. */
  async #loadLayout() {
    try {
      const map = await navigator?.keyboard?.getLayoutMap?.();
      if (map) this.layout = map;
    } catch {
      // Unsupported or blocked by permissions policy; readableCode() covers it.
    }
  }

  /**
   * Move the held-key state for one queued record.
   * @param {{kind: 'keydown'|'keyup', code: string}} record
   * @returns {boolean} Whether this was a real edge worth dispatching
   */
  apply(record) {
    if (record.kind === 'keydown') {
      if (this.down.has(record.code)) return false;
      this.down.add(record.code);
      this.pressed.add(record.code);
      return true;
    }
    if (!this.down.delete(record.code)) return false;
    this.released.add(record.code);
    return true;
  }

  /** Drop every held key, as if all were released. */
  releaseAll() {
    for (const code of this.down) this.released.add(code);
    this.down.clear();
  }

  /** Whether `code` is held right now. */
  isDown(code) {
    return this.down.has(code);
  }

  /** Whether `code` went down during this frame. */
  justPressed(code) {
    return this.pressed.has(code);
  }

  /** Whether `code` came up during this frame. */
  justReleased(code) {
    return this.released.has(code);
  }

  /**
   * A -1..1 axis from two keys, the shape movement code actually wants.
   * Both held cancel out.
   * @param {string} negative - Code driving the axis negative
   * @param {string} positive - Code driving the axis positive
   */
  axis(negative, positive) {
    return (this.down.has(positive) ? 1 : 0) - (this.down.has(negative) ? 1 : 0);
  }

  /**
   * A direction vector from four keys, normalized so diagonals are not
   * faster than the cardinals.
   * @returns {{x: number, y: number}}
   */
  vector(up, down, left, right) {
    const x = this.axis(left, right);
    const y = this.axis(up, down);
    if (x !== 0 && y !== 0) {
      const inverse = 1 / Math.SQRT2;
      return { x: x * inverse, y: y * inverse };
    }
    return { x, y };
  }

  /**
   * What the player's keyboard prints on `code`, for binding UI.
   * @param {string} code - Physical key code
   * @returns {string} The keycap legend, or a readable form of the code
   */
  label(code) {
    const printed = this.layout?.get?.(code);
    if (printed) return printed.toUpperCase();
    return readableCode(code);
  }

  /** Clear this frame's edges. Called by the engine at the end of a frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  destroy() {
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }
}
