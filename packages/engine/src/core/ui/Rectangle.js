import { UIElement } from './uiElement.js';

/**
 * A plain rectangle: a backdrop, a divider, a bar.
 *
 * For anything that is *chrome* — a dialog, a card, a readout — reach for
 * `UIPanel` instead, which carries the theme's surface, border, radius and
 * elevation. This is the primitive underneath that, for when a flat shape is
 * genuinely all that is wanted.
 */
export class UIRectangle extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string|Object} [options.color='$color.surface.default'] - Fill
   *   colour, token, or gradient descriptor
   * @param {boolean} [options.fill=false] - Stretch over the whole UI space
   *   every draw, ignoring position and size. For backgrounds: UI space
   *   grows with the display's aspect ratio, so no fixed design-sized rect
   *   can be relied on to cover it
   * @param {boolean} [options.interactive=false] - Take part in hit testing
   * @param {string|null} [options.borderColor=null]
   * @param {number|string} [options.borderWidth='$border.hairline']
   * @param {number|string} [options.cornerRadius=0]
   */
  constructor(options = {}) {
    super({ pivot: 'center', ...options });
    this.color = options.color ?? '$color.surface.default';
    this.fill = options.fill ?? false;
    this.interactive = options.interactive ?? false;
    this.borderColor = options.borderColor ?? null;
    this.borderWidth = options.borderWidth ?? '$border.hairline';
    this.cornerRadius = options.cornerRadius ?? 0;
  }

  draw() {
    if (!this.game) return;

    const border = this.borderColor
      ? { strokeStyle: this.borderColor, lineWidth: this.borderWidth }
      : {};

    if (this.fill) {
      const ui = this.paint;
      this.paint.drawRect({
        x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: this.color, ...border
      });
      return;
    }

    this.paint.drawRect({
      ...this.frame,
      fillStyle: this.color,
      cornerRadius: this.cornerRadius,
      ...border
    });
  }

  contains(x, y) {
    if (!this.interactive) return false;
    // A full-bleed rectangle covers the display however big it is, so its
    // own frame is not what it occupies.
    if (this.fill) {
      const ui = this.game?.uiRenderer;
      return !!ui && x >= 0 && y >= 0 && x <= ui.width && y <= ui.height;
    }
    return super.contains(x, y);
  }
}
