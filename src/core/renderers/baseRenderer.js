/**
 * Base renderer interface that all renderer backends must implement.
 *
 * A renderer backend owns the target canvas and draws both world-space and
 * screen-space (UI) content. World-space drawing happens between beginFrame()
 * and endFrame() with the camera transform applied; screen-space drawing
 * happens between beginScreenFrame() and endScreenFrame(), or by passing
 * `isScreenSpace: true` to any draw call.
 *
 * ## Style descriptors
 *
 * Wherever a `fillStyle` or `strokeStyle` is accepted, backends must support
 * either a CSS color string or a declarative gradient descriptor:
 *
 *   { type: 'linear', x0, y0, x1, y1, stops: [{ offset, color }, ...] }
 *   { type: 'radial', x0, y0, r0, x1, y1, r1, stops: [{ offset, color }, ...] }
 *
 * Coordinates are in the same space as the draw call they are used with.
 *
 * ## Common draw options
 *
 * All draw methods accept these optional fields:
 * - {boolean} isScreenSpace - Draw in screen space (ignores camera), default false
 * - {number} globalAlpha - Opacity multiplier in [0, 1]
 * - {Object} shadow - Drop shadow / glow: { color, blur, offsetX, offsetY }.
 *   When a shape has both fill and stroke, the shadow applies to the fill
 *   pass only. For text it applies to both stroke and fill passes.
 *
 * This is an abstract class and cannot be instantiated directly.
 */
export class BaseRenderer {
  #debugEnabled = true;
  #debugLayer = 'default';

  constructor() {
    if (this.constructor === BaseRenderer) {
      throw new Error('BaseRenderer is an abstract class and cannot be instantiated directly');
    }

    // FPS tracking (backend-agnostic)
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 1000; // Update FPS every second
    this.fpsHistory = new Array(60).fill(0); // Store last 60 FPS values
    this.fpsHistoryIndex = 0;
    this.fpsSum = 0; // Track running sum for average
    this.fpsCount = 0; // Track number of samples

    // Render stats (backend-agnostic)
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

  // === Lifecycle ===

  /**
   * Initialize the renderer with a target canvas and options.
   * @param {HTMLCanvasElement} element - The target canvas to render to
   * @param {Object} options - Renderer options
   * @param {number} [options.width] - Initial width
   * @param {number} [options.height] - Initial height
   */
  init(element, options) { throw new Error('Method not implemented'); }

  /**
   * Clean up renderer resources.
   */
  destroy() { throw new Error('Method not implemented'); }

  /**
   * Resize the renderer.
   * @param {number} [width] - New width
   * @param {number} [height] - New height
   */
  resize(width, height) { throw new Error('Method not implemented'); }

  /**
   * Clear all render targets to a color.
   * @param {string} [color] - Background color
   */
  clear(color) { throw new Error('Method not implemented'); }

  /**
   * Clear only the visible screen (not intermediate world buffers).
   * Used by the UI layer to paint a full-screen background.
   * @param {string} [color] - Background color; transparent clear if omitted
   */
  clearScreen(color) { throw new Error('Method not implemented'); }

  // === Frame control ===

  /**
   * Begin a new world frame. Subclasses must call super.beginFrame() to keep
   * FPS and draw-call statistics up to date.
   */
  beginFrame() {
    this.frameCount++;
    this.resetStats();

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
   * End the current world frame and present it.
   */
  endFrame() { throw new Error('Method not implemented'); }

  /**
   * Begin a screen-space (UI) pass. Draw calls made through a UIRenderer
   * happen between beginScreenFrame() and endScreenFrame().
   */
  beginScreenFrame() { throw new Error('Method not implemented'); }

  /**
   * End the current screen-space (UI) pass.
   */
  endScreenFrame() { throw new Error('Method not implemented'); }

  /**
   * Apply camera transformation to subsequent world-space draw calls.
   * @param {Object} camera - Camera object with x, y, width, height
   */
  applyCamera(camera) { throw new Error('Method not implemented'); }

  // === Draw primitives ===

  /**
   * Draw a sprite tile from a spritesheet image, centered on (x, y).
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Spritesheet image
   * @param {number} options.x - Center X position
   * @param {number} options.y - Center Y position
   * @param {number} [options.tileX=0] - Tile X index in spritesheet
   * @param {number} [options.tileY=0] - Tile Y index in spritesheet
   * @param {number} options.tileWidth - Tile width in pixels
   * @param {number} options.tileHeight - Tile height in pixels
   * @param {number} [options.width] - Destination width (defaults to tileWidth)
   * @param {number} [options.height] - Destination height (defaults to tileHeight)
   * @param {number} [options.rotation=0] - Rotation in radians
   * @param {boolean} [options.flipX=false] - Flip horizontally
   * @param {boolean} [options.flipY=false] - Flip vertically
   */
  drawSprite(options) { throw new Error('Method not implemented'); }

  /**
   * Draw a named animation frame from a SpriteSheet.
   * @param {Object} options - Drawing options
   * @param {Object} options.sprite - SpriteSheet to draw from
   * @param {number} options.x - Center X position
   * @param {number} options.y - Center Y position
   * @param {string} options.animation - Animation name
   * @param {number} [options.frame=0] - Animation frame index
   * @param {Object} [options.transform] - Extra drawSprite options
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
   * Draw an image stretched to a destination rectangle (top-left anchored).
   * @param {Object} options - Drawing options
   * @param {CanvasImageSource} options.image - Image to draw
   * @param {number} options.x - Destination X (top-left)
   * @param {number} options.y - Destination Y (top-left)
   * @param {number} [options.width] - Destination width (defaults to image width)
   * @param {number} [options.height] - Destination height (defaults to image height)
   * @param {number} [options.sourceX] - Source rect X (full image if omitted)
   * @param {number} [options.sourceY] - Source rect Y
   * @param {number} [options.sourceWidth] - Source rect width
   * @param {number} [options.sourceHeight] - Source rect height
   */
  drawImage(options) { throw new Error('Method not implemented'); }

  /**
   * Draw a rectangle (top-left anchored), optionally rounded.
   * @param {Object} options - Drawing options
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.width - Rectangle width
   * @param {number} options.height - Rectangle height
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {number|number[]} [options.cornerRadius=0] - Rounded corner radius
   * @param {boolean} [options.fill=true] - Whether to fill when fillStyle is set
   */
  drawRect(options) { throw new Error('Method not implemented'); }

  /**
   * Draw a line segment.
   * @param {Object} options - Drawing options
   * @param {number} options.x1 - Start X
   * @param {number} options.y1 - Start Y
   * @param {number} options.x2 - End X
   * @param {number} options.y2 - End Y
   * @param {string|Object} [options.strokeStyle='#000'] - Stroke color
   * @param {number} [options.lineWidth=1] - Line width
   */
  drawLine(options) { throw new Error('Method not implemented'); }

  /**
   * Draw an arc or circle.
   *
   * Filling a partial arc fills the **circular segment** — the region between
   * the arc and the straight chord joining its endpoints — not a pie sector.
   * The centre of the circle is therefore NOT filled unless the sweep is at
   * least half a turn. This matches Canvas 2D `arc()` + `fill()` semantics and
   * is what the engine has always rendered; backends must reproduce it so
   * output stays identical. For a pie/sector look, draw a closed drawPath()
   * through the centre instead.
   *
   * @param {Object} options - Drawing options
   * @param {number} options.x - Center X
   * @param {number} options.y - Center Y
   * @param {number} options.radius - Radius
   * @param {number} [options.startAngle=0] - Start angle in radians
   * @param {number} [options.endAngle=Math.PI*2] - End angle in radians
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {boolean} [options.fill=true] - Whether to fill when fillStyle is set
   */
  drawArc(options) { throw new Error('Method not implemented'); }

  /**
   * Draw a polyline or polygon.
   * @param {Object} options - Drawing options
   * @param {Array<{x: number, y: number}>} options.points - Path points
   * @param {boolean} [options.closed=false] - Close the path
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   */
  drawPath(options) { throw new Error('Method not implemented'); }

  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string|Object} [options.fillStyle='#000'] - Text color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Outline color; drawn before the fill
   * @param {number} [options.lineWidth=3] - Outline width
   * @param {string|number} [options.fontSize='16px'] - Font size ('16px' or 16)
   * @param {string} [options.fontFamily='system-ui'] - Font family
   * @param {string} [options.fontWeight='normal'] - Font weight
   * @param {string} [options.textAlign='left'] - Text alignment
   * @param {string} [options.textBaseline='top'] - Text baseline
   */
  drawText(options) { throw new Error('Method not implemented'); }

  // === Transform & clip stacks ===

  /**
   * Push a local transform applied to subsequent draw calls.
   * @param {Object} transform - Transform options
   * @param {number} [transform.x=0] - Translation X
   * @param {number} [transform.y=0] - Translation Y
   * @param {number} [transform.rotation=0] - Rotation in radians
   * @param {number} [transform.scaleX=1] - Scale X
   * @param {number} [transform.scaleY=1] - Scale Y
   * @param {boolean} [transform.isScreenSpace=false] - Apply in screen space
   */
  pushTransform(transform) { throw new Error('Method not implemented'); }

  /**
   * Pop the most recent transform pushed with pushTransform().
   */
  popTransform() { throw new Error('Method not implemented'); }

  /**
   * Push a clipping rectangle applied to subsequent draw calls.
   * @param {Object} rect - Clipping rectangle
   * @param {number} rect.x - X position
   * @param {number} rect.y - Y position
   * @param {number} rect.width - Rectangle width
   * @param {number} rect.height - Rectangle height
   * @param {number|number[]} [rect.cornerRadius=0] - Rounded corner radius
   * @param {boolean} [rect.isScreenSpace=false] - Clip in screen space
   */
  pushClip(rect) { throw new Error('Method not implemented'); }

  /**
   * Pop the most recent clipping rectangle.
   */
  popClip() { throw new Error('Method not implemented'); }

  // === Queries ===

  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} [style] - Text style ({ fontSize, fontFamily, fontWeight })
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style) { throw new Error('Method not implemented'); }

  /**
   * Test if a point hits a shape. Pure math; shared by all backends.
   * @param {number} x - X position to test
   * @param {number} y - Y position to test
   * @param {Object} shape - Shape ({ type: 'rect', x, y, width, height } or
   *   { type: 'circle', x, y, radius })
   * @returns {boolean} Whether the point hits the shape
   */
  hitTest(x, y, shape) {
    switch (shape.type) {
      case 'rect':
        return x >= shape.x && x <= shape.x + shape.width &&
               y >= shape.y && y <= shape.y + shape.height;

      case 'circle': {
        const dx = x - shape.x;
        const dy = y - shape.y;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
      }

      default:
        return false;
    }
  }

  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) { throw new Error('Method not implemented'); }

  // === Debug rendering state (shared by all backends) ===

  /**
   * Enable/disable debug rendering.
   * @param {boolean} enabled - Whether debug rendering should be enabled
   */
  setDebugEnabled(enabled) {
    this.#debugEnabled = enabled;
  }

  /**
   * Check if debug rendering is enabled.
   * @returns {boolean} Whether debug rendering is enabled
   */
  isDebugEnabled() {
    return this.#debugEnabled;
  }

  /**
   * Set debug rendering layer.
   * @param {string} layer - Debug layer name
   */
  setDebugLayer(layer) {
    this.#debugLayer = layer;
  }

  /**
   * Get current debug layer.
   * @returns {string} Current debug layer name
   */
  getDebugLayer() {
    return this.#debugLayer;
  }

  // === Performance stats (shared by all backends) ===

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

  trackStateChange(newState) {
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
