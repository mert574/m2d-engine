import { UIElement } from './uiElement.js';

/**
 * A settings row: a label on the left, its current value on the right, and
 * a way to change it.
 *
 * This is the shape almost every options screen in every game is made of,
 * and the settings menu previously drew it by hand — a `rows` array of hit
 * rectangles rebuilt on each frame and a `hoverIndex` integer, which is a
 * second, worse UI system living inside the UI module. As a component it
 * gets hover, press, disabled, focus and theming for free, and the menu
 * becomes a list of what the rows *mean*.
 *
 * ## How a value changes
 *
 * One callback: `onStep(step)`. Left and Right pass `-1` and `+1` — the
 * controller grammar, stick between rows, d-pad across values — and a
 * click or Enter is a forward step. A row that is an action rather than a
 * value (Close, Apply) takes `onActivate` instead and has nothing to step.
 *
 * ## What the row shows about its value
 *
 * The value is read through a function rather than stored, because what it
 * reports — the current resolution, whether fullscreen is on — is owned
 * elsewhere and can change without the row being told. A row that knows
 * how many choices it cycles through (`choices`) draws a tick track under
 * the value, so "3 of 5" is visible without reading. A steppable row keeps
 * faint chevrons either side of its value at all times — they brighten on
 * selection but never appear or move, so nothing in the row ever shifts.
 */
export class UIOptionRow extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string} options.label
   * @param {() => string} [options.value] - Reads the current value
   * @param {(step: number) => void} [options.onStep] - Change the value:
   *   `-1` for Left, `+1` for Right, a click or Enter
   * @param {(event: object) => void} [options.onActivate] - For an action
   *   row with nothing to step. Clicking, or Enter while focused
   * @param {() => {index: number, count: number}} [options.choices] - Where
   *   the value sits in its cycle, for the tick track. Omit for a row with
   *   no natural order
   * @param {string} [options.description] - One line about what the setting
   *   does, for a screen to show for the focused row
   * @param {number} [options.height=40]
   * @param {number|string} [options.inset='$space.md'] - Padding at each end
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', height: 40, focusable: true, ...options });
    this.label = options.label ?? '';
    this.readValue = options.value ?? null;
    this.onStep = options.onStep ?? null;
    this.onActivate = options.onActivate ?? null;
    this.readChoices = options.choices ?? null;
    this.description = options.description ?? '';
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

  /** Whether Left and Right do anything here. */
  get steppable() {
    return this.onStep != null;
  }

  /** Step the value: `-1` back, `+1` forward. Used by Left and Right. */
  adjust(step) {
    if (!this.enabled) return;
    this.onStep?.(step);
  }

  draw() {
    if (!this.game) return;
    const frame = this.frame;
    const inset = this.theme?.resolve(this.inset) ?? 12;
    const amount = this.selectedAmount;
    const midY = frame.y + frame.height / 2;

    // A wash rather than a permanent strip: an unselected row is just type
    // on the panel, which is what keeps a list of them from reading as a
    // stack of web form fields.
    if (amount > 0.001) {
      this.paint.drawRect({
        ...frame,
        fillStyle: {
          type: 'linear', x0: frame.x, y0: 0, x1: frame.x + frame.width, y1: 0,
          stops: [
            { offset: 0, color: this.isPressed ? '$color.surface.active' : '$color.surface.hover' },
            { offset: 1, color: 'rgba(124, 208, 255, 0)' }
          ]
        },
        globalAlpha: amount
      });
      const height = frame.height * 0.55 * amount;
      this.paint.drawRect({
        x: frame.x,
        y: midY - height / 2,
        width: this.barWidth,
        height,
        fillStyle: '$color.accent.default'
      });
    }

    this.paint.drawText({
      text: this.label.toUpperCase(),
      x: frame.x + inset + this.barWidth,
      y: midY,
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

    const choices = this.readChoices?.() ?? null;
    const valueStyle = {
      fontSize: '$font.size.label',
      fontWeight: '$font.weight.medium'
    };
    const right = frame.x + frame.width - inset;
    // Room for the chevron on the right, so the value does not jump when
    // the row is selected and the chevrons appear.
    const chevronRoom = 16;
    const valueRight = right - chevronRoom;
    const valueY = choices ? midY - 4 : midY;

    this.paint.drawText({
      text: value,
      x: valueRight,
      y: valueY,
      fillStyle: this.enabled
        ? (amount > 0.5 ? '$color.text.primary' : '$color.text.accent')
        : '$color.text.muted',
      ...valueStyle,
      textAlign: 'right',
      textBaseline: 'middle'
    });

    // Chevrons for Left and Right. Always there on a steppable row — they
    // only brighten with the selection, so the row never reflows and
    // nothing pops in or out on hover.
    if (this.enabled && this.steppable) {
      const width = this.paint.measureText(value, valueStyle).width;
      this.paint.drawText({
        text: '‹', x: valueRight - width - 8, y: valueY,
        fillStyle: '$color.text.accent', globalAlpha: 0.25 + 0.75 * amount,
        fontSize: '$font.size.body', textAlign: 'right', textBaseline: 'middle'
      });
      this.paint.drawText({
        text: '›', x: right - 4, y: valueY,
        fillStyle: '$color.text.accent', globalAlpha: 0.25 + 0.75 * amount,
        fontSize: '$font.size.body', textAlign: 'right', textBaseline: 'middle'
      });
    }

    // The tick track: one tick per choice, the current one lit.
    if (choices && choices.count > 1) {
      const tick = 10;
      const gap = 3;
      const total = choices.count * tick + (choices.count - 1) * gap;
      const x0 = valueRight - total;
      for (let i = 0; i < choices.count; i++) {
        this.paint.drawRect({
          x: x0 + i * (tick + gap),
          y: midY + 7,
          width: tick,
          height: 2,
          fillStyle: i === choices.index ? '$color.accent.default' : '$color.border.default',
          cornerRadius: 1
        });
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
    if (this.onActivate) this.onActivate(event);
    else this.adjust(1);
  }
}
