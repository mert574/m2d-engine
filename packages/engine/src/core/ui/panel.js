import { UIElement } from './uiElement.js';

/**
 * A themed surface: the box every other piece of chrome sits on.
 *
 * Panels are why the settings menu, the debug readout and a game's own
 * dialogs can look like one product. Each of those used to draw its own
 * rounded rectangle with its own colour, border and radius literals, so
 * "the panel look" existed three times and matched nowhere. Here it is one
 * component reading `$color.surface.*`, `$radius.*` and `$elevation.*`.
 *
 * A panel is also a container in the ordinary sense — it has padding, and
 * children anchor against its content box — so building a dialog is adding
 * children to one rather than positioning everything against the screen and
 * hoping the numbers stay in agreement.
 */
export class UIPanel extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {'default'|'raised'|'sunken'|'none'} [options.surface='default'] -
   *   Which surface token fills the panel; `'none'` draws no fill
   * @param {string|Object} [options.background] - Explicit fill, overriding
   *   `surface`. Takes a colour, a token, or a gradient descriptor
   * @param {string|null} [options.borderColor='$color.border.subtle'] -
   *   `null` for no border
   * @param {number|string} [options.borderWidth='$border.hairline']
   * @param {number|string} [options.cornerRadius='$radius.lg']
   * @param {'none'|'low'|'medium'|'high'} [options.elevation='none'] - Drop
   *   shadow preset. Not free on the Canvas backend, which routes anything
   *   with a shadow through a scratch canvas
   * @param {boolean} [options.interactive=false] - Take part in hit testing.
   *   Off by default so a decorative panel does not swallow clicks meant for
   *   the world; a modal's backing panel turns it on
   */
  constructor(options = {}) {
    super({ pivot: 'center', ...options });
    this.surface = options.surface ?? 'default';
    this.background = options.background ?? null;
    this.borderColor = options.borderColor === undefined ? '$color.border.subtle' : options.borderColor;
    this.borderWidth = options.borderWidth ?? '$border.hairline';
    this.cornerRadius = options.cornerRadius ?? '$radius.lg';
    this.elevation = options.elevation ?? 'none';
    this.interactive = options.interactive ?? false;
    /**
     * Size to the bounding box of the children plus padding. A dialog is
     * then exactly as big as what is in it, which is the only way a row
     * added or removed at runtime keeps the panel honest.
     */
    this.fitContent = options.fitContent ?? false;
  }

  /**
   * Runs after the children have laid themselves out, so a content-sized
   * stack inside has already resolved its own size. Positions resolve on
   * read, so resizing here still lands correctly in the same frame's draw.
   */
  layout() {
    if (!this.fitContent) return;
    const pad = this.padding;
    let width = 0;
    let height = 0;
    for (const child of this.children) {
      if (!child.visible) continue;
      width = Math.max(width, Number.isFinite(child.width) ? child.width : 0);
      height = Math.max(height, Number.isFinite(child.height) ? child.height : 0);
    }
    this.width = width + pad.left + pad.right;
    this.height = height + pad.top + pad.bottom;
  }

  /** The fill, from the explicit background or the named surface token. */
  get fillStyle() {
    if (this.background !== null) return this.background;
    if (this.surface === 'none') return null;
    return `$color.surface.${this.surface}`;
  }

  draw() {
    const fillStyle = this.fillStyle;
    if (!fillStyle && !this.borderColor) return;

    this.paint.drawRect({
      ...this.frame,
      ...(fillStyle ? { fillStyle } : { fill: false }),
      ...(this.borderColor ? { strokeStyle: this.borderColor, lineWidth: this.borderWidth } : {}),
      cornerRadius: this.cornerRadius,
      ...(this.elevation !== 'none' ? { shadow: `$elevation.${this.elevation}` } : {})
    });
  }

  contains(x, y) {
    if (!this.interactive) return false;
    return super.contains(x, y);
  }
}
