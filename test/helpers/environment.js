/**
 * Environment shim so renderer tests run both headless (Node + node-canvas)
 * and in a real browser (vitest browser mode), without the tests themselves
 * knowing which one they are in.
 */

const hasDOM = typeof globalThis.document !== 'undefined' &&
  typeof globalThis.document.createElement === 'function';

/** @type {(width: number, height: number) => HTMLCanvasElement} */
let createCanvasElement;

if (hasDOM) {
  createCanvasElement = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
} else {
  // `canvas` is a native Node addon. The specifier is kept out of a literal
  // import() so Vite does not try to resolve/bundle it when this module is
  // served to the browser project (where this branch never runs).
  const nodeCanvasSpecifier = 'canvas';
  const mod = await import(/* @vite-ignore */ nodeCanvasSpecifier);
  const createCanvas = mod.createCanvas ?? mod.default?.createCanvas;
  if (!createCanvas) {
    throw new Error('node-canvas is required to run renderer tests headlessly');
  }

  createCanvasElement = (width, height) => {
    const canvas = createCanvas(width, height);
    // Renderers set canvas.style.cursor; node-canvas has no style object.
    if (!canvas.style) canvas.style = {};
    return canvas;
  };

  // CanvasRenderer allocates its world buffer via document.createElement.
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') {
        throw new Error(`Unsupported element in headless tests: ${tag}`);
      }
      return createCanvasElement(300, 150);
    }
  };
}

/**
 * Read back a 2D canvas as raw RGBA, top-left origin.
 * @param {HTMLCanvasElement} target
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function readCanvas2DPixels(target) {
  const ctx = target.getContext('2d');
  const image = ctx.getImageData(0, 0, target.width, target.height);
  return { width: image.width, height: image.height, data: image.data };
}

/**
 * Read back a WebGL2 canvas as raw RGBA, top-left origin.
 *
 * gl.readPixels returns rows bottom-up, so they are flipped here to match
 * readCanvas2DPixels and the conformance suite's coordinate convention.
 *
 * The renderer must have created its context with preserveDrawingBuffer: true
 * (or the read must happen in the same task as the draw) for the contents to
 * still be there.
 *
 * @param {HTMLCanvasElement} target
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function readWebGLPixels(target) {
  const gl = target.getContext('webgl2');
  if (!gl) {
    throw new Error(
      'readWebGLPixels: target has no WebGL2 context. Either the renderer did not ' +
      'create one, or this browser has WebGL2 disabled (see vitest.browser.config.js flags).'
    );
  }

  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const raw = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);

  const data = new Uint8ClampedArray(raw.length);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    data.set(raw.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
  }
  return { width, height, data };
}

export { createCanvasElement, hasDOM };
