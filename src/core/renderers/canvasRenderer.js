import { BaseRenderer } from './baseRenderer.js';

/**
 * Canvas-based implementation of the renderer interface.
 * Uses HTML5 Canvas API for rendering with double buffering for world content.
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

    // FPS tracking
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 1000; // Update FPS every second
    this.fpsHistory = new Array(60).fill(0); // Store last 60 FPS values
    this.fpsHistoryIndex = 0;
    this.fpsSum = 0; // Track running sum for average
    this.fpsCount = 0; // Track number of samples

    // Render stats
    this.stats = {
      drawCalls: 0,
      stateChanges: 0,
      spritesDrawn: 0,
      textDrawn: 0,
      shapesDrawn: 0,
      lastState: {
        fillStyle: null,
        strokeStyle: null,
        lineWidth: null,
        font: null
      }
    };
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
    
    // Set initial dimensions
    this.width = options.width || this.width;
    this.height = options.height || this.height;
    
    this.resize();
  }

  /**
   * Clean up renderer resources.
   */
  destroy() {
    this.canvas = null;
    this.context = null;
    this.worldBuffer = null;
    this.worldContext = null;
  }

  /**
   * Resize canvas and buffer to match container size or use fixed dimensions.
   * @param {number} [width] - New width (optional)
   * @param {number} [height] - New height (optional)
   */
  resize(width, height) {
    if (!this.canvas) return;
    
    // Update dimensions if provided
    if (width !== undefined && height !== undefined) {
      this.width = width;
      this.height = height;
    }
    
    // Apply dimensions
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
   * Draw world content with double buffering.
   * @param {function(CanvasRenderingContext2D): void} callback - Drawing callback
   */
  drawWorld(callback) {
    if (!this.worldContext) return;

    this.worldContext.clearRect(0, 0, this.width, this.height);
    
    this.worldContext.save();
    callback(this.worldContext);
    this.worldContext.restore();

    // Copy world buffer to main canvas
    this.context.drawImage(this.worldBuffer, 0, 0);
  }

  /**
   * Draw screen-space content directly to main canvas.
   * @param {function(CanvasRenderingContext2D): void} callback - Drawing callback
   */
  drawScreen(callback) {
    if (!this.context) return;

    this.context.save();
    callback(this.context);
    this.context.restore();
  }

  /**
   * Draw a sprite.
   * @param {Object} options - Drawing options
   */
  drawSprite(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx || !options.image) return;

    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.trackStateChange(ctx, {});

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
   * Draw an animation.
   * @param {Object} options - Drawing options
   */
  drawAnimation(options) {
    const { sprite, x, y, animation, frame = 0, transform = {} } = options;
    const anim = sprite.animations.get(animation);
    if (!anim) return;

    this.drawSprite({
      image: sprite.image,
      x,
      y,
      tileX: anim.tileX + frame,
      tileY: anim.tileY,
      tileWidth: sprite.tileW,
      tileHeight: sprite.tileH,
      ...transform
    });
  }

  /**
   * Apply camera transformation to rendering context.
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
   * @deprecated Use renderer-specific methods instead
   * @returns {CanvasRenderingContext2D} Main rendering context
   */
  getContext() {
    return this.context;
  }

  /**
   * @deprecated Use renderer-specific methods instead
   * @returns {CanvasRenderingContext2D} World buffer context
   */
  getWorldContext() {
    return this.worldContext;
  }

  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange(ctx, {
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    
    if (options.strokeStyle) {
      ctx.strokeStyle = options.strokeStyle;
      ctx.lineWidth = options.lineWidth || 1;
    }
    
    if (options.fillStyle) {
      ctx.fillStyle = options.fillStyle;
    }

    if (options.fill !== false && options.fillStyle) {
      ctx.fillRect(options.x, options.y, options.width, options.height);
    }
    
    if (options.strokeStyle) {
      ctx.strokeRect(options.x, options.y, options.width, options.height);
    }

    ctx.restore();
  }

  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} [options.fillStyle='#000'] - Text color
   * @param {string} [options.fontSize='16px'] - Font size with units
   * @param {string} [options.fontFamily='system-ui'] - Font family
   * @param {string} [options.fontWeight='normal'] - Font weight
   * @param {string} [options.textAlign='left'] - Text alignment (left, center, right)
   * @param {string} [options.textBaseline='top'] - Text baseline (top, middle, bottom)
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawText(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.textDrawn++;
    this.trackStateChange(ctx, {
      fillStyle: options.fillStyle,
      font: `${options.fontWeight || 'normal'} ${options.fontSize || '16px'} ${options.fontFamily || 'system-ui'}`.trim()
    });

    ctx.save();
    
    ctx.fillStyle = options.fillStyle || '#000';
    ctx.font = `${options.fontWeight || 'normal'} ${options.fontSize || '16px'} ${options.fontFamily || 'system-ui'}`.trim();
    ctx.textAlign = options.textAlign || 'left';
    ctx.textBaseline = options.textBaseline || 'top';
    
    ctx.fillText(options.text, options.x, options.y);
    
    ctx.restore();
  }

  /**
   * Draw a line.
   * @param {Object} options - Drawing options
   */
  drawLine(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange(ctx, {
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    
    ctx.strokeStyle = options.strokeStyle || '#000';
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
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;

    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange(ctx, {
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });

    ctx.save();
    
    if (options.strokeStyle) {
      ctx.strokeStyle = options.strokeStyle;
      ctx.lineWidth = options.lineWidth || 1;
    }
    
    if (options.fillStyle) {
      ctx.fillStyle = options.fillStyle;
    }

    ctx.beginPath();
    ctx.arc(
      options.x,
      options.y,
      options.radius,
      options.startAngle,
      options.endAngle,
      false
    );

    if (options.fill !== false && options.fillStyle) {
      ctx.fill();
    }
    
    if (options.strokeStyle) {
      ctx.stroke();
    }

    ctx.restore();
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
   * Begin a new frame.
   */
  beginFrame() {
    if (!this.worldContext) return;
    
    this.clear('#000');
    
    this.worldContext.save();
    this.frameCount++;
    this.resetStats();

    // Update FPS
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      
      if (this.fpsCount === this.fpsHistory.length) {
        this.fpsSum -= this.fpsHistory[this.fpsHistoryIndex];
      } else {
        this.fpsCount++;
      }
      this.fpsSum += this.fps;
      
      this.fpsHistory[this.fpsHistoryIndex] = this.fps;
      this.fpsHistoryIndex = (this.fpsHistoryIndex + 1) % this.fpsHistory.length;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  /**
   * End the current frame.
   */
  endFrame() {
    if (!this.worldContext) return;
    this.worldContext.restore();
    // Copy world buffer to main canvas
    this.context.drawImage(this.worldBuffer, 0, 0);
  }

  #isDebugEnabled = true;
  #debugLayer = 'default';

  setDebugEnabled(enabled) {
    this.#isDebugEnabled = enabled;
  }

  isDebugEnabled() {
    return this.#isDebugEnabled;
  }

  setDebugLayer(layer) {
    this.#debugLayer = layer;
  }

  getDebugLayer() {
    return this.#debugLayer;
  }

  getFPS() {
    return this.fps;
  }

  getFPSHistory() {
    return [...this.fpsHistory];
  }

  getAverageFPS() {
    if (this.fpsCount === 0) return this.fps;
    return Math.round(this.fpsSum / this.fpsCount);
  }

  resetStats() {
    this.stats.drawCalls = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
  }

  trackStateChange(ctx, newState) {
    const lastState = this.stats.lastState;
    let changes = 0;

    for (const [key, value] of Object.entries(newState)) {
      if (value !== undefined && value !== lastState[key]) {
        lastState[key] = value;
        changes++;
      }
    }

    if (changes > 0) {
      this.stats.stateChanges += changes;
    }
  }

  getStats() {
    return { ...this.stats };
  }
} 