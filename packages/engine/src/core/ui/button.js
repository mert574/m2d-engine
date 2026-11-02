import { UIElement } from './uiElement.js';

/**
 * A clickable button.
 *
 * It fires on *release*, not on press: a press that slides off the button
 * before letting go is a cancelled press and does nothing, which is what
 * every other button the player has ever used does — and what makes a button
 * usable on a touchscreen, where the finger covers the thing it is aiming
 * at. `isPressed` is tracked by `UIElement` so the button can show the state
 * while it is held.
 *
 * ## Variants, not colours
 *
 * A button used to take five colour options and default them to `#000` on
 * `#333`, so every caller either accepted that or restated a palette. It now
 * picks a **variant** — what the button *means* — and the theme decides what
 * that looks like in each interaction state. `primary` is the one action a
 * screen is about, `secondary` is everything else, `ghost` is chrome that
 * should not compete with the art behind it, and `danger` is destructive.
 *
 * Any individual field can still be overridden with a literal or a token,
 * for the cases a variant does not cover.
 */

/**
 * Per-variant style declarations. Each is a base style with deltas for the
 * states that differ; `resolveStateStyle` flattens them (see `theme.js`).
 */
export const BUTTON_VARIANTS = Object.freeze({
  primary: {
    background: '$color.accent.default',
    textColor: '$color.accent.contrast',
    borderColor: null,
    fontWeight: '$font.weight.semibold',
    hovered: { background: '$color.accent.hover' },
    pressed: { background: '$color.accent.active' },
    disabled: { background: '$color.surface.sunken', textColor: '$color.text.muted' }
  },
  secondary: {
    background: '$color.surface.raised',
    textColor: '$color.text.primary',
    borderColor: '$color.border.subtle',
    fontWeight: '$font.weight.medium',
    hovered: { background: '$color.surface.hover', borderColor: '$color.border.default' },
    pressed: { background: '$color.surface.active', borderColor: '$color.border.strong' },
    disabled: { background: '$color.surface.sunken', textColor: '$color.text.muted', borderColor: null }
  },
  ghost: {
    background: null,
    textColor: '$color.text.secondary',
    borderColor: null,
    fontWeight: '$font.weight.medium',
    hovered: { background: '$color.surface.hover', textColor: '$color.text.primary' },
    pressed: { background: '$color.surface.active', textColor: '$color.text.primary' },
    disabled: { background: null, textColor: '$color.text.muted' }
  },
  danger: {
    background: '$color.status.danger',
    textColor: '$color.text.inverse',
    borderColor: null,
    fontWeight: '$font.weight.semibold',
    hovered: { background: '$color.palette.red.400' },
    pressed: { background: '$color.palette.red.400' },
    disabled: { background: '$color.surface.sunken', textColor: '$color.text.muted' }
  }
});

export class UIButton extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string} [options.text='']
   * @param {(event: object) => void} [options.onClick]
   * @param {keyof BUTTON_VARIANTS} [options.variant='secondary']
   * @param {number} [options.width=200]
   * @param {number} [options.height=44]
   * @param {string|Object} [options.background] - Override the variant's fill
   * @param {string} [options.textColor] - Override the variant's label colour
   * @param {string|null} [options.borderColor] - Override the variant's border
   * @param {number|string} [options.borderWidth='$border.hairline']
   * @param {number|string} [options.cornerRadius='$radius.md']
   * @param {string|number} [options.fontSize='$font.size.body']
   * @param {string} [options.fontFamily] - Defaults to the theme's UI face
   * @param {string} [options.fontWeight] - Override the variant's weight
   * @param {'normal'|'italic'} [options.fontStyle='normal']
   * @param {'none'|'low'|'medium'|'high'} [options.elevation='none']
   * @param {Object} [options.styles] - Replace the variant's declaration
   *   outright, for a one-off button the variants do not describe
   */
  constructor(options = {}) {
    super({ pivot: 'center', width: 200, height: 44, focusable: true, ...options });

    this.text = options.text ?? '';
    this.handleClick = options.onClick ?? null;
    this.variant = options.variant ?? 'secondary';

    /**
     * The variant's declaration with any explicit overrides merged in, so a
     * caller can change one colour without restating the state machine.
     */
    this.styles = options.styles ?? withOverrides(
      BUTTON_VARIANTS[this.variant] ?? BUTTON_VARIANTS.secondary,
      options
    );

    this.borderWidth = options.borderWidth ?? '$border.hairline';
    this.cornerRadius = options.cornerRadius ?? '$radius.md';
    this.fontSize = options.fontSize ?? '$font.size.body';
    this.fontFamily = options.fontFamily;
    this.fontStyle = options.fontStyle ?? 'normal';
    this.elevation = options.elevation ?? 'none';
  }

  draw() {
    if (!this.game) return;

    const style = this.styleFor(this.styles);
    const frame = this.frame;

    if (style.background || style.borderColor) {
      this.paint.drawRect({
        ...frame,
        ...(style.background ? { fillStyle: style.background } : { fill: false }),
        ...(style.borderColor
          ? { strokeStyle: style.borderColor, lineWidth: this.borderWidth }
          : {}),
        cornerRadius: this.cornerRadius,
        ...(this.elevation !== 'none' ? { shadow: `$elevation.${this.elevation}` } : {})
      });
    }

    this.paint.drawText({
      // Centred on the *frame*, not on the position. They are the same
      // thing for a free-standing button, whose pivot is its centre — but a
      // layout pins its children's pivot to the top-left, and a label
      // centred on that lands in the corner.
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
      text: this.text,
      fillStyle: style.textColor,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: style.fontWeight,
      fontStyle: this.fontStyle,
      textAlign: 'center',
      textBaseline: 'middle'
    });
  }

  onHover() {
    // A disabled button never reaches here — `handleInput` returns early —
    // so the cursor cannot promise an action that will not happen.
    this.paint.setCursor('pointer');
  }

  onHoverEnd() {
    this.paint.setCursor('default');
  }

  onClick(event) {
    this.handleClick?.(event);
  }
}

/**
 * Merge per-field overrides into a variant declaration. Overrides apply to
 * the base style only: a caller who sets `background` is choosing the resting
 * fill, not flattening the hover and pressed states onto it.
 */
function withOverrides(variant, options) {
  const overrides = {};
  for (const key of ['background', 'textColor', 'borderColor', 'fontWeight']) {
    if (options[key] !== undefined) overrides[key] = options[key];
  }
  return Object.keys(overrides).length ? { ...variant, ...overrides } : variant;
}
