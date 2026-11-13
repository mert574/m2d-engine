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
 * ## Variants
 *
 * The bar is one way to say "this line". A game's menu should not look
 * like every other game's, so `variant` picks another: `bracket` sets the
 * label between chevrons, `underline` draws a rule growing from the
 * label's middle, `block` fills the line behind inverted type, `dot` puts
 * a bead before it. All of them ease in with `selectedAmount`.
 *
 * `glow` (0..1, driven by a scene's select effect) lights the label with a
 * soft halo in the accent colour.
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
   * @param {string} [options.barColor] - The accent: the bar, the brackets, the rule, the block
   * @param {'bar'|'bracket'|'underline'|'block'|'dot'} [options.variant='bar']
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
    this.variant = options.variant ?? 'bar';
    if (options.fontFamily) this.fontFamily = options.fontFamily;
    /** A halo around the label, 0..1; a scene's `glow` select effect drives it. */
    this.glow = 0;

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
    const amount = this.selectedAmount;
    const label = this.uppercase ? this.text.toUpperCase() : this.text;
    const font = { fontSize: this.fontSize, fontWeight: this.fontWeight, letterSpacing: this.letterSpacing, ...(this.fontFamily && { fontFamily: this.fontFamily }) };
    const width = this.paint.measureText(label, font).width;
    const middle = frame.y + frame.height / 2;
    const slide = this.variant === 'bar' || this.variant === 'dot' ? this.indent * amount : 0;
    const left = this.barWidth + 10 + slide;
    const textX = this.align === 'center' ? frame.x + frame.width / 2
      : this.align === 'right' ? frame.x + frame.width - left
        : frame.x + left;
    const textLeft = this.align === 'center' ? textX - width / 2 : this.align === 'right' ? textX - width : textX;

    if (amount > 0.001) this.#drawSelection(frame, { textLeft, width, middle, amount });

    const inverted = this.variant === 'block' && amount > 0.5;
    this.paint.drawText({
      text: label,
      x: textX,
      y: middle,
      fillStyle: this.enabled
        ? (inverted ? '$color.bg.base' : amount > 0.5 ? this.selectedColor : this.color)
        : '$color.text.muted',
      ...font,
      textAlign: this.align,
      textBaseline: 'middle',
      ...(this.glow > 0.01 && { shadow: { color: this.barColor, blur: 18 * this.glow, offsetX: 0, offsetY: 0 } })
    });
  }

  /** The variant's mark of selection, eased in by `amount`. */
  #drawSelection(frame, { textLeft, width, middle, amount }) {
    const paint = this.paint;
    switch (this.variant) {
      case 'bracket': {
        const gap = 10 + 8 * (1 - amount);
        const style = { fontSize: this.fontSize, fontWeight: this.fontWeight, fillStyle: this.barColor, textBaseline: 'middle', globalAlpha: amount };
        paint.drawText({ ...style, text: '›', x: textLeft - gap, y: middle, textAlign: 'right' });
        paint.drawText({ ...style, text: '‹', x: textLeft + width + gap, y: middle, textAlign: 'left' });
        break;
      }
      case 'underline': {
        const length = width * amount;
        paint.drawRect({ x: textLeft + (width - length) / 2, y: middle + frame.height * 0.3, width: length, height: this.barWidth * 0.7, fillStyle: this.barColor });
        break;
      }
      case 'block':
        paint.drawRect({ x: frame.x, y: frame.y + frame.height * 0.08, width: frame.width, height: frame.height * 0.84, fillStyle: this.barColor, globalAlpha: amount });
        break;
      case 'dot':
        paint.drawArc({ x: textLeft - 14, y: middle, radius: 4 * amount, fillStyle: this.barColor });
        break;
      default: {
        if (this.align !== 'left') break;
        // The bar grows from the middle outward, which reads as the line
        // arriving rather than as a block switching on.
        const height = frame.height * 0.52 * amount;
        paint.drawRect({ x: frame.x, y: frame.y + (frame.height - height) / 2, width: this.barWidth, height, fillStyle: this.barColor });
      }
    }
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
