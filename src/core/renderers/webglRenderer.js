import { BaseRenderer, PARTICLE_STRIDE } from './baseRenderer.js';
import * as mat from './geometry/matrix.js';
import { parseColor, parseColorPremultiplied } from './geometry/color.js';
import { strokePolyline } from './geometry/polyline.js';
import { arcPoints, roundRectPoints, fanIndices, triangulate } from './geometry/shapes.js';
import { bakeGradient, gradientKey, GRADIENT_LUT_SIZE } from './geometry/gradient.js';
import { createContext, createTexture } from './webgl/device.js';
import { Batch, MODE_SOLID, MODE_TEXTURE, MODE_GRADIENT, MODE_SHADOW } from './webgl/batch.js';
import { TextureCache } from './webgl/textureCache.js';
import { TextLabels } from './webgl/textLabels.js';
import { ShadowPass, expand } from './webgl/shadowPass.js';
import { EffectsPass } from './webgl/effectsPass.js';
import { identityViewport } from '../viewport.js';

/**
 * WebGL2 implementation of the renderer interface.
 *
 * Geometry is tessellated and transformed to pixel space on the CPU (camera
 * and transform stack folded into one matrix per pass), then accumulated by
 * a Batch and drawn with as few GPU draw calls as paint-state changes allow.
 * World and screen passes draw straight to the default framebuffer in
 * submission order, so they can share batches.
 *
 * Shadows (the contract's silhouette shadow) render the primitive to an
 * offscreen target, blur the bounding region, and composite it tinted before
 * drawing the primitive; see ShadowPass.
 */
export class WebGLRenderer extends BaseRenderer {
  /**
   * @param {Object} [options]
   * @param {WebGLContextAttributes} [options.contextAttributes] - Merged over
   *   the defaults. Tests pass `preserveDrawingBuffer: true` so pixels can be
   *   read back after the frame is presented.
   * @param {boolean} [options.imageSmoothing=true] - Linear (true) or nearest
   *   (false) texture filtering; matches Canvas 2D's default when true.
   */
  constructor(options = {}) {
    super();
    this.capabilities.tint = true;
    this.capabilities.blendModes = true;
    this.capabilities.particles = true;
    this.capabilities.lights = true;
    this.capabilities.postEffects = true;

    /** Ambient light colour, or null when lighting is off. */
    this.ambientLight = null;
    /** Lights submitted this frame, cleared at beginFrame. */
    this.lights = [];
    /** Post-effect configuration, or null. */
    this.postEffects = null;
    /** Which framebuffer world/screen draws currently belong to. */
    this.targetIsScene = false;
    /** True between beginScreenFrame and endScreenFrame. */
    this.inScreenPass = false;
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {WebGL2RenderingContext|null} */
    this.gl = null;
    this.imageSmoothing = options.imageSmoothing ?? true;
    this.contextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
      antialias: true,
      preserveDrawingBuffer: false,
      ...(options.contextAttributes || {})
    };

    /** @type {Batch|null} */
    this.batch = null;
    /** @type {TextureCache|null} */
    this.textures = null;
    /** @type {TextLabels|null} */
    this.labels = null;
    /** @type {ShadowPass|null} */
    this.shadowPass = null;

    // Pass matrices (pixel space). The camera is folded into worldMatrix.
    this.worldMatrix = mat.identity();
    this.screenMatrix = mat.identity();
    this.cameraMatrix = mat.identity();

    /**
     * Shared transform/clip stack (the contract requires strict nesting).
     * @type {Array<{kind: 'transform'|'clip', screen: boolean, matrix?: number[], positions?: number[], indices?: number[]}>}
     */
    this.stateStack = [];
    this.clipDepth = 0;

    /** Gradient ramps baked to 256x1 textures, keyed by their stops. */
    this.gradientCache = new Map();
    this.frameIndex = 0;
  }

  // === Lifecycle ===

  init(element, options = {}) {
    this.canvas = element;
    this.gl = createContext(element, this.contextAttributes);
    const viewport = options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    );

    // GPU resources live in #createResources so a context restore can rebuild
    // them; everything else about the renderer survives a loss untouched.
    this.onContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.#createResources();
      this.resize();
    };
    element.addEventListener('webglcontextlost', this.onContextLost, false);
    element.addEventListener('webglcontextrestored', this.onContextRestored, false);

    this.contextLost = false;
    this.viewport = viewport;
    this.#createResources();
    this.setViewport(viewport);
  }

  #createResources() {
    const gl = this.gl;
    const { viewWidth, viewHeight, worldWidth, worldHeight } = this.viewport;
    this.batch = new Batch(gl, this.stats);
    this.textures = new TextureCache(gl, this.imageSmoothing);
    this.labels = new TextLabels(gl);
    this.shadowPass = new ShadowPass(gl, viewWidth, viewHeight, worldWidth, worldHeight);
    this.effectsPass = new EffectsPass(gl, viewWidth, viewHeight, worldWidth, worldHeight);
    this.gradientCache.clear();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.STENCIL_TEST);
  }

  #releaseResources() {
    const gl = this.gl;
    if (!gl) return;
    this.batch?.destroy();
    this.textures?.destroy();
    this.labels?.destroy();
    this.shadowPass?.destroy();
    this.effectsPass?.destroy();
    for (const entry of this.gradientCache.values()) gl.deleteTexture(entry.texture);
    this.gradientCache.clear();
    this.batch = null;
    this.textures = null;
    this.labels = null;
    this.shadowPass = null;
    this.effectsPass = null;
  }

  destroy() {
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    }
    this.#releaseResources();
    // Browsers cap live WebGL contexts per page; give this one back promptly.
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas = null;
    this.gl = null;
    this.stateStack = [];
    this.clipDepth = 0;
  }

  /** True while drawing is possible (initialized and context not lost). */
  get #ready() {
    return !!this.gl && !this.contextLost;
  }

  setViewport(viewport) {
    // Store first: a resize that arrives while the context is lost must still
    // be the size that gets replayed once it is restored.
    this.viewport = viewport;

    const gl = this.gl;
    if (!this.#ready) return;

    const { backingWidth, backingHeight, viewWidth, viewHeight, worldWidth, worldHeight } = viewport;
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.shadowPass.resize(viewWidth, viewHeight, worldWidth, worldHeight);
    this.effectsPass.resize(viewWidth, viewHeight, worldWidth, worldHeight);
    this.#bindDefaultTarget();
  }

  clear(color) {
    const gl = this.gl;
    if (!this.#ready) return;
    this.batch.flush();
    const [r, g, b, a] = color ? parseColorPremultiplied(color) : [0, 0, 0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  // === Frame control ===

  beginFrame() {
    if (!this.#ready) return;
    this.frameIndex++;
    this.clear('#000');
    this.cameraMatrix = mat.identity();
    this.worldMatrix = mat.identity();
    this.lights.length = 0;
    this.#resetStencil();

    // With lighting or post effects on, the world needs to end up in a
    // texture rather than on screen, so it is drawn into the effects pass's
    // scene target and composited in endFrame().
    this.inScreenPass = false;
    this.#bindDefaultTarget();

    this.targetIsScene = this.#effectsActive;
    if (this.targetIsScene) {
      this.effectsPass.beginScene();
      this.batch.setTarget(this.width, this.height, false);
      this.batch.invalidateState();
    }

    super.beginFrame();
  }

  endFrame() {
    if (!this.#ready) return;
    this.batch.flush();

    if (this.targetIsScene) {
      const v = this.viewport;
      const ambient = this.ambientLight ? parseColor(this.ambientLight) : [1, 1, 1, 1];
      this.stats.drawCalls += this.effectsPass.drawLights(this.lights, ambient);
      this.stats.drawCalls += this.effectsPass.composite(this.postEffects, {
        x: v.contentX,
        y: v.backingHeight - v.contentY - v.contentHeight,
        width: v.contentWidth,
        height: v.contentHeight
      });
      this.targetIsScene = false;
      this.#bindDefaultTarget();
    }

    this.#evictGradients();
    this.labels.evict(this.frameIndex);
  }

  beginScreenFrame() {
    if (!this.#ready) return;
    // The screen pass always goes straight to the default framebuffer, after
    // the composite, so UI is never dimmed by ambient or smeared by bloom.
    // It also covers the whole backing store at display resolution, which is
    // what keeps UI text sharp however coarse the world resolution is.
    this.targetIsScene = false;
    this.inScreenPass = true;
    this.#bindDefaultTarget();
    this.screenMatrix = mat.identity();
  }

  endScreenFrame() {
    if (!this.#ready) return;
    this.batch.flush();
    this.inScreenPass = false;
  }

  applyCamera(camera) {
    if (!this.#ready) return;
    this.cameraMatrix = mat.translation(-camera.x + camera.width / 2, -camera.y + camera.height / 2);
    this.worldMatrix = mat.multiply(this.cameraMatrix, mat.identity());
  }

  // === Paint helpers ===

  /** Current matrix for a draw call's pass. */
  #matrixFor(options) {
    return options.isScreenSpace ? this.screenMatrix : this.worldMatrix;
  }

  #setMatrixFor(options, m) {
    if (options.isScreenSpace) this.screenMatrix = m;
    else this.worldMatrix = m;
  }

  /**
   * Resolve a fill/stroke style into a batch key plus per-vertex colour and
   * uvs for the given local-space positions.
   */
  /**
   * Premultiplied vertex colour for a textured draw.
   * @param {string} [tint] - Colour multiplied into every texel
   * @param {number} alpha - globalAlpha
   * @returns {number[]} Premultiplied [r, g, b, a]
   */
  #tintColor(tint, alpha) {
    if (!tint) return [alpha, alpha, alpha, alpha];
    const [r, g, b, a] = parseColor(tint);
    const s = a * alpha;
    return [r * s, g * s, b * s, s];
  }

  #paint(style, alpha, localPositions, blend) {
    if (style && typeof style === 'object' && style.type) {
      const texture = this.#gradientTexture(style);
      const key = style.type === 'radial'
        ? { mode: MODE_GRADIENT, texture, gradientType: 1, gradient: [style.x, style.y, style.r0 ?? 0, style.r1], blend }
        : { mode: MODE_GRADIENT, texture, gradientType: 0, gradient: [style.x0, style.y0, style.x1, style.y1], blend };
      return { key, color: [alpha, alpha, alpha, alpha], uvs: localPositions };
    }
    const [r, g, b, a] = parseColorPremultiplied(style);
    return { key: { mode: MODE_SOLID, blend }, color: [r * alpha, g * alpha, b * alpha, a * alpha], uvs: null };
  }

  #gradientTexture(style) {
    const gl = this.gl;
    const key = gradientKey(style);
    let entry = this.gradientCache.get(key);
    if (!entry) {
      const texture = createTexture(gl, {
        pixels: bakeGradient(style.stops), width: GRADIENT_LUT_SIZE, height: 1, smooth: true
      });
      entry = { texture, lastUsed: this.frameIndex };
      this.gradientCache.set(key, entry);
      this.batch.invalidateState();
    }
    entry.lastUsed = this.frameIndex;
    return entry.texture;
  }

  #evictGradients() {
    if (this.gradientCache.size < 64) return;
    for (const [key, entry] of this.gradientCache) {
      if (this.frameIndex - entry.lastUsed > 120) {
        this.gl.deleteTexture(entry.texture);
        this.gradientCache.delete(key);
      }
    }
  }

  /**
   * Submit a filled/stroked local-space polygon set to the batch.
   * @param {Object} options - Draw options (alpha, shadow, pass)
   * @param {number[]} localPositions - Local-space positions
   * @param {number[]} indices
   * @param {string|Object} style
   */
  #submitShape(options, localPositions, indices, style) {
    if (indices.length === 0) return;
    const alpha = options.globalAlpha ?? 1;
    const { key, color, uvs } = this.#paint(style, alpha, localPositions, options.blend);
    const positions = mat.applyToPositions(this.#matrixFor(options), localPositions);
    this.batch.begin(key);
    this.batch.push(positions, uvs, color, indices);
  }

  #fillAndStroke(options, outline, closed, { fill, stroke, lineWidth, fillIndices }) {
    if (fill) {
      const indices = fillIndices || fanIndices(outline.length / 2);
      this.#submitShape(options, outline, indices, fill);
    }
    if (stroke) {
      const { positions, indices } = strokePolyline(outline, closed, lineWidth || 1);
      this.#submitShape(options, positions, indices, stroke);
    }
  }

  /**
   * Run a primitive's submissions, casting its silhouette shadow first when
   * options.shadow is set. The silhouette is whatever `draw` submits (fill
   * and stroke, or the textured quad), so every primitive shares this path.
   */
  #withShadow(options, draw) {
    const shadow = options.shadow;
    if (!shadow) {
      draw(options);
      return;
    }
    const gl = this.gl;
    const batch = this.batch;
    const pass = this.shadowPass;

    // 1. Silhouette into the offscreen target, with the primitive's own alpha
    //    forced to 1: alpha is applied once, at composite time.
    // Shadows are cast in the active pass's space: world units at the world
    // render resolution, or UI units at display resolution. Sizes usually
    // match what the pass already has, in which case this costs nothing.
    const space = this.#passSpace();
    pass.resize(space.width, space.height, space.pixelWidth, space.pixelHeight);

    batch.flush();
    pass.beginSilhouette();
    batch.setTarget(space.width, space.height, false);
    batch.invalidateState();
    batch.trackBounds(true);
    const opaque = { ...options, globalAlpha: 1, shadow: null };
    draw(opaque);
    batch.flush();
    const bounds = batch.bounds;
    batch.trackBounds(false);

    if (bounds && bounds.minX <= bounds.maxX) {
      // 2. Blur over the bounding region.
      const radius = ShadowPass.radius(shadow);
      const region = expand(bounds, radius + 1, radius + 1, space.width, space.height);
      this.stats.drawCalls += pass.blur(region, shadow);

      // 3. Composite onto the frame, offset and tinted.
      this.#bindCurrentTarget();
      const ox = shadow.offsetX || 0;
      const oy = shadow.offsetY || 0;
      const positions = [
        region.minX + ox, region.minY + oy, region.maxX + ox, region.minY + oy,
        region.maxX + ox, region.maxY + oy, region.minX + ox, region.maxY + oy
      ];
      const uvs = [
        region.minX / space.width, region.minY / space.height, region.maxX / space.width, region.minY / space.height,
        region.maxX / space.width, region.maxY / space.height, region.minX / space.width, region.maxY / space.height
      ];
      const alpha = options.globalAlpha ?? 1;
      batch.begin({ mode: MODE_SHADOW, texture: pass.texture, shadowColor: parseColorPremultiplied(shadow.color || 'rgba(0,0,0,0.5)'), blend: options.blend });
      batch.push(positions, uvs, [alpha, alpha, alpha, alpha], QUAD_INDICES);
      batch.flush();
    } else {
      this.#bindCurrentTarget();
    }

    // 4. The primitive itself.
    draw(options);
  }

  /**
   * Coordinate space and pixel resolution of the pass currently drawing.
   * @returns {{width: number, height: number, pixelWidth: number, pixelHeight: number}}
   */
  #passSpace() {
    const v = this.viewport;
    return this.inScreenPass
      ? { width: v.uiWidth, height: v.uiHeight, pixelWidth: v.backingWidth, pixelHeight: v.backingHeight }
      : { width: v.viewWidth, height: v.viewHeight, pixelWidth: v.worldWidth, pixelHeight: v.worldHeight };
  }

  /**
   * Re-bind whichever framebuffer the current pass draws into. The world pass
   * owns the effects scene target when lighting or post effects are on;
   * everything else owns the default framebuffer.
   */
  #bindCurrentTarget() {
    if (this.targetIsScene) {
      this.effectsPass.bindScene(this.clipDepth);
      this.batch.setTarget(this.width, this.height, false);
      this.batch.invalidateState();
      return;
    }
    this.#bindDefaultTarget();
  }

  /**
   * Bind the default framebuffer for whichever pass is active.
   *
   * The two passes address it differently, and that difference is what keeps
   * the UI sharp: the world covers only its content rect and is measured in
   * world units, while the UI covers the whole backing store at full display
   * resolution and is measured in UI units.
   */
  #bindDefaultTarget() {
    const gl = this.gl;
    const v = this.viewport;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    if (this.clipDepth > 0) gl.enable(gl.STENCIL_TEST);

    if (this.inScreenPass) {
      gl.viewport(0, 0, v.backingWidth, v.backingHeight);
      this.batch.setTarget(v.uiWidth, v.uiHeight, true);
    } else {
      // GL measures y from the bottom; the content rect measures from the top.
      const glY = v.backingHeight - v.contentY - v.contentHeight;
      gl.viewport(v.contentX, glY, v.contentWidth, v.contentHeight);
      this.batch.setTarget(v.viewWidth, v.viewHeight, true);
    }
    this.batch.invalidateState();
  }

  // === Draw primitives ===

  /**
   * Submit a textured quad. `local` is the quad's local-space corner list
   * (top-left, top-right, bottom-right, bottom-left) and `localMatrix` places
   * it before the pass matrix is applied.
   */
  #submitTexturedQuad(options, entry, local, localMatrix, source) {
    const { width: tw, height: th } = entry;
    const u0 = source.x / tw, v0 = source.y / th;
    const u1 = (source.x + source.width) / tw, v1 = (source.y + source.height) / th;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    // Inset half a texel so linear filtering stays inside the source rect.
    const hx = Math.min(0.5 / tw, (u1 - u0) / 2);
    const hy = Math.min(0.5 / th, (v1 - v0) / 2);
    const uvBounds = [u0 + hx, v0 + hy, u1 - hx, v1 - hy];

    const alpha = options.globalAlpha ?? 1;
    const m = localMatrix ? mat.multiply(this.#matrixFor(options), localMatrix) : this.#matrixFor(options);
    const positions = mat.applyToPositions(m, local);

    // The texture path already evaluates `texel * v_color`, so a tint costs
    // nothing extra: fold it into the vertex colour. White tint reduces to
    // [a, a, a, a], which is exactly the untinted case.
    const color = this.#tintColor(options.tint, alpha);

    this.batch.begin({ mode: MODE_TEXTURE, texture: entry.texture, blend: options.blend });
    this.batch.push(positions, uvs, color, QUAD_INDICES, uvBounds);
  }

  drawSprite(options) {
    if (!this.#ready || !options.image) return;
    const entry = this.textures.get(options.image);
    if (!entry) return;
    this.trackPrimitive('sprite');

    const {
      x, y, tileX = 0, tileY = 0, tileWidth, tileHeight,
      width = tileWidth, height = tileHeight,
      rotation = 0, flipX = false, flipY = false
    } = options;

    let local = mat.translation(x, y);
    if (rotation) local = mat.multiply(local, mat.rotation(rotation));
    if (flipX || flipY) local = mat.multiply(local, mat.scaling(flipX ? -1 : 1, flipY ? -1 : 1));

    const hw = width / 2, hh = height / 2;
    this.#withShadow(options, (opts) => this.#submitTexturedQuad(
      opts, entry,
      [-hw, -hh, hw, -hh, hw, hh, -hw, hh],
      local,
      { x: tileX * tileWidth, y: tileY * tileHeight, width: tileWidth, height: tileHeight }
    ));
  }

  drawImage(options) {
    if (!this.#ready || !options.image) return;
    const entry = this.textures.get(options.image);
    if (!entry) return;
    this.trackPrimitive('sprite');

    const width = options.width ?? entry.width;
    const height = options.height ?? entry.height;
    const source = options.sourceWidth !== undefined && options.sourceHeight !== undefined
      ? { x: options.sourceX ?? 0, y: options.sourceY ?? 0, width: options.sourceWidth, height: options.sourceHeight }
      : { x: 0, y: 0, width: entry.width, height: entry.height };

    const { x, y } = options;
    this.#withShadow(options, (opts) => this.#submitTexturedQuad(
      opts, entry,
      [x, y, x + width, y, x + width, y + height, x, y + height],
      null,
      source
    ));
  }

  /**
   * Batched particle path. Each particle becomes one textured quad pushed
   * straight into the running batch with its own premultiplied colour, so a
   * whole field shares one texture bind and flushes only when the vertex
   * buffer fills. The quad is rotated and transformed inline rather than via
   * the matrix helpers, which would allocate per particle.
   */
  drawParticles(options) {
    if (!this.#ready || !options.image || !options.data) return;
    const entry = this.textures.get(options.image);
    if (!entry) return;

    const { data, tileX = 0, tileY = 0, tileWidth, tileHeight } = options;
    const available = Math.floor(data.length / PARTICLE_STRIDE);
    const count = Math.min(options.count ?? available, available);
    if (count <= 0) return;

    const { width: tw, height: th } = entry;
    const sx = tileX * tileWidth, sy = tileY * tileHeight;
    const u0 = sx / tw, v0 = sy / th;
    const u1 = (sx + tileWidth) / tw, v1 = (sy + tileHeight) / th;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    const hx = Math.min(0.5 / tw, (u1 - u0) / 2);
    const hy = Math.min(0.5 / th, (v1 - v0) / 2);
    const uvBounds = [u0 + hx, v0 + hy, u1 - hx, v1 - hy];

    const [ma, mb, mc, md, me, mf] = this.#matrixFor(options);
    const aspect = tileWidth / tileHeight;
    const alphaScale = options.globalAlpha ?? 1;
    const positions = this.#particleQuad;
    const color = this.#particleColor;
    let drawn = 0;

    this.batch.begin({ mode: MODE_TEXTURE, texture: entry.texture, blend: options.blend });

    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE;
      const alpha = data[o + 7] * alphaScale;
      if (alpha <= 0) continue;

      const px = data[o], py = data[o + 1];
      const hh = data[o + 2] / 2, hw = hh * aspect;
      const rot = data[o + 3];
      const c = rot ? Math.cos(rot) : 1;
      const sn = rot ? Math.sin(rot) : 0;

      // Rotated half-extents: corner = centre ± ex ± ey.
      const exx = c * hw, exy = sn * hw;
      const eyx = -sn * hh, eyy = c * hh;

      let x, y;
      x = px - exx - eyx; y = py - exy - eyy;
      positions[0] = ma * x + mc * y + me; positions[1] = mb * x + md * y + mf;
      x = px + exx - eyx; y = py + exy - eyy;
      positions[2] = ma * x + mc * y + me; positions[3] = mb * x + md * y + mf;
      x = px + exx + eyx; y = py + exy + eyy;
      positions[4] = ma * x + mc * y + me; positions[5] = mb * x + md * y + mf;
      x = px - exx + eyx; y = py - exy + eyy;
      positions[6] = ma * x + mc * y + me; positions[7] = mb * x + md * y + mf;

      color[0] = data[o + 4] * alpha;
      color[1] = data[o + 5] * alpha;
      color[2] = data[o + 6] * alpha;
      color[3] = alpha;

      this.batch.push(positions, uvs, color, QUAD_INDICES, uvBounds);
      drawn++;
    }

    this.stats.primitives += drawn;
    this.stats.spritesDrawn += drawn;
  }

  /** Scratch buffers for drawParticles, reused across particles and frames. */
  #particleQuad = new Array(8);
  #particleColor = new Array(4);

  setAmbientLight(color) {
    this.ambientLight = color ?? null;
  }

  setPostEffects(effects) {
    this.postEffects = effects ?? null;
  }

  drawLight(options) {
    if (!this.#ready || !this.#effectsActive) return;
    const { x, y, radius, color = '#ffffff', intensity = 1 } = options;
    const m = this.#matrixFor(options);
    const [sx, sy] = mat.apply(m, x, y);
    this.lights.push({
      x: sx,
      y: sy,
      radius: radius * mat.maxScale(m),
      color: parseColor(color),
      intensity
    });
  }

  /** Whether this frame routes the world pass through the effects target. */
  get #effectsActive() {
    return Boolean(this.ambientLight || this.postEffects);
  }

  drawRect(options) {
    if (!this.#ready) return;
    this.trackPrimitive('shape');

    const { x, y, width, height, cornerRadius } = options;
    const outline = roundRectPoints(x, y, width, height, cornerRadius || 0);
    this.#withShadow(options, (opts) => this.#fillAndStroke(opts, outline, true, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    }));
  }

  drawLine(options) {
    if (!this.#ready) return;
    this.trackPrimitive('shape');

    const { positions, indices } = strokePolyline(
      [options.x1, options.y1, options.x2, options.y2], false, options.lineWidth || 1
    );
    this.#withShadow(options, (opts) => this.#submitShape(opts, positions, indices, options.strokeStyle || '#000'));
  }

  drawArc(options) {
    if (!this.#ready) return;
    this.trackPrimitive('shape');

    const { points, full } = arcPoints(
      options.x, options.y, options.radius, options.startAngle ?? 0, options.endAngle ?? Math.PI * 2
    );
    // A chord-closed circular segment is always convex, so a fan is exact.
    this.#withShadow(options, (opts) => this.#fillAndStroke(opts, points, full, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    }));
  }

  drawPath(options) {
    if (!this.#ready) return;
    if (!options.points || options.points.length < 2) return;
    this.trackPrimitive('shape');

    const flat = [];
    for (const p of options.points) flat.push(p.x, p.y);
    const fillIndices = triangulate(flat);
    this.#withShadow(options, (opts) => this.#fillAndStroke(opts, flat, !!options.closed, {
      fill: options.fillStyle,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth,
      fillIndices
    }));
  }

  drawText(options) {
    if (!this.#ready) return;
    this.trackPrimitive('text');

    // Rasterize at the density the active pass is presented with: UI text
    // follows the display, world text follows the render resolution.
    const space = this.#passSpace();
    const entry = this.labels.get(options, this.frameIndex, space.pixelWidth / space.width);
    if (!entry) return;

    const x = options.x - entry.anchorX;
    const y = options.y - entry.anchorY;
    this.#withShadow(options, (opts) => this.#submitTexturedQuad(
      opts, entry,
      [x, y, x + entry.width, y, x + entry.width, y + entry.height, x, y + entry.height],
      null,
      { x: 0, y: 0, width: entry.width, height: entry.height }
    ));
  }

  // === Transform & clip stacks ===

  pushTransform(transform = {}) {
    if (!this.#ready) return;
    const current = this.#matrixFor(transform);
    this.stateStack.push({ kind: 'transform', screen: !!transform.isScreenSpace, matrix: current });
    this.#setMatrixFor(transform, mat.multiply(current, mat.fromTransform(transform)));
  }

  popTransform() {
    if (!this.#ready) return;
    const entry = this.#popState('transform');
    if (!entry) return;
    if (entry.kind === 'transform') {
      this.#setMatrixFor({ isScreenSpace: entry.screen }, entry.matrix);
    } else {
      this.#unclip(entry);
    }
  }

  pushClip(rect) {
    if (!this.#ready) return;
    const outline = roundRectPoints(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius || 0);
    const positions = mat.applyToPositions(this.#matrixFor(rect), outline);
    const indices = fanIndices(outline.length / 2);
    const entry = { kind: 'clip', screen: !!rect.isScreenSpace, positions, indices };
    this.stateStack.push(entry);
    this.#clip(entry);
  }

  popClip() {
    if (!this.#ready) return;
    const entry = this.#popState('clip');
    if (!entry) return;
    if (entry.kind === 'clip') {
      this.#unclip(entry);
    } else {
      this.#setMatrixFor({ isScreenSpace: entry.screen }, entry.matrix);
    }
  }

  #popState(kind) {
    const entry = this.stateStack.pop();
    if (!entry) return null;
    if (entry.kind !== kind) {
      console.warn(`WebGLRenderer: pop${kind === 'clip' ? 'Clip' : 'Transform'}() called but the top of the state stack is a ${entry.kind}; transform/clip pushes must nest`);
    }
    return entry;
  }

  /**
   * Stencil-based clipping with reference counting: the stencil value of a
   * pixel is the number of active clips containing it, so nested clips
   * intersect. Draws pass only where stencil == clipDepth.
   */
  #clip(entry) {
    const gl = this.gl;
    this.batch.flush();
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    this.#drawStencilGeometry(entry);
    this.clipDepth++;
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    this.stats.stateChanges += 2;
  }

  #unclip(entry) {
    const gl = this.gl;
    this.batch.flush();
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
    this.#drawStencilGeometry(entry);
    this.clipDepth = Math.max(0, this.clipDepth - 1);
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    if (this.clipDepth === 0) gl.disable(gl.STENCIL_TEST);
    this.stats.stateChanges += 2;
  }

  #drawStencilGeometry(entry) {
    const gl = this.gl;
    gl.colorMask(false, false, false, false);
    this.batch.begin({ mode: MODE_SOLID });
    this.batch.push(entry.positions, null, [0, 0, 0, 0], entry.indices);
    this.batch.flush();
    // The stencil-only draw is bookkeeping, not a submitted primitive batch.
    this.stats.drawCalls--;
    gl.colorMask(true, true, true, true);
  }

  #resetStencil() {
    const gl = this.gl;
    this.clipDepth = 0;
    this.stateStack = [];
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
  }

  // === Queries ===

  measureText(text, style = {}) {
    if (!this.#ready) return { width: 0, height: 0 };
    return this.labels.measure(text, style);
  }

  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}

const QUAD_INDICES = [0, 1, 2, 0, 2, 3];
