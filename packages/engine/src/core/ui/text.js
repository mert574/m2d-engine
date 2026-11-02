import { UIElement, ANCHOR_ORIGINS } from './uiElement.js';

/**
 * A line of text.
 *
 * ## Why it measures itself
 *
 * Text used to have no size at all: it drew at its position and reported a
 * zero box, so it could not be hit-tested, could not be centred inside
 * anything, and could not take part in a layout. It now measures itself
 * through the renderer and keeps `width`/`height` current, which is what
 * lets a label be a real box in a tree.
 *
 * Measuring costs a `measureText` per label, so the result is cached and
 * recomputed only when the text or the font that would render it changes.
 *
 * ## Alignment and the pivot
 *
 * `align` and `baseline` are the *renderer's* notion of where the position
 * sits relative to the glyphs, and the element's `pivot` is the equivalent
 * notion for its box. Setting one without the other is how a label ends up
 * drawn centred while reporting a left-aligned frame, so the two are kept in
 * step: changing `align` or `baseline` moves the pivot to match, unless the
 * caller pinned a pivot explicitly.
 */
export class UIText extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string} [options.text='']
   * @param {string} [options.color='$color.text.primary']
   * @param {string|number} [options.fontSize='$font.size.body']
   * @param {string} [options.fontFamily] - Defaults to the theme's UI face
   * @param {string} [options.fontWeight='$font.weight.regular']
   * @param {'normal'|'italic'} [options.fontStyle='normal']
   * @param {number|string} [options.letterSpacing] - Tracking, in units or
   *   a token. Counted in the measured width
   * @param {'left'|'center'|'right'} [options.align='left']
   * @param {'top'|'middle'|'bottom'} [options.baseline='top']
   * @param {string} [options.outlineColor] - Drawn behind the fill, for text
   *   over busy art
   * @param {number} [options.outlineWidth=3]
   * @param {'none'|'low'|'medium'|'high'} [options.elevation='none']
   * @param {boolean} [options.interactive=false] - Take part in hit testing.
   *   Off by default: a caption that swallowed clicks would be a bug
   */
  constructor(options = {}) {
    super(options);

    this.text = options.text ?? '';
    this.color = options.color ?? '$color.text.primary';
    this.fontSize = options.fontSize ?? '$font.size.body';
    this.fontFamily = options.fontFamily;
    this.fontWeight = options.fontWeight ?? '$font.weight.regular';
    this.fontStyle = options.fontStyle ?? 'normal';
    this.letterSpacing = options.letterSpacing ?? undefined;
    this.outlineColor = options.outlineColor ?? null;
    this.outlineWidth = options.outlineWidth ?? 3;
    this.elevation = options.elevation ?? 'none';
    this.interactive = options.interactive ?? false;

    /** Whether the caller pinned a pivot, in which case alignment leaves it alone. */
    this.pivotLocked = options.pivot != null;
    this._align = options.align ?? 'left';
    this._baseline = options.baseline ?? 'top';
    if (!this.pivotLocked) this.pivot = pivotFor(this._align, this._baseline);

    /** Cache key the current measurement was taken under. @type {string|null} */
    this.measuredKey = null;
  }

  /** @type {'left'|'center'|'right'} */
  get align() { return this._align; }

  set align(value) {
    this._align = value;
    if (!this.pivotLocked) this.pivot = pivotFor(this._align, this._baseline);
  }

  /** @type {'top'|'middle'|'bottom'} */
  get baseline() { return this._baseline; }

  set baseline(value) {
    this._baseline = value;
    if (!this.pivotLocked) this.pivot = pivotFor(this._align, this._baseline);
  }

  /**
   * The draw options that decide both the metrics and the rendering.
   * Tracking belongs here too: it changes how wide the label is, so a
   * measurement taken without it would lay the text out short.
   */
  get fontStyleOptions() {
    return {
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      letterSpacing: this.letterSpacing
    };
  }

  /**
   * Re-measure if the text or font changed, and write the result into
   * `width`/`height`.
   *
   * Called from `update` so the box is current before anything reads it this
   * frame, and again at the top of `draw` for elements drawn without an
   * update pass (an overlay, a one-off draw in a test).
   */
  measure() {
    if (!this.game) return;
    const key = `${this.text}\u0001${this.fontSize}\u0001${this.fontFamily}` +
      `\u0001${this.fontWeight}\u0001${this.fontStyle}\u0001${this.letterSpacing}`;
    if (key === this.measuredKey) return;

    const metrics = this.paint.measureText(this.text, this.fontStyleOptions);
    this.width = metrics.width;
    this.height = metrics.height;
    this.measuredKey = key;
  }

  update() {
    this.measure();
  }

  draw() {
    if (!this.game) return;
    this.measure();

    // Derived from the frame rather than taken as the position, because a
    // layout may have stretched this label to its container's width. For an
    // unstretched label the two are identical — the pivot tracks `align`,
    // so `frame.x + fraction * width` *is* the position.
    const frame = this.frame;
    const [fx, fy] = ALIGN_FRACTIONS[this._align] !== undefined
      ? [ALIGN_FRACTIONS[this._align], BASELINE_FRACTIONS[this._baseline] ?? 0]
      : [0, 0];

    this.paint.drawText({
      text: this.text,
      x: frame.x + fx * frame.width,
      y: frame.y + fy * frame.height,
      fillStyle: this.color,
      ...this.fontStyleOptions,
      textAlign: this._align,
      textBaseline: this._baseline,
      ...(this.outlineColor
        ? { strokeStyle: this.outlineColor, lineWidth: this.outlineWidth }
        : {}),
      ...(this.elevation !== 'none' ? { shadow: `$elevation.${this.elevation}` } : {})
    });
  }

  contains(x, y) {
    if (!this.interactive) return false;
    return super.contains(x, y);
  }
}

/** Where along the box each alignment puts the text's origin. */
const ALIGN_FRACTIONS = Object.freeze({ left: 0, center: 0.5, right: 1 });
const BASELINE_FRACTIONS = Object.freeze({ top: 0, middle: 0.5, bottom: 1 });

/**
 * The pivot that puts an element's box where `align`/`baseline` put its
 * glyphs. Falls back to the top-left for anything unrecognized, which is
 * also what the renderer's text defaults do.
 */
function pivotFor(align, baseline) {
  const horizontal = { left: 'left', center: 'center', right: 'right' }[align] ?? 'left';
  const vertical = { top: 'top', middle: 'middle', bottom: 'bottom' }[baseline] ?? 'top';
  if (vertical === 'middle') return horizontal === 'center' ? 'center' : horizontal;
  const name = horizontal === 'center' ? vertical : `${vertical}-${horizontal}`;
  return name in ANCHOR_ORIGINS ? name : 'top-left';
}
