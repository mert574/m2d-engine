import { BaseRenderer } from './baseRenderer.js';

/**
 * WebGL2 implementation of the renderer interface.
 *
 * STATUS: scaffold. Lifecycle, clearing, frame control, and the camera are
 * real; every draw primitive, the transform/clip stacks, and measureText throw
 * a clear "not implemented" error. The conformance suite in
 * test/browser/webglRenderer.conformance.test.js declares every capability
 * false and is the to-do list for this backend: flip a flag on as its feature
 * lands.
 */
export class WebGLRenderer extends BaseRenderer {
  /**
   * @param {Object} [options]
   * @param {WebGLContextAttributes} [options.contextAttributes] - Merged over
   *   the defaults. Tests pass `preserveDrawingBuffer: true` so pixels can be
   *   read back after the frame is presented.
   */
  constructor(options = {}) {
    super();
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {WebGL2RenderingContext|null} */
    this.gl = null;
    this.width = 800;
    this.height = 600;
    this.contextAttributes = {
      alpha: true,
      premultipliedAlpha: false,
      stencil: true,
      antialias: true,
      preserveDrawingBuffer: false,
      ...(options.contextAttributes || {})
    };
    /** Camera translation applied to world-space draws. */
    this.cameraOffset = { x: 0, y: 0 };
  }

  // === Lifecycle ===

  init(element, options = {}) {
    this.canvas = element;
    this.gl = element.getContext('webgl2', this.contextAttributes);
    if (!this.gl) {
      throw new Error('WebGLRenderer: WebGL2 is not available on this canvas/browser');
    }

    this.width = options.width || this.width;
    this.height = options.height || this.height;
    this.resize();
  }

  destroy() {
    this.canvas = null;
    this.gl = null;
  }

  resize(width, height) {
    if (!this.gl) return;

    if (width !== undefined && height !== undefined) {
      this.width = width;
      this.height = height;
    }

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.gl.viewport(0, 0, this.width, this.height);
  }

  clear(color) {
    const gl = this.gl;
    if (!gl) return;
    const [r, g, b, a] = color ? parseColor(color) : [0, 0, 0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  // === Frame control ===

  beginFrame() {
    if (!this.gl) return;
    this.clear('#000');
    this.cameraOffset.x = 0;
    this.cameraOffset.y = 0;
    super.beginFrame();
  }

  endFrame() {
    // World content is drawn straight to the default framebuffer for now.
  }

  beginScreenFrame() {}

  endScreenFrame() {}

  applyCamera(camera) {
    this.cameraOffset.x = -camera.x + camera.width / 2;
    this.cameraOffset.y = -camera.y + camera.height / 2;
  }

  // === Draw primitives (not yet implemented) ===

  #notImplemented(method) {
    // Matches the Canvas backend: draws after destroy() are silently ignored.
    if (!this.gl) return false;
    throw new Error(`WebGLRenderer.${method} is not implemented yet`);
  }

  drawSprite(options) { this.#notImplemented('drawSprite'); }
  drawImage(options) { this.#notImplemented('drawImage'); }
  drawRect(options) { this.#notImplemented('drawRect'); }
  drawLine(options) { this.#notImplemented('drawLine'); }
  drawArc(options) { this.#notImplemented('drawArc'); }
  drawPath(options) { this.#notImplemented('drawPath'); }
  drawText(options) { this.#notImplemented('drawText'); }

  pushTransform(transform) { this.#notImplemented('pushTransform'); }
  popTransform() { this.#notImplemented('popTransform'); }
  pushClip(rect) { this.#notImplemented('pushClip'); }
  popClip() { this.#notImplemented('popClip'); }

  measureText(text, style) {
    if (!this.gl) return { width: 0, height: 0 };
    throw new Error('WebGLRenderer.measureText is not implemented yet');
  }

  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}

/**
 * Parse a CSS colour into normalised [r, g, b, a] floats for gl.clearColor.
 * Handles #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(). Anything else
 * (named colours, hsl) is resolved through a 1x1 2D canvas.
 * @param {string} color
 * @returns {number[]}
 */
export function parseColor(color) {
  const value = String(color).trim();

  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map(c => c + c).join('');
    }
    const int = parseInt(hex, 16);
    if (hex.length === 8) {
      return [((int >>> 24) & 255) / 255, ((int >>> 16) & 255) / 255, ((int >>> 8) & 255) / 255, (int & 255) / 255];
    }
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, 1];
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (match) {
    const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] === undefined ? 1 : parts[3]];
  }

  return parseColorViaCanvas(value);
}

let scratchContext = null;

function parseColorViaCanvas(value) {
  if (!scratchContext) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    scratchContext = canvas.getContext('2d', { willReadFrequently: true });
  }
  scratchContext.clearRect(0, 0, 1, 1);
  scratchContext.fillStyle = value;
  scratchContext.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = scratchContext.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}
