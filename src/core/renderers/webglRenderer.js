import { BaseRenderer } from './baseRenderer.js';
import * as mat from './geometry/matrix.js';
import { parseColorPremultiplied } from './geometry/color.js';
import { strokePolyline } from './geometry/polyline.js';
import { arcPoints, roundRectPoints, fanIndices, triangulate } from './geometry/shapes.js';
import { bakeGradient, gradientKey, GRADIENT_LUT_SIZE } from './geometry/gradient.js';
import { createContext, createTexture } from './webgl/device.js';
import { Batch, MODE_SOLID, MODE_TEXTURE, MODE_GRADIENT, MODE_SHADOW } from './webgl/batch.js';
import { TextureCache } from './webgl/textureCache.js';
import { TextLabels } from './webgl/textLabels.js';
import { ShadowPass, expand } from './webgl/shadowPass.js';

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
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {WebGL2RenderingContext|null} */
    this.gl = null;
    this.width = 800;
    this.height = 600;
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
    const gl = createContext(element, this.contextAttributes);
    this.gl = gl;

    this.batch = new Batch(gl, this.stats);
    this.textures = new TextureCache(gl, this.imageSmoothing);
    this.labels = new TextLabels(gl);
    this.shadowPass = new ShadowPass(gl, this.width, this.height);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.STENCIL_TEST);

    this.width = options.width || this.width;
    this.height = options.height || this.height;
    this.resize();
  }

  destroy() {
    const gl = this.gl;
    if (gl) {
      this.batch?.destroy();
      this.textures?.destroy();
      this.labels?.destroy();
      this.shadowPass?.destroy();
      for (const entry of this.gradientCache.values()) gl.deleteTexture(entry.texture);
    }
    this.gradientCache.clear();
    this.batch = null;
    this.textures = null;
    this.labels = null;
    this.shadowPass = null;
    this.canvas = null;
    this.gl = null;
    this.stateStack = [];
    this.clipDepth = 0;
  }

  resize(width, height) {
    const gl = this.gl;
    if (!gl) return;

    if (width !== undefined && height !== undefined) {
      this.width = width;
      this.height = height;
    }

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    gl.viewport(0, 0, this.width, this.height);
    this.batch.setTarget(this.width, this.height, true);
    this.shadowPass.resize(this.width, this.height);
  }

  clear(color) {
    const gl = this.gl;
    if (!gl) return;
    this.batch.flush();
    const [r, g, b, a] = color ? parseColorPremultiplied(color) : [0, 0, 0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  // === Frame control ===

  beginFrame() {
    if (!this.gl) return;
    this.frameIndex++;
    this.clear('#000');
    this.cameraMatrix = mat.identity();
    this.worldMatrix = mat.identity();
    this.#resetStencil();
    super.beginFrame();
  }

  endFrame() {
    if (!this.gl) return;
    this.batch.flush();
    this.#evictGradients();
    this.labels.evict(this.frameIndex);
  }

  beginScreenFrame() {
    if (!this.gl) return;
    this.screenMatrix = mat.identity();
  }

  endScreenFrame() {
    if (!this.gl) return;
    this.batch.flush();
  }

  applyCamera(camera) {
    if (!this.gl) return;
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
  #paint(style, alpha, localPositions) {
    if (style && typeof style === 'object' && style.type) {
      const texture = this.#gradientTexture(style);
      const key = style.type === 'radial'
        ? { mode: MODE_GRADIENT, texture, gradientType: 1, gradient: [style.x, style.y, style.r0 ?? 0, style.r1] }
        : { mode: MODE_GRADIENT, texture, gradientType: 0, gradient: [style.x0, style.y0, style.x1, style.y1] };
      return { key, color: [alpha, alpha, alpha, alpha], uvs: localPositions };
    }
    const [r, g, b, a] = parseColorPremultiplied(style);
    return { key: { mode: MODE_SOLID }, color: [r * alpha, g * alpha, b * alpha, a * alpha], uvs: null };
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
    const { key, color, uvs } = this.#paint(style, alpha, localPositions);
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
    batch.flush();
    pass.beginSilhouette();
    batch.setTarget(this.width, this.height, false);
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
      const region = expand(bounds, radius + 1, radius + 1, this.width, this.height);
      this.stats.drawCalls += pass.blur(region, shadow);

      // 3. Composite onto the frame, offset and tinted.
      this.#bindDefaultTarget();
      const ox = shadow.offsetX || 0;
      const oy = shadow.offsetY || 0;
      const positions = [
        region.minX + ox, region.minY + oy, region.maxX + ox, region.minY + oy,
        region.maxX + ox, region.maxY + oy, region.minX + ox, region.maxY + oy
      ];
      const uvs = [
        region.minX / this.width, region.minY / this.height, region.maxX / this.width, region.minY / this.height,
        region.maxX / this.width, region.maxY / this.height, region.minX / this.width, region.maxY / this.height
      ];
      const alpha = options.globalAlpha ?? 1;
      batch.begin({ mode: MODE_SHADOW, texture: pass.texture, shadowColor: parseColorPremultiplied(shadow.color || 'rgba(0,0,0,0.5)') });
      batch.push(positions, uvs, [alpha, alpha, alpha, alpha], QUAD_INDICES);
      batch.flush();
    } else {
      this.#bindDefaultTarget();
    }

    // 4. The primitive itself.
    draw(options);
  }

  #bindDefaultTarget() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST);
    if (this.clipDepth > 0) gl.enable(gl.STENCIL_TEST);
    this.batch.setTarget(this.width, this.height, true);
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

    this.batch.begin({ mode: MODE_TEXTURE, texture: entry.texture });
    this.batch.push(positions, uvs, [alpha, alpha, alpha, alpha], QUAD_INDICES, uvBounds);
  }

  drawSprite(options) {
    if (!this.gl || !options.image) return;
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
    if (!this.gl || !options.image) return;
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

  drawRect(options) {
    if (!this.gl) return;
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
    if (!this.gl) return;
    this.trackPrimitive('shape');

    const { positions, indices } = strokePolyline(
      [options.x1, options.y1, options.x2, options.y2], false, options.lineWidth || 1
    );
    this.#withShadow(options, (opts) => this.#submitShape(opts, positions, indices, options.strokeStyle || '#000'));
  }

  drawArc(options) {
    if (!this.gl) return;
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
    if (!this.gl) return;
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
    if (!this.gl) return;
    this.trackPrimitive('text');

    const entry = this.labels.get(options, this.frameIndex);
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
    if (!this.gl) return;
    const current = this.#matrixFor(transform);
    this.stateStack.push({ kind: 'transform', screen: !!transform.isScreenSpace, matrix: current });
    this.#setMatrixFor(transform, mat.multiply(current, mat.fromTransform(transform)));
  }

  popTransform() {
    if (!this.gl) return;
    const entry = this.#popState('transform');
    if (!entry) return;
    if (entry.kind === 'transform') {
      this.#setMatrixFor({ isScreenSpace: entry.screen }, entry.matrix);
    } else {
      this.#unclip(entry);
    }
  }

  pushClip(rect) {
    if (!this.gl) return;
    const outline = roundRectPoints(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius || 0);
    const positions = mat.applyToPositions(this.#matrixFor(rect), outline);
    const indices = fanIndices(outline.length / 2);
    const entry = { kind: 'clip', screen: !!rect.isScreenSpace, positions, indices };
    this.stateStack.push(entry);
    this.#clip(entry);
  }

  popClip() {
    if (!this.gl) return;
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
    if (!this.gl) return { width: 0, height: 0 };
    return this.labels.measure(text, style);
  }

  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}

const QUAD_INDICES = [0, 1, 2, 0, 2, 3];
