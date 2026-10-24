import { BaseRenderer } from './baseRenderer.js';
import { identityViewport } from '../viewport.js';

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
/**
 * Contract blend mode -> Canvas 2D composite operation.
 *
 * Canvas has these natively, so the backend claims `blendModes` even though it
 * cannot claim `tint`: a composite operation costs nothing here, while tinting
 * a sprite would mean an offscreen pass per draw.
 */
const COMPOSITE_OPERATIONS = {
  normal: 'source-over',
  additive: 'lighter',
  multiply: 'multiply',
  screen: 'screen'
};

export class CanvasRenderer extends BaseRenderer {
  constructor() {
    super();
    this.capabilities.blendModes = true;
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
    /**
     * How the world surface is filtered when the render resolution is below
     * the display's. 'nearest' keeps pixel art crisp.
     * @type {'linear'|'nearest'}
     */
    this.worldFilter = 'linear';

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

    if (options.worldFilter) this.worldFilter = options.worldFilter;

    this.setViewport(options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    ));
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
   * Adopt a new viewport: size the backing store to the display and the world
   * buffer to the (independent) render resolution.
   * @param {import('../viewport.js').Viewport} viewport - The sizes to adopt
   */
  setViewport(viewport) {
    this.viewport = viewport;
    if (!this.canvas) return;

    this.canvas.width = viewport.backingWidth;
    this.canvas.height = viewport.backingHeight;
    this.worldBuffer.width = viewport.worldWidth;
    this.worldBuffer.height = viewport.worldHeight;
    if (this.scratchBuffer) this.#sizeScratch();
  }

  /**
   * Clear the presented surface.
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) {
    if (!this.context) return;
    const { backingWidth, backingHeight } = this.viewport;
    // Clears address the backing store directly, not the UI transform that
    // beginScreenFrame installs, so reset before clearing.
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    if (color) {
      this.context.fillStyle = color;
      this.context.fillRect(0, 0, backingWidth, backingHeight);
    } else {
      this.context.clearRect(0, 0, backingWidth, backingHeight);
    }
    this.context.restore();
  }

  beginFrame() {
    if (!this.worldContext) return;

    this.clear('#000');
    const { worldWidth, worldHeight, worldScale } = this.viewport;
    this.worldContext.setTransform(1, 0, 0, 1, 0, 0);
    this.worldContext.fillStyle = '#000';
    this.worldContext.fillRect(0, 0, worldWidth, worldHeight);
    this.worldContext.save();
    // World drawing is in world units; the surface is in pixels.
    this.worldContext.scale(worldScale, worldScale);
    super.beginFrame();
  }

  endFrame() {
    if (!this.worldContext) return;
    this.worldContext.restore();
    // Present the world surface into its content rect, upscaling when the
    // render resolution is below the display's.
    const { contentX, contentY, contentWidth, contentHeight } = this.viewport;
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.imageSmoothingEnabled = this.worldFilter !== 'nearest';
    this.context.drawImage(this.worldBuffer, contentX, contentY, contentWidth, contentHeight);
    this.context.restore();
  }

  beginScreenFrame() {
    if (!this.context) return;
    this.context.save();
    // UI is drawn in UI units straight onto the backing store, so it
    // rasterizes at full display resolution however coarse the world is.
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.scale(this.viewport.uiScale, this.viewport.uiScale);
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
    if (options.blend) {
      ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[options.blend] || 'source-over';
    }
    if (options.shadow) {
      ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = options.shadow.blur || 0;
      ctx.shadowOffsetX = options.shadow.offsetX || 0;
      ctx.shadowOffsetY = options.shadow.offsetY || 0;
    }
  }

  /**
   * The scratch buffer mirrors whichever context is being painted, so it has
   * to cover the larger of the two surfaces: the world render target or the
   * backing store the UI draws on.
   */
  #sizeScratch() {
    const { worldWidth, worldHeight, backingWidth, backingHeight } = this.viewport;
    this.scratchBuffer.width = Math.max(worldWidth, backingWidth);
    this.scratchBuffer.height = Math.max(worldHeight, backingHeight);
  }

  #scratch() {
    if (!this.scratchContext) {
      this.scratchBuffer = document.createElement('canvas');
      this.#sizeScratch();
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
      scratch.clearRect(0, 0, this.scratchBuffer.width, this.scratchBuffer.height);
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
