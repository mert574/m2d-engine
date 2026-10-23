import { BaseRenderer } from './baseRenderer.js';

/**
 * Canvas 2D implementation of the renderer interface.
 *
 * World-space content is drawn to an offscreen buffer (double buffering) and
 * composited onto the main canvas in endFrame(). Screen-space content is
 * drawn directly to the main canvas.
 */
export class CanvasRenderer extends BaseRenderer {
  constructor() {
    super();
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.context = null;
    /** @type {HTMLCanvasElement|null} */
    this.worldBuffer = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.worldContext = null;
    /** @type {number} */
    this.width = 800;
    /** @type {number} */
    this.height = 600;

    /** @type {CanvasRenderingContext2D[]} */
    this.transformStack = [];
    /** @type {CanvasRenderingContext2D[]} */
    this.clipStack = [];
  }

  /**
   * Initialize the canvas renderer.
   * @param {HTMLCanvasElement} element - The canvas element to render to
   * @param {Object} options - Renderer options
   * @param {number} [options.width=800] - Initial canvas width
   * @param {number} [options.height=600] - Initial canvas height
   */
  init(element, options = {}) {
    this.canvas = element;
    this.context = this.canvas.getContext('2d');
    this.worldBuffer = document.createElement('canvas');
    this.worldContext = this.worldBuffer.getContext('2d');

    this.width = options.width || this.width;
    this.height = options.height || this.height;

    this.resize();
  }

  destroy() {
    this.canvas = null;
    this.context = null;
    this.worldBuffer = null;
    this.worldContext = null;
    this.transformStack = [];
    this.clipStack = [];
  }

  /**
   * Resize canvas and world buffer.
   * @param {number} [width] - New width
   * @param {number} [height] - New height
   */
  resize(width, height) {
    if (!this.canvas) return;

    if (width !== undefined && height !== undefined) {
      this.width = width;
      this.height = height;
    }

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.worldBuffer.width = this.width;
    this.worldBuffer.height = this.height;
  }

  /**
   * Clear both main canvas and world buffer.
   * @param {string} color - CSS color string for background
   */
  clear(color = '#000') {
    if (!this.context) return;

    this.context.fillStyle = color;
    this.context.fillRect(0, 0, this.width, this.height);

    this.worldContext.fillStyle = color;
    this.worldContext.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Clear only the main (screen) canvas.
   * @param {string} [color] - Background color; transparent clear if omitted
   */
  clearScreen(color) {
    if (!this.context) return;
    if (color) {
      this.context.fillStyle = color;
      this.context.fillRect(0, 0, this.width, this.height);
    } else {
      this.context.clearRect(0, 0, this.width, this.height);
    }
  }

  beginFrame() {
    if (!this.worldContext) return;

    this.clear('#000');
    this.worldContext.save();
    super.beginFrame();
  }

  endFrame() {
    if (!this.worldContext) return;
    this.worldContext.restore();
    // Copy world buffer to main canvas
    this.context.drawImage(this.worldBuffer, 0, 0);
  }

  beginScreenFrame() {
    if (!this.context) return;
    this.context.save();
  }

  endScreenFrame() {
    if (!this.context) return;
    this.context.restore();
  }

  /**
   * Apply camera transformation to world-space rendering.
   * @param {Object} camera - Camera object with position and dimensions
   */
  applyCamera(camera) {
    if (!this.worldContext) return;

    this.worldContext.translate(
      -camera.x + camera.width / 2,
      -camera.y + camera.height / 2
    );
  }

  /**
   * Pick the target context for a draw call.
   * @param {Object} options - Draw options (reads isScreenSpace)
   * @returns {CanvasRenderingContext2D|null}
   */
  #targetContext(options) {
    return options.isScreenSpace ? this.context : this.worldContext;
  }

  /**
   * Resolve a style value into something assignable to fillStyle/strokeStyle.
   * Accepts CSS color strings, canvas gradients/patterns, or declarative
   * gradient descriptors (see BaseRenderer docs).
   */
  #resolveStyle(ctx, style) {
    if (!style || typeof style !== 'object' || !style.type) return style;

    let gradient;
    if (style.type === 'linear') {
      gradient = ctx.createLinearGradient(style.x0, style.y0, style.x1, style.y1);
    } else if (style.type === 'radial') {
      gradient = ctx.createRadialGradient(
        style.x0, style.y0, style.r0 ?? 0,
        style.x1, style.y1, style.r1
      );
    } else {
      return style;
    }

    for (const stop of style.stops || []) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    return gradient;
  }

  /**
   * Apply shared draw options (globalAlpha, shadow) to a saved context.
   */
  #applyCommon(ctx, options) {
    if (options.globalAlpha !== undefined) {
      ctx.globalAlpha = options.globalAlpha;
    }
    if (options.shadow) {
      ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = options.shadow.blur || 0;
      ctx.shadowOffsetX = options.shadow.offsetX || 0;
      ctx.shadowOffsetY = options.shadow.offsetY || 0;
    }
  }

  #clearShadow(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  #buildFont(options) {
    const size = typeof options.fontSize === 'number'
      ? `${options.fontSize}px`
      : (options.fontSize || '16px');
    return `${options.fontWeight || 'normal'} ${size} ${options.fontFamily || 'system-ui'}`.trim();
  }

  /**
   * Draw a sprite tile centered on (x, y).
   * @param {Object} options - Drawing options
   */
  drawSprite(options) {
    const ctx = this.#targetContext(options);
    if (!ctx || !options.image) return;

    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.trackStateChange({});

    const {
      image,
      x,
      y,
      tileX = 0,
      tileY = 0,
      tileWidth,
      tileHeight,
      width = tileWidth,
      height = tileHeight,
      rotation = 0,
      flipX = false,
      flipY = false
    } = options;

    ctx.save();
    this.#applyCommon(ctx, options);

    // Position and rotation
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

    // Draw the sprite
    ctx.drawImage(
      image,
      tileX * tileWidth,
      tileY * tileHeight,
      tileWidth,
      tileHeight,
      -width / 2,
      -height / 2,
      width,
      height
    );

    ctx.restore();
  }

  /**
   * Draw an image to a destination rectangle (top-left anchored).
   * @param {Object} options - Drawing options
   */
  drawImage(options) {
    const ctx = this.#targetContext(options);
    if (!ctx || !options.image) return;

    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.trackStateChange({});

    ctx.save();
    this.#applyCommon(ctx, options);

    const width = options.width ?? options.image.width;
    const height = options.height ?? options.image.height;

    if (options.sourceWidth !== undefined && options.sourceHeight !== undefined) {
      ctx.drawImage(
        options.image,
        options.sourceX ?? 0,
        options.sourceY ?? 0,
        options.sourceWidth,
        options.sourceHeight,
        options.x,
        options.y,
        width,
        height
      );
    } else {
      ctx.drawImage(options.image, options.x, options.y, width, height);
    }

    ctx.restore();
  }

  /**
   * Draw a rectangle, optionally rounded.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    this.#applyCommon(ctx, options);

    const { x, y, width, height, cornerRadius } = options;
    const rounded = cornerRadius !== undefined && cornerRadius !== 0;

    if (rounded) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, cornerRadius);
    }

    if (options.fill !== false && options.fillStyle) {
      ctx.fillStyle = this.#resolveStyle(ctx, options.fillStyle);
      if (rounded) {
        ctx.fill();
      } else {
        ctx.fillRect(x, y, width, height);
      }
    }

    if (options.strokeStyle) {
      // Shadow applies to the fill pass only (avoids doubled shadows)
      if (options.fill !== false && options.fillStyle) this.#clearShadow(ctx);
      ctx.strokeStyle = this.#resolveStyle(ctx, options.strokeStyle);
      ctx.lineWidth = options.lineWidth || 1;
      if (rounded) {
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, width, height);
      }
    }

    ctx.restore();
  }

  /**
   * Draw text with optional outline, shadow/glow, and gradient fill.
   * @param {Object} options - Drawing options
   */
  drawText(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    const font = this.#buildFont(options);

    this.stats.drawCalls++;
    this.stats.textDrawn++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      font
    });

    ctx.save();
    this.#applyCommon(ctx, options);

    ctx.font = font;
    ctx.textAlign = options.textAlign || 'left';
    ctx.textBaseline = options.textBaseline || 'top';

    if (options.strokeStyle) {
      ctx.strokeStyle = this.#resolveStyle(ctx, options.strokeStyle);
      ctx.lineWidth = options.lineWidth || 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(options.text, options.x, options.y);
    }

    ctx.fillStyle = this.#resolveStyle(ctx, options.fillStyle || '#000');
    ctx.fillText(options.text, options.x, options.y);

    ctx.restore();
  }

  /**
   * Draw a line.
   * @param {Object} options - Drawing options
   */
  drawLine(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange({
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    this.#applyCommon(ctx, options);

    ctx.strokeStyle = this.#resolveStyle(ctx, options.strokeStyle || '#000');
    ctx.lineWidth = options.lineWidth || 1;

    ctx.beginPath();
    ctx.moveTo(options.x1, options.y1);
    ctx.lineTo(options.x2, options.y2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw an arc or circle.
   * @param {Object} options - Drawing options
   */
  drawArc(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    this.#applyCommon(ctx, options);

    ctx.beginPath();
    ctx.arc(
      options.x,
      options.y,
      options.radius,
      options.startAngle ?? 0,
      options.endAngle ?? Math.PI * 2,
      false
    );

    if (options.fill !== false && options.fillStyle) {
      ctx.fillStyle = this.#resolveStyle(ctx, options.fillStyle);
      ctx.fill();
    }

    if (options.strokeStyle) {
      if (options.fill !== false && options.fillStyle) this.#clearShadow(ctx);
      ctx.strokeStyle = this.#resolveStyle(ctx, options.strokeStyle);
      ctx.lineWidth = options.lineWidth || 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw a polyline or polygon.
   * @param {Object} options - Drawing options
   */
  drawPath(options) {
    const ctx = this.#targetContext(options);
    if (!ctx || !options.points || options.points.length < 2) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    this.#applyCommon(ctx, options);

    ctx.beginPath();
    ctx.moveTo(options.points[0].x, options.points[0].y);
    for (let i = 1; i < options.points.length; i++) {
      ctx.lineTo(options.points[i].x, options.points[i].y);
    }
    if (options.closed) {
      ctx.closePath();
    }

    if (options.fillStyle) {
      ctx.fillStyle = this.#resolveStyle(ctx, options.fillStyle);
      ctx.fill();
    }

    if (options.strokeStyle) {
      if (options.fillStyle) this.#clearShadow(ctx);
      ctx.strokeStyle = this.#resolveStyle(ctx, options.strokeStyle);
      ctx.lineWidth = options.lineWidth || 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Push a local transform applied to subsequent draw calls.
   * @param {Object} transform - Transform options
   */
  pushTransform(transform = {}) {
    const ctx = this.#targetContext(transform);
    if (!ctx) return;

    ctx.save();
    ctx.translate(transform.x || 0, transform.y || 0);
    if (transform.rotation) ctx.rotate(transform.rotation);
    if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
      ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    }
    this.transformStack.push(ctx);
  }

  popTransform() {
    const ctx = this.transformStack.pop();
    if (ctx) ctx.restore();
  }

  /**
   * Push a clipping rectangle (optionally rounded).
   * @param {Object} rect - Clipping rectangle
   */
  pushClip(rect) {
    const ctx = this.#targetContext(rect);
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    if (rect.cornerRadius) {
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius);
    } else {
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.clip();
    this.clipStack.push(ctx);
  }

  popClip() {
    const ctx = this.clipStack.pop();
    if (ctx) ctx.restore();
  }

  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} [style] - Text style ({ fontSize, fontFamily, fontWeight })
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style = {}) {
    if (!this.context) return { width: 0, height: 0 };

    this.context.save();
    this.context.font = style.font || this.#buildFont(style);
    const metrics = this.context.measureText(text);
    this.context.restore();

    return {
      width: metrics.width,
      height: parseInt(style.fontSize ?? style.font) || 16
    };
  }

  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }

  /**
   * @deprecated Canvas-specific escape hatch; prefer renderer draw methods
   * @returns {CanvasRenderingContext2D} Main rendering context
   */
  getContext() {
    return this.context;
  }

  /**
   * @deprecated Canvas-specific escape hatch; prefer renderer draw methods
   * @returns {CanvasRenderingContext2D} World buffer context
   */
  getWorldContext() {
    return this.worldContext;
  }
}
