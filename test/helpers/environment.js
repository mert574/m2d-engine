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
  const mod = await import('canvas');
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
 * A WebGL harness supplies its own equivalent built on gl.readPixels.
 * @param {HTMLCanvasElement} target
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function readCanvas2DPixels(target) {
  const ctx = target.getContext('2d');
  const image = ctx.getImageData(0, 0, target.width, target.height);
  return { width: image.width, height: image.height, data: image.data };
}

export { createCanvasElement, hasDOM };
