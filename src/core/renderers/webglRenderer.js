import { BaseRenderer } from './baseRenderer.js';
import * as mat from './geometry/matrix.js';
import { parseColorPremultiplied } from './geometry/color.js';
import { strokePolyline } from './geometry/polyline.js';
import { arcPoints, roundRectPoints, fanIndices, triangulate } from './geometry/shapes.js';
import { bakeGradient, gradientKey, GRADIENT_LUT_SIZE } from './geometry/gradient.js';
import { createContext, createTexture } from './webgl/device.js';
import { Batch, MODE_SOLID, MODE_TEXTURE, MODE_GRADIENT } from './webgl/batch.js';

/**
 * WebGL2 implementation of the renderer interface.
 *
 * Geometry is tessellated and transformed to pixel space on the CPU (camera
 * and transform stack folded into one matrix per pass), then accumulated by
 * a Batch and drawn with as few GPU draw calls as paint-state changes allow.
 * World and screen passes draw straight to the default framebuffer in
 * submission order, so they can share batches.
 *
 * STATUS: shapes, transforms, clipping and gradients. Sprites/images, text
 * and shadows are the next steps; see the capability flags in
 * test/browser/webglRenderer.conformance.test.js.
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
      for (const entry of this.gradientCache.values()) gl.deleteTexture(entry.texture);
    }
    this.gradientCache.clear();
    this.batch = null;
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

  // === Draw primitives ===

  drawSprite(options) {
    if (!this.gl) return;
    this.#notImplemented('drawSprite');
  }

  drawImage(options) {
    if (!this.gl) return;
    this.#notImplemented('drawImage');
  }

  drawRect(options) {
    if (!this.gl) return;
    this.trackPrimitive('shape');

    const { x, y, width, height, cornerRadius } = options;
    const outline = roundRectPoints(x, y, width, height, cornerRadius || 0);
    this.#fillAndStroke(options, outline, true, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    });
  }

  drawLine(options) {
    if (!this.gl) return;
    this.trackPrimitive('shape');

    const { positions, indices } = strokePolyline(
      [options.x1, options.y1, options.x2, options.y2], false, options.lineWidth || 1
    );
    this.#submitShape(options, positions, indices, options.strokeStyle || '#000');
  }

  drawArc(options) {
    if (!this.gl) return;
    this.trackPrimitive('shape');

    const { points, full } = arcPoints(
      options.x, options.y, options.radius, options.startAngle ?? 0, options.endAngle ?? Math.PI * 2
    );
    // A chord-closed circular segment is always convex, so a fan is exact.
    this.#fillAndStroke(options, points, full, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    });
  }

  drawPath(options) {
    if (!this.gl) return;
    if (!options.points || options.points.length < 2) return;
    this.trackPrimitive('shape');

    const flat = [];
    for (const p of options.points) flat.push(p.x, p.y);
    this.#fillAndStroke(options, flat, !!options.closed, {
      fill: options.fillStyle,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth,
      fillIndices: triangulate(flat)
    });
  }

  drawText(options) {
    if (!this.gl) return;
    this.#notImplemented('drawText');
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

  measureText(text, style) {
    if (!this.gl) return { width: 0, height: 0 };
    this.#notImplemented('measureText');
  }

  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }

  #notImplemented(method) {
    throw new Error(`WebGLRenderer.${method} is not implemented yet`);
  }
}

export { MODE_TEXTURE };
