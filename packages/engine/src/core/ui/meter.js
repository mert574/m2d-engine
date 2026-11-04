import { UIElement } from './uiElement.js';

/**
 * A bar that shows a fraction: health, stamina, a timer. `value()` returns
 * `{ current, max }` or a 0..1 number each frame.
 *
 * @param {() => ({current: number, max: number}|number|null)} value
 * @param {Object} [options] - `UIElement` options, plus:
 * @param {string|((k: number) => string)} [options.color] - Fill, or a function of the fraction
 * @param {string} [options.background]
 * @param {string} [options.label] - Drawn to the left of the bar
 */
export class UIMeter extends UIElement {
  constructor(value, options = {}) {
    super({ anchor: 'top-left', pivot: 'top-left', width: 180, height: 10, ...options });
    this.value = value;
    this.color = options.color ?? '$color.text.accent';
    this.background = options.background ?? 'rgba(12, 18, 14, 0.84)';
    this.borderColor = options.borderColor ?? '$color.border.subtle';
    this.label = options.label ?? null;
  }

  draw() {
    const v = this.value();
    if (v == null) return;
    const k = typeof v === 'number' ? v : (v.max ? v.current / v.max : 0);
    const fraction = Math.max(0, Math.min(1, k));
    const f = this.frame;
    const paint = this.paint;
    paint.drawRect({ x: f.x, y: f.y, width: f.width, height: f.height, fillStyle: this.background, strokeStyle: this.borderColor, lineWidth: 1, cornerRadius: 4 });
    paint.drawRect({
      x: f.x + 2, y: f.y + 2, width: (f.width - 4) * fraction, height: f.height - 4,
      fillStyle: typeof this.color === 'function' ? this.color(fraction) : this.color, cornerRadius: 3
    });
    if (this.label) {
      paint.drawText({ x: f.x, y: f.y - 3, text: this.label, fillStyle: '$color.text.muted', fontSize: 11, letterSpacing: 1, textBaseline: 'bottom' });
    }
  }
}
