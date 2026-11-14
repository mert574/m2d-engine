import { UIElement } from './uiElement.js';

/**
 * An on-screen control that acts as a key.
 *
 * Pressing it pushes a `keydown` record for its `code` into the input
 * system and releasing it a `keyup`, through the same seam the real
 * keyboard uses, so a `KeyboardControl` or a `CarControl` bound to that
 * code cannot tell a thumb from a key, and a replay that records keys
 * records the thumb too. A D-pad, a jump button, a brake pedal, or a
 * `zone`: an invisible area (half the screen, say) that holds a key while
 * a finger rests anywhere on it.
 *
 * Releasing is the part a touchscreen gets wrong. A finger that slides off
 * the button lifts somewhere else, so the button's own `onPointerUp` never
 * runs: the button remembers which pointer pressed it and listens to the
 * input for that pointer's release, cancelled or not. Several buttons may
 * be held by several fingers at once, each by its own.
 *
 * @param {object} options - `UIElement`'s, plus:
 * @param {string} options.code - The physical key code it stands for (`'ArrowLeft'`, `'Space'`)
 * @param {string} [options.label] - Drawn on the button
 * @param {boolean} [options.zone=false] - Draw nothing at rest, a faint wash while held
 * @param {'round'|'rect'} [options.shape='round']
 * @param {string} [options.background] - Resting fill; a theme token or a colour
 * @param {string} [options.heldBackground] - Fill while held
 * @param {string} [options.color] - The label's colour
 * @param {string} [options.fontSize]
 */
export class UIKeyButton extends UIElement {
  constructor(options = {}) {
    super({ width: 72, height: 72, ...options });
    if (!options.code) throw new Error('UIKeyButton needs the key code it stands for');
    this.code = options.code;
    this.label = options.label ?? '';
    this.zone = options.zone ?? false;
    this.shape = options.shape ?? 'round';
    this.background = options.background ?? 'rgba(255, 255, 255, 0.14)';
    this.heldBackground = options.heldBackground ?? '$color.accent.default';
    this.color = options.color ?? '$color.text.primary';
    this.fontSize = options.fontSize ?? '$font.size.subheading';
    /** Whether the key is down because of this button. */
    this.held = false;
    /** The pointer holding it, or null. */
    this.pointerId = null;
    this.off = null;
  }

  onMount() {
    this.off = this.game.input.on('pointerup', (event) => {
      if (event.pointerId === this.pointerId) this.release();
    });
  }

  onUnmount() {
    this.off?.();
    this.off = null;
    this.release();
  }

  onPointerDown(event) {
    this.pointerId = event.pointerId ?? -1;
    this.press();
  }

  onPointerUp() {
    this.release();
  }

  /** Put the key down, as the keyboard would. */
  press() {
    if (this.held) return;
    this.held = true;
    this.#push('keydown');
  }

  /** Let the key up. Safe to call when it is not held. */
  release() {
    this.pointerId = null;
    if (!this.held) return;
    this.held = false;
    this.#push('keyup');
  }

  #push(kind) {
    const input = this.game?.input;
    if (!input) return;
    input.push({ kind, code: this.code, key: this.code, time: performance.now() });
    input.flush();
  }

  draw() {
    const { x, y, width, height } = this.frame;
    const paint = this.paint;
    if (this.zone) {
      if (this.held) paint.drawRect({ x, y, width, height, fillStyle: 'rgba(255, 255, 255, 0.05)' });
      return;
    }
    const fillStyle = this.held ? this.heldBackground : this.background;
    if (this.shape === 'round') {
      paint.drawArc({ x: x + width / 2, y: y + height / 2, radius: Math.min(width, height) / 2, fillStyle });
    } else {
      paint.drawRect({ x, y, width, height, fillStyle, cornerRadius: '$radius.lg' });
    }
    if (this.label) {
      paint.drawText({
        text: this.label, x: x + width / 2, y: y + height / 2,
        fillStyle: this.color, fontSize: this.fontSize, fontWeight: '$font.weight.semibold',
        textAlign: 'center', textBaseline: 'middle'
      });
    }
  }
}
