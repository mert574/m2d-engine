import { UIElement } from './uiElement.js';

/**
 * One line in a game menu.
 *
 * ## Why not a button
 *
 * `UIButton` is a *web* button: a filled, rounded rectangle you click. That
 * is the right shape for a dialog's "Confirm" and the wrong one for a main
 * menu, and a column of them is the single clearest reason a menu reads as a
 * web page rather than as a game. Almost no shipped game draws its main menu
 * that way.
 *
 * A menu item is **type, not chrome**. The selection is shown by a bar in
 * the margin, the label brightening, and the whole line stepping to the
 * right — the vocabulary games have used since menus existed. Nothing is
 * enclosed in a box.
 *
 * Labels are tracked-out uppercase by default, which is the other half of
 * why game UI reads as game UI. Tracking needs `ctx.letterSpacing`; where
 * the browser lacks it the text simply draws untracked.
 *
 * ## Selection is one thing
 *
 * There is no separate focus appearance: `UIElement.state` reports
 * `'hovered'` for a keyboard-selected item too, so the pointer and the
 * d-pad light up the same line in the same way.
 */
export class UIMenuItem extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string} [options.text='']
   * @param {(event: object) => void} [options.onSelect]
   * @param {number} [options.height=44]
   * @param {boolean} [options.uppercase=true]
   * @param {number} [options.indent=14] - How far the line steps right when
   *   selected, in UI units
   * @param {number} [options.barWidth=3] - Width of the selection bar
   * @param {string} [options.align='left'] - `'left'` or `'center'`
   * @param {string|number} [options.fontSize='$font.size.subheading']
   * @param {string} [options.fontWeight='$font.weight.medium']
   * @param {number|string} [options.letterSpacing='$font.tracking.wide']
   * @param {string} [options.color] - Resting label colour
   * @param {string} [options.selectedColor] - Selected label colour
   * @param {string} [options.barColor]
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', height: 44, focusable: true, ...options });

    this.text = options.text ?? '';
    this.onSelect = options.onSelect ?? null;
    this.uppercase = options.uppercase ?? true;
    this.indent = options.indent ?? 14;
    this.barWidth = options.barWidth ?? 3;
    this.align = options.align ?? 'left';

    this.fontSize = options.fontSize ?? '$font.size.subheading';
    this.fontWeight = options.fontWeight ?? '$font.weight.medium';
    this.letterSpacing = options.letterSpacing ?? '$font.tracking.wide';
    this.color = options.color ?? '$color.text.secondary';
    this.selectedColor = options.selectedColor ?? '$color.text.primary';
    this.barColor = options.barColor ?? '$color.accent.default';

    /**
     * How far along the selection animation this item is, 0..1. Driven here
     * rather than by the motion manager because it is a continuous response
     * to a state that can flip back at any moment, not a one-shot.
     */
    this.selectedAmount = 0;
  }

  /** Whether this is the line that Enter or a click would take. */
  get isSelected() {
    return (this.isHovered || this.isFocused) && this.enabled;
  }

  update(deltaTime) {
    // Eased by approach rather than linearly, so reversing mid-slide does
    // not visibly kink.
    const target = this.isSelected ? 1 : 0;
    const rate = 1 - Math.pow(0.0015, deltaTime);
    this.selectedAmount += (target - this.selectedAmount) * rate;
    if (Math.abs(target - this.selectedAmount) < 0.005) this.selectedAmount = target;
  }

  draw() {
    if (!this.game) return;
    const frame = this.frame;
    const slide = this.indent * this.selectedAmount;

    if (this.selectedAmount > 0.001 && this.align === 'left') {
      // The bar grows from the middle outward, which reads as the line
      // arriving rather than as a block switching on.
      const height = frame.height * 0.52 * this.selectedAmount;
      this.paint.drawRect({
        x: frame.x,
        y: frame.y + (frame.height - height) / 2,
        width: this.barWidth,
        height,
        fillStyle: this.barColor
      });
    }

    const label = this.uppercase ? this.text.toUpperCase() : this.text;
    const centred = this.align === 'center';
    this.paint.drawText({
      text: label,
      x: centred ? frame.x + frame.width / 2 : frame.x + this.barWidth + 10 + slide,
      y: frame.y + frame.height / 2,
      fillStyle: this.enabled
        ? (this.selectedAmount > 0.5 ? this.selectedColor : this.color)
        : '$color.text.muted',
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      letterSpacing: this.letterSpacing,
      textAlign: centred ? 'center' : 'left',
      textBaseline: 'middle'
    });
  }

  onHover() {
    this.paint.setCursor('pointer');
  }

  onHoverEnd() {
    this.paint.setCursor('default');
  }

  onClick(event) {
    this.onSelect?.(event);
  }
}
