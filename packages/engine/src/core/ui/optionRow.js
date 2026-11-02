import { UIElement } from './uiElement.js';

/**
 * A settings row: a label on the left, its current value on the right, and
 * a click that changes it.
 *
 * This is the shape almost every options screen in every game is made of,
 * and the settings menu previously drew it by hand — a `rows` array of hit
 * rectangles rebuilt on each frame and a `hoverIndex` integer, which is a
 * second, worse UI system living inside the UI module. As a component it
 * gets hover, press, disabled, focus and theming for free, and the menu
 * becomes a list of what the rows *mean*.
 *
 * The value is read through a function rather than stored, because what it
 * reports — the current resolution, whether fullscreen is on — is owned
 * elsewhere and can change without the row being told.
 */
export class UIOptionRow extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string} options.label
   * @param {() => string} [options.value] - Reads the current value
   * @param {(event: object) => void} [options.onActivate] - Clicking, or
   *   pressing Enter while focused
   * @param {number} [options.height=40]
   * @param {number|string} [options.inset='$space.md'] - Padding at each end
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', height: 40, focusable: true, ...options });
    this.label = options.label ?? '';
    this.readValue = options.value ?? null;
    this.onActivate = options.onActivate ?? null;
    this.inset = options.inset ?? '$space.md';
    this.barWidth = options.barWidth ?? 3;
    /** Eased selection amount, as in `UIMenuItem`. */
    this.selectedAmount = 0;
  }

  /** Whether this is the row that Enter or a click would take. */
  get isSelected() {
    return (this.isHovered || this.isFocused) && this.enabled;
  }

  update(deltaTime) {
    const target = this.isSelected ? 1 : 0;
    const rate = 1 - Math.pow(0.0015, deltaTime);
    this.selectedAmount += (target - this.selectedAmount) * rate;
    if (Math.abs(target - this.selectedAmount) < 0.005) this.selectedAmount = target;
  }

  /** The current value as text, or null when the row is just a label. */
  get valueText() {
    return this.readValue ? this.readValue() : null;
  }

  draw() {
    if (!this.game) return;
    const frame = this.frame;
    const inset = this.theme?.resolve(this.inset) ?? 12;
    const amount = this.selectedAmount;

    // A wash rather than a permanent strip: an unselected row is just type
    // on the panel, which is what keeps a list of them from reading as a
    // stack of web form fields.
    if (amount > 0.001) {
      this.paint.drawRect({
        ...frame,
        fillStyle: this.isPressed ? '$color.surface.active' : '$color.surface.hover',
        globalAlpha: amount
      });
      const height = frame.height * 0.55 * amount;
      this.paint.drawRect({
        x: frame.x,
        y: frame.y + (frame.height - height) / 2,
        width: this.barWidth,
        height,
        fillStyle: '$color.accent.default'
      });
    }

    this.paint.drawText({
      text: this.label.toUpperCase(),
      x: frame.x + inset + this.barWidth,
      y: frame.y + frame.height / 2,
      fillStyle: this.enabled
        ? (amount > 0.5 ? '$color.text.primary' : '$color.text.secondary')
        : '$color.text.muted',
      fontSize: '$font.size.caption',
      fontWeight: '$font.weight.medium',
      letterSpacing: '$font.tracking.wider',
      textAlign: 'left',
      textBaseline: 'middle'
    });

    const value = this.valueText;
    if (value == null) return;
    this.paint.drawText({
      text: value,
      x: frame.x + frame.width - inset,
      y: frame.y + frame.height / 2,
      fillStyle: this.enabled ? '$color.text.accent' : '$color.text.muted',
      fontSize: '$font.size.label',
      fontWeight: '$font.weight.medium',
      textAlign: 'right',
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
    this.onActivate?.(event);
  }
}
