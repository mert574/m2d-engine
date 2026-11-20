/**
 * The CSS font shorthand text is measured and rasterized with.
 *
 * One builder, because measuring and drawing have to agree *exactly*: the
 * WebGL backend measures with it and keys its rasterized label cache on it.
 * A string built even slightly differently in one place would lay text out
 * against one font and draw it in another, and the only symptom would be
 * text that is subtly mispositioned.
 */

/** What a label's font is given as: the fields a draw call carries. */
export interface FontOptions {
  fontSize?: number | string;
  fontStyle?: string;
  fontWeight?: string | number;
  fontFamily?: string;
  /** The CSS shorthand, when a caller has that instead of a size. */
  font?: string;
}

/** Order is fixed by CSS: style, then weight, then size, then family. */
export function buildFontString(options: FontOptions = {}): string {
  const size = typeof options.fontSize === 'number'
    ? `${options.fontSize}px`
    : (options.fontSize || '16px');
  const style = options.fontStyle || 'normal';
  const weight = options.fontWeight || 'normal';
  const family = options.fontFamily || 'system-ui';
  return `${style} ${weight} ${size} ${family}`;
}

/** Font size in pixels, for metrics that the shorthand cannot give back. */
export function fontSizePx(options: FontOptions = {}): number {
  return parseInt(String(options.fontSize ?? options.font)) || 16;
}

/**
 * Apply letter spacing to a 2D context, where the browser supports it.
 *
 * `ctx.letterSpacing` is a recent addition and not universal. Writing to it
 * on an engine that lacks it is harmless — the property simply does not
 * exist — so tracking degrades to none rather than throwing, which is the
 * same bargain the renderer makes for every other optional nicety.
 *
 * It affects `measureText` as well as drawing, so a tracked label measures
 * at the width it will actually occupy.
 *
 * @param spacing - Units, or a CSS length.
 */
export function applyLetterSpacing(
  ctx: CanvasRenderingContext2D, spacing: number | string | undefined | null
): void {
  if (spacing === undefined || spacing === null) return;
  const value = typeof spacing === 'number' ? `${spacing}px` : spacing;
  // Guarded so a context without the property is not given a stray field.
  if ('letterSpacing' in ctx) ctx.letterSpacing = value;
}
