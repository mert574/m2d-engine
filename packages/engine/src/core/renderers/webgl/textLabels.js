import { createTexture } from './device.js';

/**
 * Text for the GPU backend: each unique (text, style) is rasterized once by
 * the browser's own text engine into a small 2D canvas, uploaded as a
 * texture, and drawn as a quad. Using the 2D text engine means glyph shapes,
 * alignment and baselines match the Canvas backend exactly.
 *
 * Labels not drawn for a while are evicted (dynamic text such as an FPS
 * counter changes every frame).
 */
export class TextLabels {
  /**
   * @param {WebGL2RenderingContext} gl
   */
  constructor(gl) {
    this.gl = gl;
    this.scratch = document.createElement('canvas');
    this.scratch.width = 1;
    this.scratch.height = 1;
    this.measureContext = this.scratch.getContext('2d');
    /** @type {Map<string, {texture: WebGLTexture, width: number, height: number, anchorX: number, anchorY: number, lastUsed: number}>} */
    this.cache = new Map();
  }

  destroy() {
    for (const entry of this.cache.values()) this.gl.deleteTexture(entry.texture);
    this.cache.clear();
  }

  /** Same font string the Canvas backend builds, so metrics agree. */
  static font(options) {
    const size = typeof options.fontSize === 'number'
      ? `${options.fontSize}px`
      : (options.fontSize || '16px');
    return `${options.fontWeight || 'normal'} ${size} ${options.fontFamily || 'system-ui'}`.trim();
  }

  static fontSizePx(options) {
    return parseInt(options.fontSize ?? options.font) || 16;
  }

  measure(text, style = {}) {
    const ctx = this.measureContext;
    ctx.font = style.font || TextLabels.font(style);
    return { width: ctx.measureText(text).width, height: TextLabels.fontSizePx(style) };
  }

  /**
   * Get (rasterizing on first use) the label for a drawText call.
   * The returned anchor is the point inside the label that maps onto the
   * call's (x, y), so position = (x - anchorX, y - anchorY).
   */
  /**
   * @param {Object} options - drawText options
   * @param {number} frame - Current frame index, for eviction
   * @param {number} [scale=1] - Texels per coordinate unit. Labels are
   *   rasterized at this density and drawn at their coordinate-space size, so
   *   UI text stays sharp on HiDPI displays and at high render resolutions.
   */
  get(options, frame, scale = 1) {
    // Round so a continuously changing scale cannot thrash the cache.
    const quantized = Math.max(0.25, Math.min(4, Math.round(scale * 4) / 4));
    const key = `${labelKey(options)}\u0001${quantized}`;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.#rasterize(options, quantized);
      if (!entry) return null;
      this.cache.set(key, entry);
    }
    entry.lastUsed = frame;
    return entry;
  }

  evict(frame, maxAge = 60) {
    if (this.cache.size < 32) return;
    for (const [key, entry] of this.cache) {
      if (frame - entry.lastUsed > maxAge) {
        this.gl.deleteTexture(entry.texture);
        this.cache.delete(key);
      }
    }
  }

  #rasterize(options, scale = 1) {
    const text = String(options.text ?? '');
    const font = TextLabels.font(options);
    const size = TextLabels.fontSizePx(options);
    const stroke = !!options.strokeStyle;
    const lineWidth = stroke ? (options.lineWidth || 3) : 0;
    const pad = Math.ceil(lineWidth) + 2;

    const ctx = this.measureContext;
    ctx.font = font;
    const textWidth = ctx.measureText(text).width;
    if (textWidth <= 0 && !text.trim()) return null;

    const width = Math.max(1, Math.ceil(textWidth + 2 * pad));
    const height = Math.max(1, Math.ceil(size * 2 + 2 * pad));

    const align = options.textAlign || 'left';
    const baseline = options.textBaseline || 'top';
    const anchorX = align === 'center' ? pad + textWidth / 2
      : (align === 'right' || align === 'end') ? pad + textWidth
      : pad;
    const anchorY = (baseline === 'top' || baseline === 'hanging') ? pad
      : baseline === 'middle' ? pad + size
      : pad + size * 1.5; // alphabetic / bottom / ideographic: room for descenders

    // The texture carries `scale` texels per coordinate unit; the quad the
    // renderer draws stays `width` x `height` units, so only sharpness changes.
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const c = canvas.getContext('2d');
    c.scale(scale, scale);
    c.font = font;
    c.textAlign = align;
    c.textBaseline = baseline;

    // Gradient descriptors are in draw-call space; shift them into label space.
    const dx = anchorX - (options.x || 0);
    const dy = anchorY - (options.y || 0);

    if (stroke) {
      c.strokeStyle = resolveStyle(c, options.strokeStyle, dx, dy);
      c.lineWidth = lineWidth;
      c.lineJoin = 'round';
      c.strokeText(text, anchorX, anchorY);
    }
    c.fillStyle = resolveStyle(c, options.fillStyle || '#000', dx, dy);
    c.fillText(text, anchorX, anchorY);

    const texture = createTexture(this.gl, { source: canvas, smooth: true });
    return { texture, width, height, anchorX, anchorY, lastUsed: 0 };
  }
}

function resolveStyle(ctx, style, dx, dy) {
  if (!style || typeof style !== 'object' || !style.type) return style;
  let gradient;
  if (style.type === 'linear') {
    gradient = ctx.createLinearGradient(style.x0 + dx, style.y0 + dy, style.x1 + dx, style.y1 + dy);
  } else if (style.type === 'radial') {
    gradient = ctx.createRadialGradient(style.x + dx, style.y + dy, style.r0 ?? 0, style.x + dx, style.y + dy, style.r1);
  } else {
    return '#000';
  }
  for (const stop of style.stops || []) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

function styleKey(style) {
  return typeof style === 'object' && style ? JSON.stringify(style) : String(style ?? '');
}

function labelKey(options) {
  return [
    options.text, TextLabels.font(options),
    styleKey(options.fillStyle), styleKey(options.strokeStyle), options.lineWidth ?? '',
    options.textAlign || 'left', options.textBaseline || 'top',
    // Gradient coordinates are relative to the call position.
    (typeof options.fillStyle === 'object' || typeof options.strokeStyle === 'object') ? `${options.x},${options.y}` : ''
  ].join('\u0001');
}
