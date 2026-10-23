import { BaseRenderer } from './baseRenderer.js';

/**
 * Canvas 2D implementation of the renderer interface.
 *
 * World-space content is drawn to an offscreen buffer (double buffering) and
 * composited onto the main canvas in endFrame(). Screen-space content is
 * drawn directly to the main canvas.
 *
 * Canvas 2D's native shadow is per fill/stroke operation, which is not the
 * contract (the shadow is the primitive's whole silhouette, drawn once). A
 * primitive with a shadow and both fill and stroke is therefore rendered to a
 * scratch canvas first and composited with the shadow in one operation.
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
    /** @type {HTMLCanvasElement|null} Lazily created; see #paint. */
    this.scratchBuffer = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.scratchContext = null;
    /** @type {number} */
    this.width = 800;
    /** @type {number} */
    this.height = 600;

    /**
     * Shared transform/clip stack. Entries are { kind: 'transform'|'clip', ctx }
     * so mismatched pops can be detected (the contract requires strict nesting).
     * @type {Array<{kind: string, ctx: CanvasRenderingContext2D}>}
     */
    this.stateStack = [];
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
    this.scratchBuffer = null;
    this.scratchContext = null;
    this.stateStack = [];
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
    if (this.scratchBuffer) {
      this.scratchBuffer.width = this.width;
      this.scratchBuffer.height = this.height;
    }
  }

  /**
   * Clear the presented surface.
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) {
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
    this.worldContext.fillStyle = '#000';
    this.worldContext.fillRect(0, 0, this.width, this.height);
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
   * Accepts colour strings or declarative gradient descriptors (see
   * BaseRenderer docs). Gradients are created on the context they are used
   * with.
   */
  #resolveStyle(ctx, style) {
    if (!style || typeof style !== 'object' || !style.type) return style;

    let gradient;
    if (style.type === 'linear') {
      gradient = ctx.createLinearGradient(style.x0, style.y0, style.x1, style.y1);
    } else if (style.type === 'radial') {
      gradient = ctx.createRadialGradient(
        style.x, style.y, style.r0 ?? 0,
        style.x, style.y, style.r1
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

  #scratch() {
    if (!this.scratchContext) {
      this.scratchBuffer = document.createElement('canvas');
      this.scratchBuffer.width = this.width;
      this.scratchBuffer.height = this.height;
      this.scratchContext = this.scratchBuffer.getContext('2d');
    }
    return this.scratchContext;
  }

  /**
   * Paint a primitive with the common options applied.
   *
   * `drawShape(ctx)` must perform the primitive's fill and/or stroke on the
   * context it is given, resolving styles against that context. When the
   * primitive has a shadow and more than one pass, it is drawn to a scratch
   * canvas (under the target's current transform) and composited once with
   * the shadow and alpha, so the shadow is cast by the whole silhouette and
   * alpha is applied once.
   *
   * @param {CanvasRenderingContext2D} ctx - Target context
   * @param {Object} options - Draw options
   * @param {number} passes - Number of fill/stroke passes the shape needs
   * @param {(ctx: CanvasRenderingContext2D) => void} drawShape
   */
  #paint(ctx, options, passes, drawShape) {
    if (options.shadow && passes > 1) {
      const scratch = this.#scratch();
      scratch.save();
      scratch.setTransform(1, 0, 0, 1, 0, 0);
      scratch.clearRect(0, 0, this.width, this.height);
      scratch.setTransform(ctx.getTransform());
      drawShape(scratch);
      scratch.restore();

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.#applyCommon(ctx, options);
      ctx.drawImage(this.scratchBuffer, 0, 0);
      ctx.restore();
      return;
    }

    ctx.save();
    this.#applyCommon(ctx, options);
    drawShape(ctx);
    ctx.restore();
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

    this.trackPrimitive('sprite');
    this.stats.drawCalls++;
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

    this.#paint(ctx, options, 1, (c) => {
      c.translate(x, y);
      if (rotation) c.rotate(rotation);
      if (flipX || flipY) c.scale(flipX ? -1 : 1, flipY ? -1 : 1);

      c.drawImage(
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
    });
  }

  /**
   * Draw an image to a destination rectangle (top-left anchored).
   * @param {Object} options - Drawing options
   */
  drawImage(options) {
    const ctx = this.#targetContext(options);
    if (!ctx || !options.image) return;

    this.trackPrimitive('sprite');
    this.stats.drawCalls++;
    this.trackStateChange({});

    const width = options.width ?? options.image.width;
    const height = options.height ?? options.image.height;

    this.#paint(ctx, options, 1, (c) => {
      if (options.sourceWidth !== undefined && options.sourceHeight !== undefined) {
        c.drawImage(
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
        c.drawImage(options.image, options.x, options.y, width, height);
      }
    });
  }

  /**
   * Draw a rectangle, optionally rounded.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    this.trackPrimitive('shape');
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    const { x, y, width, height, cornerRadius } = options;
    const rounded = cornerRadius !== undefined && cornerRadius !== 0;
    const doFill = options.fill !== false && !!options.fillStyle;
    const doStroke = !!options.strokeStyle;

    this.#paint(ctx, options, (doFill ? 1 : 0) + (doStroke ? 1 : 0), (c) => {
      if (rounded) {
        c.beginPath();
        c.roundRect(x, y, width, height, cornerRadius);
      }

      if (doFill) {
        c.fillStyle = this.#resolveStyle(c, options.fillStyle);
        if (rounded) c.fill(); else c.fillRect(x, y, width, height);
      }

      if (doStroke) {
        c.strokeStyle = this.#resolveStyle(c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 1;
        if (rounded) c.stroke(); else c.strokeRect(x, y, width, height);
      }
    });
  }

  /**
   * Draw text with optional outline, shadow/glow, and gradient fill.
   * @param {Object} options - Drawing options
   */
  drawText(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    const font = this.#buildFont(options);

    this.trackPrimitive('text');
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      font
    });

    const doStroke = !!options.strokeStyle;

    this.#paint(ctx, options, doStroke ? 2 : 1, (c) => {
      c.font = font;
      c.textAlign = options.textAlign || 'left';
      c.textBaseline = options.textBaseline || 'top';

      if (doStroke) {
        c.strokeStyle = this.#resolveStyle(c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 3;
        c.lineJoin = 'round';
        c.strokeText(options.text, options.x, options.y);
      }

      c.fillStyle = this.#resolveStyle(c, options.fillStyle || '#000');
      c.fillText(options.text, options.x, options.y);
    });
  }

  /**
   * Draw a line.
   * @param {Object} options - Drawing options
   */
  drawLine(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    this.trackPrimitive('shape');
    this.stats.drawCalls++;
    this.trackStateChange({
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    this.#paint(ctx, options, 1, (c) => {
      c.strokeStyle = this.#resolveStyle(c, options.strokeStyle || '#000');
      c.lineWidth = options.lineWidth || 1;

      c.beginPath();
      c.moveTo(options.x1, options.y1);
      c.lineTo(options.x2, options.y2);
      c.stroke();
    });
  }

  /**
   * Draw an arc or circle.
   * @param {Object} options - Drawing options
   */
  drawArc(options) {
    const ctx = this.#targetContext(options);
    if (!ctx) return;

    this.trackPrimitive('shape');
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    const doFill = options.fill !== false && !!options.fillStyle;
    const doStroke = !!options.strokeStyle;

    this.#paint(ctx, options, (doFill ? 1 : 0) + (doStroke ? 1 : 0), (c) => {
      c.beginPath();
      c.arc(
        options.x,
        options.y,
        options.radius,
        options.startAngle ?? 0,
        options.endAngle ?? Math.PI * 2,
        false
      );

      if (doFill) {
        c.fillStyle = this.#resolveStyle(c, options.fillStyle);
        c.fill();
      }

      if (doStroke) {
        c.strokeStyle = this.#resolveStyle(c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 1;
        c.stroke();
      }
    });
  }

  /**
   * Draw a polyline or polygon.
   * @param {Object} options - Drawing options
   */
  drawPath(options) {
    const ctx = this.#targetContext(options);
    if (!ctx || !options.points || options.points.length < 2) return;

    this.trackPrimitive('shape');
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    const doFill = !!options.fillStyle;
    const doStroke = !!options.strokeStyle;

    this.#paint(ctx, options, (doFill ? 1 : 0) + (doStroke ? 1 : 0), (c) => {
      c.beginPath();
      c.moveTo(options.points[0].x, options.points[0].y);
      for (let i = 1; i < options.points.length; i++) {
        c.lineTo(options.points[i].x, options.points[i].y);
      }
      if (options.closed) {
        c.closePath();
      }

      if (doFill) {
        c.fillStyle = this.#resolveStyle(c, options.fillStyle);
        c.fill();
      }

      if (doStroke) {
        c.strokeStyle = this.#resolveStyle(c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 1;
        c.stroke();
      }
    });
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
    this.stateStack.push({ kind: 'transform', ctx });
  }

  popTransform() {
    this.#popState('transform');
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
    this.stateStack.push({ kind: 'clip', ctx });
  }

  popClip() {
    this.#popState('clip');
  }

  #popState(kind) {
    const entry = this.stateStack.pop();
    if (!entry) return;
    if (entry.kind !== kind) {
      console.warn(`CanvasRenderer: pop${kind === 'clip' ? 'Clip' : 'Transform'}() called but the top of the state stack is a ${entry.kind}; transform/clip pushes must nest`);
    }
    entry.ctx.restore();
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
}
