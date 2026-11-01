/**
 * The pointer's position in UI space, and the pointer-lock mode that makes
 * the engine responsible for drawing it.
 *
 * ## Two ways to know where the pointer is
 *
 * Unlocked, the browser reports an absolute position and draws the cursor
 * itself; this class just records where it landed.
 *
 * Locked (`requestPointerLock`), there *is* no absolute position — the
 * browser hides the cursor, confines it to the canvas and reports only
 * relative motion. The engine then integrates that motion into a **virtual
 * cursor** which it clamps to UI space and draws. Everything downstream
 * (UI hit testing, world hit testing, hover, drag) reads the same `ui`
 * position either way and never learns which mode produced it.
 *
 * Locking is on by default because confining the pointer is almost always
 * what a game wants: no accidental drift onto a second monitor, no click
 * landing on the page behind the canvas. It cannot be entered without a user
 * gesture, so the engine requests it on the first press and re-requests after
 * the player presses Escape. `game.input.setPointerLock(false)` opts out, and
 * so does `pointerLock: false` at construction.
 */

/**
 * Tailless arrow in UI units, hotspot at (0, 0). Drawn filled white with a
 * dark outline so it reads against any background the game puts behind it.
 */
const ARROW = Object.freeze([
  { x: 0, y: 0 },
  { x: 0, y: 16 },
  { x: 11.6, y: 11 }
]);

export class Cursor {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options]
   * @param {boolean} [options.pointerLock=true] - Confine and hide the system
   *   cursor, drawing a virtual one instead
   */
  constructor(game, options = {}) {
    this.game = game;
    /** Whether the engine should hold pointer lock when it can. */
    this.enabled = options.pointerLock ?? true;
    /** Whether the browser currently has the canvas locked. */
    this.locked = false;
    /** Set while a request is in flight, so presses do not pile them up. */
    this.pending = false;
    /**
     * Draw the virtual cursor. Only meaningful while locked — unlocked, the
     * system cursor is the real one and drawing a second would be a bug.
     */
    this.draws = true;

    const viewport = game.viewport;
    /** Position in UI units. @type {{x: number, y: number}} */
    this.ui = { x: viewport.uiWidth / 2, y: viewport.uiHeight / 2 };

    this.listeners = [];
    if (typeof document !== 'undefined' && document.addEventListener) {
      const onChange = () => this.#syncLockState();
      const onError = () => { this.pending = false; };
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      this.listeners.push(() => document.removeEventListener('pointerlockchange', onChange));
      this.listeners.push(() => document.removeEventListener('pointerlockerror', onError));
    }
  }

  #syncLockState() {
    const locked = typeof document !== 'undefined' &&
      document.pointerLockElement === this.game.canvas;
    this.pending = false;
    if (locked === this.locked) return;
    this.locked = locked;
    this.game.input?.emitLockChange(locked);
  }

  /**
   * Ask for pointer lock. Must be called from inside a user gesture; the
   * engine does so from the pointerdown handler.
   *
   * Browsers refuse for a second or so after the player presses Escape, on
   * purpose — a page that could instantly re-lock would make Escape useless.
   * A refusal is therefore expected, not an error: it is dropped here and the
   * next press tries again.
   */
  request() {
    if (!this.enabled || this.locked || this.pending) return;
    const canvas = this.game.canvas;
    if (typeof canvas?.requestPointerLock !== 'function') return;
    this.pending = true;
    try {
      const result = canvas.requestPointerLock();
      // Newer browsers return a promise; older ones return undefined and
      // report failure through the pointerlockerror event instead.
      if (result && typeof result.catch === 'function') {
        result.catch(() => { this.pending = false; });
      }
    } catch {
      this.pending = false;
    }
  }

  /** Release pointer lock, if this canvas holds it. */
  exit() {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.game.canvas) {
      document.exitPointerLock?.();
    }
  }

  /**
   * Turn pointer lock on or off at runtime. Turning it on takes effect at the
   * next press, since locking needs a user gesture.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.exit();
  }

  /** Place the cursor from a real pointer position, in UI units. */
  setUI(x, y) {
    this.ui.x = x;
    this.ui.y = y;
  }

  /**
   * Advance the virtual cursor by one frame of locked motion.
   *
   * `movementX/Y` are CSS pixels, and UI units are backing pixels divided by
   * `uiScale`, so the conversion is the same one `mapPointer` applies to an
   * absolute position — the virtual cursor must move at exactly the speed the
   * real one would have.
   */
  moveBy(movementX, movementY) {
    const { pixelRatio, uiScale, uiWidth, uiHeight } = this.game.viewport;
    const scale = pixelRatio / uiScale;
    this.ui.x = Math.min(Math.max(this.ui.x + movementX * scale, 0), uiWidth);
    this.ui.y = Math.min(Math.max(this.ui.y + movementY * scale, 0), uiHeight);
  }

  /** Keep the cursor inside UI space after the viewport changed. */
  clampToViewport() {
    const { uiWidth, uiHeight } = this.game.viewport;
    this.ui.x = Math.min(Math.max(this.ui.x, 0), uiWidth);
    this.ui.y = Math.min(Math.max(this.ui.y, 0), uiHeight);
  }

  /**
   * Draw the virtual cursor. The engine calls this last, above every overlay,
   * and it is a no-op unless the engine owns the cursor.
   */
  draw() {
    if (!this.locked || !this.draws) return;
    const ui = this.game.uiRenderer;
    const points = ARROW.map(({ x, y }) => ({ x: this.ui.x + x, y: this.ui.y + y }));
    ui.drawPath({
      points,
      closed: true,
      fillStyle: '#ffffff',
      strokeStyle: 'rgba(0, 0, 0, 0.85)',
      lineWidth: 1.5
    });
  }

  destroy() {
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.exit();
  }
}
