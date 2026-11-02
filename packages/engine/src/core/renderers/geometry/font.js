/**
 * The CSS font shorthand both backends set text with.
 *
 * Shared rather than duplicated because the two have to agree *exactly*:
 * the Canvas backend measures and draws with it, and the WebGL backend
 * measures with it and keys its rasterized label cache on it. A backend that
 * built the string even slightly differently would lay text out against one
 * font and draw it in another, and the only symptom would be text that is
 * subtly mispositioned on one backend.
 */

/** Order is fixed by CSS: style, then weight, then size, then family. */
export function buildFontString(options = {}) {
  const size = typeof options.fontSize === 'number'
    ? `${options.fontSize}px`
    : (options.fontSize || '16px');
  const style = options.fontStyle || 'normal';
  const weight = options.fontWeight || 'normal';
  const family = options.fontFamily || 'system-ui';
  return `${style} ${weight} ${size} ${family}`;
}

/** Font size in pixels, for metrics that the shorthand cannot give back. */
export function fontSizePx(options = {}) {
  return parseInt(options.fontSize ?? options.font) || 16;
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number|string|undefined} spacing - Units, or a CSS length
 */
export function applyLetterSpacing(ctx, spacing) {
  if (spacing === undefined || spacing === null) return;
  const value = typeof spacing === 'number' ? `${spacing}px` : spacing;
  // Guarded so a context without the property is not given a stray field.
  if ('letterSpacing' in ctx) ctx.letterSpacing = value;
}
