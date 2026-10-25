/**
 * Base renderer interface that all renderer backends must implement.
 *
 * A renderer backend owns the target canvas and draws both world-space and
 * screen-space (UI) content. World-space drawing happens between beginFrame()
 * and endFrame() with the camera transform applied; screen-space drawing
 * happens between beginScreenFrame() and endScreenFrame(), or by passing
 * `isScreenSpace: true` to any draw call.
 *
 * ## Colours
 *
 * Colours are CSS strings. Backends must support `#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`, `rgb()`, `rgba()`, `transparent`, and the CSS named colours.
 *
 * ## Style descriptors
 *
 * Wherever a `fillStyle` or `strokeStyle` is accepted, backends must support
 * either a colour string or a declarative gradient descriptor:
 *
 *   { type: 'linear', x0, y0, x1, y1, stops: [{ offset, color }, ...] }
 *   { type: 'radial', x, y, r0 = 0, r1, stops: [{ offset, color }, ...] }
 *
 * A radial gradient is concentric: it runs from radius `r0` to `r1` around
 * the single centre (x, y). Coordinates are in the same space as the draw
 * call they are used with.
 *
 * ## Common draw options
 *
 * All draw methods accept these optional fields:
 * - {boolean} isScreenSpace - Draw in screen space (ignores camera), default false
 * - {number} globalAlpha - Opacity multiplier in [0, 1], applied once to the
 *   whole primitive (fill, stroke and shadow together).
 * - {Object} shadow - Drop shadow / glow: { color, blur, offsetX, offsetY }.
 *   The shadow is the primitive's complete silhouette — fill plus stroke, or
 *   the image's alpha — offset by (offsetX, offsetY), blurred, tinted with
 *   `color`, and drawn once beneath the primitive. `blur` is a Gaussian blur
 *   whose standard deviation is blur / 2 (the Canvas 2D definition).
 * - {string} blend - How the primitive combines with what is already there:
 *   `'normal'` (default, source-over), `'additive'`, `'multiply'` or
 *   `'screen'`. Optional; requires the `blendModes` capability.
 *
 * ## State stacks
 *
 * pushTransform/popTransform and pushClip/popClip form one nested state
 * stack: pushes and pops of either kind must nest strictly (a clip pushed
 * inside a transform must be popped before that transform). Each stack entry
 * belongs to either the world or the screen pass, chosen by `isScreenSpace`
 * on the push.
 *
 * ## Capabilities
 *
 * Everything documented above is mandatory: a backend that cannot do it is not
 * a backend. Beyond that baseline the contract also describes *optional*
 * features, which a backend advertises through `capabilities`. Callers query
 * them and degrade; the conformance suite skips what a backend does not claim.
 *
 * Optional features exist because backends are genuinely different. Additive
 * blending, per-draw tint and full-screen post effects are nearly free on a
 * GPU and expensive or impossible on Canvas 2D. Rather than hold every backend
 * to the slowest common denominator, the contract lets a backend decline, and
 * the choice of backend becomes an informed one.
 *
 * A backend that does not support an optional feature **ignores** the option
 * and draws as though it had been omitted. It must not throw: a scene written
 * against a GPU backend still runs on Canvas, just without the glow. Callers
 * that need to know ask `supports()` first — the showcase example prints the
 * list so a viewer can see what is missing rather than guess.
 *
 * This is an abstract class and cannot be instantiated directly.
 */

/**
 * Optional backend features, all defaulting to unsupported. A backend
 * overrides `capabilities` with the subset it implements.
 *
 * - `tint` - Per-draw colour modulation on sprites and images
 * - `blendModes` - `blend: 'additive' | 'multiply' | 'screen'` on draw calls
 * - `particles` - Bulk particle submission: `drawParticles` goes to the GPU
 *   as a few batched draw calls with per-particle colour. Every backend can
 *   *call* it — `BaseRenderer` falls back to one `drawSprite` per particle,
 *   honouring position, size, rotation and alpha but not colour — so the flag
 *   means "fast and coloured", and callers use it to decide how many to emit.
 * - `lights` - `drawLight` accumulates into a light map that is multiplied
 *   over the world at `endFrame`. Lighting is switched on by
 *   `setAmbientLight`: with no ambient set the map would be white and the
 *   lights would have nothing to darken, so a backend that supports this
 *   treats a null ambient as "lighting off" and skips the whole pass.
 * - `postEffects` - `setPostEffects` applies a full-screen pass (bloom,
 *   vignette) to the world between the world and screen passes, so UI drawn
 *   in the screen pass stays untouched.
 *
 * @type {Readonly<Record<string, boolean>>}
 */
/**
 * Floats per particle in a `drawParticles` buffer:
 * x, y, size, rotation, r, g, b, a — colour is straight (not premultiplied),
 * 0..1, and white means untinted. `size` is the drawn height; width follows
 * the tile's aspect ratio.
 */
import { identityViewport } from '../viewport.js';

export const PARTICLE_STRIDE = 8;

export const OPTIONAL_CAPABILITIES = Object.freeze({
  tint: false,
  blendModes: false,
  particles: false,
  lights: false,
  postEffects: false
});

export class BaseRenderer {
  #debugEnabled = true;
  #debugLayer = 'default';

  constructor() {
    if (this.constructor === BaseRenderer) {
      throw new Error('BaseRenderer is an abstract class and cannot be instantiated directly');
    }

    /**
     * Current sizing. Backends read every size they need from here rather than
     * from the canvas, so the world surface, the UI layer and the backing store
     * can differ. Replaced wholesale by setViewport().
     * @type {import('../viewport.js').Viewport}
     */
    this.viewport = identityViewport(800, 600);

    /**
     * How the world surface is filtered when it is upscaled — that is, when
     * the render resolution is below the display's. `'nearest'` keeps pixel
     * art crisp instead of smearing it. Has no effect at `'native'`, where
     * there is nothing to upscale.
     * @type {'linear'|'nearest'}
     */
    this.worldFilter = 'linear';

    /**
     * Optional features this backend supports. Subclasses override the ones
     * they implement; everything unlisted stays unsupported.
     * @type {Record<string, boolean>}
     */
    this.capabilities = { ...OPTIONAL_CAPABILITIES };

    // FPS tracking (backend-agnostic)
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 1000; // Update FPS every second
    this.fpsHistory = new Array(60).fill(0); // Store last 60 FPS values
    this.fpsHistoryIndex = 0;
    this.fpsSum = 0; // Track running sum for average
    this.fpsCount = 0; // Track number of samples

    // Render stats. `primitives` and the per-type counters are what callers
    // asked for and mean the same for every backend. `drawCalls` and
    // `stateChanges` are what the backend actually submitted: one draw call
    // per primitive and a change per style string in Canvas, one draw call per
    // batch and a change per texture/program/clip switch in a GPU backend.
    this.stats = {
      primitives: 0,
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
   * @param {import('../viewport.js').Viewport} [options.viewport] - Initial
   *   sizing; an identity viewport of width x height when omitted
   * @param {'linear'|'nearest'} [options.worldFilter='linear'] - Filter the
   *   world surface is upscaled with; see `setWorldFilter`
   */
  init(element, options) { throw new Error('Method not implemented'); }

  /**
   * Choose how the world surface is filtered when it is upscaled to the
   * screen, which happens whenever the render resolution is below the
   * display's. Backends that need to act on the change override this and call
   * super; the stored value is what a backend reads at presentation time.
   *
   * @param {'linear'|'nearest'} filter - 'nearest' for pixel art
   */
  setWorldFilter(filter) {
    this.worldFilter = filter === 'nearest' ? 'nearest' : 'linear';
  }

  /**
   * Clean up renderer resources.
   */
  destroy() { throw new Error('Method not implemented'); }

  /**
   * Visible world width, in world units. This is the camera's view size, not a
   * pixel count: it does not change when the render resolution changes.
   * @type {number}
   */
  get width() { return this.viewport.viewWidth; }

  /**
   * Visible world height, in world units.
   * @type {number}
   */
  get height() { return this.viewport.viewHeight; }

  /**
   * Adopt a new viewport: resize the backing store, the world surface and any
   * size-dependent resources, and re-establish the world and UI transforms.
   *
   * Backends must store the viewport even when they cannot act on it yet (a
   * WebGL context may be lost), so the size can be replayed on recovery.
   *
   * @param {import('../viewport.js').Viewport} viewport - The sizes to adopt
   */
  setViewport(viewport) { throw new Error('Method not implemented'); }

  /**
   * Resize the renderer to an unscaled `width` x `height` — view, world
   * surface, UI space and backing store all the same size. Called with no
   * arguments it re-applies the current viewport, which is how a backend
   * rebuilds after losing its drawing resources.
   *
   * This is the simple entry point; `setViewport` is the full one.
   *
   * @param {number} [width] - New width
   * @param {number} [height] - New height
   */
  resize(width, height) {
    const next = (width !== undefined && height !== undefined)
      ? identityViewport(width, height)
      : this.viewport;
    this.setViewport(next);
  }

  /**
   * Clear the presented surface.
   * Backends that keep intermediate buffers (e.g. a world buffer) clear those
   * in beginFrame(), not here.
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) { throw new Error('Method not implemented'); }

  // === Frame control ===

  /**
   * Begin a new world frame. Clears the world to opaque black so no content
   * from the previous frame survives. Subclasses must call super.beginFrame()
   * to keep FPS and draw-call statistics up to date.
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
   * @param {string} [options.tint] - Colour multiplied into every texel, e.g.
   *   `'#ff8080'` for a hit flash. The tint's own alpha scales the result.
   *   Optional; requires the `tint` capability.
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
   * Set the ambient light the world is lit by, and switch lighting on.
   *
   * No-op unless the backend claims `lights`. Pass `null` to turn lighting
   * back off; the world then renders at full brightness as if no light had
   * ever been submitted.
   * @param {string|null} color - Ambient colour, e.g. `'#303848'`
   */
  setAmbientLight(color) {}

  /**
   * Add a light to the current frame's light map.
   *
   * Lights are cleared at `beginFrame`, so they are submitted every frame
   * like any other draw. No-op unless the backend claims `lights` and an
   * ambient has been set.
   * @param {Object} options - Light options
   * @param {number} options.x - Centre X
   * @param {number} options.y - Centre Y
   * @param {number} options.radius - Radius at which the light reaches zero
   * @param {string} [options.color='#ffffff'] - Light colour
   * @param {number} [options.intensity=1] - Brightness multiplier
   * @param {boolean} [options.isScreenSpace=false] - Position in screen space
   */
  drawLight(options) {}

  /**
   * Configure the full-screen post pass, or pass `null` to disable it.
   *
   * No-op unless the backend claims `postEffects`.
   * @param {Object|null} effects - Effect configuration
   * @param {Object} [effects.bloom] - { threshold, strength, blur }
   * @param {Object} [effects.vignette] - { strength, start }
   */
  setPostEffects(effects) {}

  /**
   * Draw many copies of one sprite tile from a packed buffer.
   *
   * The default implementation is the fallback described under
   * `OPTIONAL_CAPABILITIES.particles`: a `drawSprite` per particle. Backends
   * that claim `particles` override it with a batched path.
   *
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Spritesheet image
   * @param {number} [options.tileX=0] - Tile X index in spritesheet
   * @param {number} [options.tileY=0] - Tile Y index in spritesheet
   * @param {number} options.tileWidth - Tile width in pixels
   * @param {number} options.tileHeight - Tile height in pixels
   * @param {Float32Array|number[]} options.data - `PARTICLE_STRIDE` floats per particle
   * @param {number} [options.count] - Particles to draw (defaults to the whole buffer)
   * @param {string} [options.blend] - Blend mode for every particle
   * @param {number} [options.globalAlpha] - Multiplied into every particle's alpha
   */
  drawParticles(options) {
    const { image, tileX = 0, tileY = 0, tileWidth, tileHeight, data, blend, isScreenSpace } = options;
    if (!image || !data) return;

    const available = Math.floor(data.length / PARTICLE_STRIDE);
    const count = Math.min(options.count ?? available, available);
    const aspect = tileWidth / tileHeight;
    const alphaScale = options.globalAlpha ?? 1;

    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE;
      const alpha = data[o + 7] * alphaScale;
      if (alpha <= 0) continue;

      this.drawSprite({
        image,
        tileX,
        tileY,
        tileWidth,
        tileHeight,
        x: data[o],
        y: data[o + 1],
        width: data[o + 2] * aspect,
        height: data[o + 2],
        rotation: data[o + 3],
        globalAlpha: alpha,
        blend,
        isScreenSpace
      });
    }
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
   * @param {string} [options.tint] - Colour multiplied into every texel.
   *   Optional; requires the `tint` capability.
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
   * Pop the most recent transform pushed with pushTransform(). Must be the
   * top of the shared transform/clip stack (see class docs).
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
   * Pop the most recent clipping rectangle. Must be the top of the shared
   * transform/clip stack (see class docs).
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

  /**
   * Whether this backend supports an optional feature.
   * @param {keyof OPTIONAL_CAPABILITIES} feature - Capability name
   * @returns {boolean} Whether the backend implements it
   */
  supports(feature) {
    return this.capabilities[feature] === true;
  }

  /**
   * Names of the optional features this backend supports.
   * @returns {string[]} Supported capability names
   */
  supportedCapabilities() {
    return Object.keys(this.capabilities).filter((name) => this.capabilities[name]);
  }

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
    this.stats.primitives = 0;
    this.stats.drawCalls = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
  }

  /**
   * Count a primitive requested by the caller. Backends call this once per
   * draw method invocation; how many GPU draw calls it becomes is theirs.
   * @param {'sprite'|'text'|'shape'} kind
   */
  trackPrimitive(kind) {
    this.stats.primitives++;
    if (kind === 'sprite') this.stats.spritesDrawn++;
    else if (kind === 'text') this.stats.textDrawn++;
    else this.stats.shapesDrawn++;
  }

  /**
   * Count backend state changes by diffing against the last seen values.
   * Canvas backends track style strings; GPU backends may track bound
   * textures/programs instead or count directly into stats.stateChanges.
   */
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
