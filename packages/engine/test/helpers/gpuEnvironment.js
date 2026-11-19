/**
 * The browser the `gpu` project stands in for: a canvas element whose
 * `'2d'` context is Skia (`@napi-rs/canvas`), whose `'webgl2'` context is
 * ANGLE (`@onirenaud/node-webgl`) and whose `'webgpu'` context is Dawn
 * (`webgpu`), plus the image, fetch and frame APIs the renderers reach for.
 *
 * Installed as a setup file, before any test module loads, so the engine
 * and `environment.js` see a document and take their browser paths.
 *
 * The GPU is the machine's: a real one when there is one, Mesa's lavapipe
 * (Vulkan, for Dawn) and llvmpipe (OpenGL, for ANGLE) on a machine without.
 * `M2D_DAWN_ADAPTER` names Dawn's adapter (an unknown name lists them) and
 * `NODE_WEBGL_BACKEND` picks ANGLE's backend.
 *
 * Every stand-in here is checked against the real thing: the browser
 * project runs the same `test/gpu/**` files in Chromium.
 */
import { readFile } from 'node:fs/promises';
import { createCanvas as createSkiaCanvas, Canvas as SkiaCanvas, Image as SkiaImage, ImageData, loadImage } from '@napi-rs/canvas';
import { createCanvas as createAngleCanvas, WebGL2RenderingContext } from '@onirenaud/node-webgl';
import { create as createDawn, globals as gpuGlobals } from 'webgpu';

// Dawn's Vulkan loader opens a connection to any X server it is pointed
// at and prints an authorization error per adapter when it is refused.
// Nothing here draws to a display.
delete process.env.DISPLAY;
delete process.env.WAYLAND_DISPLAY;

Object.assign(globalThis, gpuGlobals);
const dawnFlags = process.env.M2D_DAWN_ADAPTER ? [`adapter=${process.env.M2D_DAWN_ADAPTER}`] : [];
Object.defineProperty(globalThis.navigator, 'gpu', { value: createDawn(dawnFlags), configurable: true });

/** A `GPUCanvasContext` over a texture the canvas's size, remade when the size changes. */
class GPUCanvasContext {
  #configuration = null;
  #texture = null;

  constructor(canvas) {
    this.canvas = canvas;
  }

  configure(configuration) {
    this.#configuration = configuration;
    this.#release();
  }

  unconfigure() {
    this.#configuration = null;
    this.#release();
  }

  getConfiguration() {
    return this.#configuration;
  }

  getCurrentTexture() {
    if (!this.#configuration) throw new Error('GPUCanvasContext: getCurrentTexture before configure');
    const { width, height } = this.canvas;
    if (this.#texture?.width !== width || this.#texture?.height !== height) {
      this.#release();
      const { device, format, usage = GPUTextureUsage.RENDER_ATTACHMENT } = this.#configuration;
      this.#texture = device.createTexture({ label: 'canvas', size: [width, height], format, usage });
    }
    return this.#texture;
  }

  #release() {
    this.#texture?.destroy();
    this.#texture = null;
  }
}

/** An element in the document tree, as far as the engine walks it. */
class Element {
  parentElement = null;
  previousElementSibling = null;
  nextElementSibling = null;
  isConnected = false;
  className = '';
  style = {};
  #attributes = new Map();
  #listeners = new Map();

  setAttribute(name, value) { this.#attributes.set(name, String(value)); }
  getAttribute(name) { return this.#attributes.get(name) ?? null; }

  addEventListener(type, listener) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const listener of this.#listeners.get(event.type) ?? []) listener.call(this, event);
    return true;
  }

  appendChild(child) {
    child.parentElement = this;
    child.isConnected = this.isConnected;
    return child;
  }

  insertAdjacentElement(position, element) {
    if (position !== 'afterend') throw new Error(`insertAdjacentElement: only 'afterend' is stood in for, not '${position}'`);
    element.parentElement = this.parentElement;
    element.isConnected = this.isConnected;
    element.previousElementSibling = this;
    element.nextElementSibling = this.nextElementSibling;
    if (this.nextElementSibling) this.nextElementSibling.previousElementSibling = element;
    this.nextElementSibling = element;
    return element;
  }

  remove() {
    if (this.previousElementSibling) this.previousElementSibling.nextElementSibling = this.nextElementSibling;
    if (this.nextElementSibling) this.nextElementSibling.previousElementSibling = this.previousElementSibling;
    this.parentElement = this.previousElementSibling = this.nextElementSibling = null;
    this.isConnected = false;
  }
}

/**
 * A canvas element. Like a browser's, it holds one kind of context: asking
 * for another kind returns null. Resizing reaches whichever surface it has.
 */
class HTMLCanvasElement extends Element {
  #width;
  #height;
  #kind = null;
  #surface = null;
  #context = null;

  constructor(width = 300, height = 150) {
    super();
    this.#width = width;
    this.#height = height;
  }

  get width() { return this.#width; }
  set width(value) { this.#width = value; this.#resizeSurface(); }
  get height() { return this.#height; }
  set height(value) { this.#height = value; this.#resizeSurface(); }
  get clientWidth() { return this.#width; }
  get clientHeight() { return this.#height; }

  getBoundingClientRect() {
    return { left: 0, top: 0, x: 0, y: 0, width: this.#width, height: this.#height, right: this.#width, bottom: this.#height };
  }

  getContext(kind, attributes) {
    if (this.#kind) return this.#kind === kind ? this.#context : null;
    if (kind === '2d') {
      this.#surface = createSkiaCanvas(this.#width, this.#height);
      this.#context = this.#surface.getContext('2d', attributes);
    } else if (kind === 'webgl2') {
      this.#surface = createAngleCanvas(this.#width, this.#height);
      this.#context = this.#surface.getContext('webgl2', attributes);
    } else if (kind === 'webgpu') {
      this.#context = new GPUCanvasContext(this);
    } else {
      return null;
    }
    if (!this.#context) return null;
    this.#kind = kind;
    return this.#context;
  }

  /** The Skia canvas behind a `'2d'` context, for reading its pixels back. */
  get skiaCanvas() {
    return this.#kind === '2d' ? this.#surface : null;
  }

  #resizeSurface() {
    if (!this.#surface) return;
    this.#surface.width = this.#width;
    this.#surface.height = this.#height;
  }
}

class OffscreenCanvas extends HTMLCanvasElement {}

/** Decoded pixels: straight RGBA, top-left origin, as a browser's bitmap reads back. */
class ImageBitmap {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data;
  }

  close() {
    this.data = null;
  }
}

/** Straight RGBA pixels of anything the browser accepts as an image source. */
function pixelsOf(source) {
  if (source instanceof ImageBitmap || source instanceof ImageData) return source;
  const skia = source instanceof HTMLCanvasElement ? source.skiaCanvas : source instanceof SkiaCanvas ? source : null;
  if (skia) return skia.getContext('2d').getImageData(0, 0, skia.width, skia.height);
  if (source instanceof SkiaImage) {
    const canvas = createSkiaCanvas(source.width, source.height);
    const context = canvas.getContext('2d');
    context.drawImage(source, 0, 0);
    return context.getImageData(0, 0, source.width, source.height);
  }
  throw new TypeError(`No pixels stand in for this image source: ${source?.constructor?.name ?? source}`);
}

async function createImageBitmap(source) {
  if (source instanceof Blob) source = await loadImage(Buffer.from(await source.arrayBuffer()));
  const { width, height, data } = pixelsOf(source);
  return new ImageBitmap(width, height, new Uint8ClampedArray(data));
}

function flipRows(data, width, height) {
  const row = width * 4;
  const flipped = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) flipped.set(data.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  return flipped;
}

function premultiply(data) {
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    out[i] *= a; out[i + 1] *= a; out[i + 2] *= a;
  }
  return out;
}

// Dawn's Node binding has no external images: the source's pixels go up
// through writeTexture, with the flips and premultiplication the copy
// would have applied.
GPUQueue.prototype.copyExternalImageToTexture = function (source, destination, size) {
  const [width, height] = Array.isArray(size) ? size : [size.width, size.height ?? 1];
  const pixels = pixelsOf(source.source);
  const x = source.origin?.x ?? source.origin?.[0] ?? 0;
  const y = source.origin?.y ?? source.origin?.[1] ?? 0;
  let data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * pixels.width + x) * 4;
    data.set(pixels.data.subarray(from, from + width * 4), row * width * 4);
  }
  if (source.flipY) data = flipRows(data, width, height);
  if (destination.premultipliedAlpha) data = premultiply(data);
  this.writeTexture(
    { texture: destination.texture, mipLevel: destination.mipLevel ?? 0, origin: destination.origin },
    data, { bytesPerRow: width * 4, rowsPerImage: height }, [width, height]
  );
};

// ANGLE uploads its own image types; the stand-ins above go up as pixels.
// The unpack flips and premultiplication still apply, as they do in a browser.
const isPixelArray = (value) => ArrayBuffer.isView(value) || value === null;
const texImage2D = WebGL2RenderingContext.prototype.texImage2D;
WebGL2RenderingContext.prototype.texImage2D = function (...args) {
  if (args.length !== 6 || isPixelArray(args[5])) return texImage2D.apply(this, args);
  const [target, level, internalFormat, format, type, source] = args;
  const { width, height, data } = pixelsOf(source);
  return texImage2D.call(this, target, level, internalFormat, width, height, 0, format, type, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
};
const texSubImage2D = WebGL2RenderingContext.prototype.texSubImage2D;
WebGL2RenderingContext.prototype.texSubImage2D = function (...args) {
  if (args.length !== 7 || isPixelArray(args[6])) return texSubImage2D.apply(this, args);
  const [target, level, x, y, format, type, source] = args;
  const { width, height, data } = pixelsOf(source);
  return texSubImage2D.call(this, target, level, x, y, width, height, format, type, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
};

// Skia draws its own canvases and images; an element or bitmap from here
// goes in as the Skia canvas behind it.
function skiaSourceOf(source) {
  if (source instanceof HTMLCanvasElement) {
    if (!source.skiaCanvas) throw new TypeError('Only a canvas with a 2d context can be drawn into another here');
    return source.skiaCanvas;
  }
  if (source instanceof ImageBitmap) {
    const canvas = createSkiaCanvas(source.width, source.height);
    canvas.getContext('2d').putImageData(new ImageData(source.data, source.width, source.height), 0, 0);
    return canvas;
  }
  return source;
}
const Context2D = Object.getPrototypeOf(createSkiaCanvas(1, 1).getContext('2d'));
const drawImage = Context2D.drawImage;
Context2D.drawImage = function (source, ...rest) {
  return drawImage.call(this, skiaSourceOf(source), ...rest);
};
const createPattern = Context2D.createPattern;
Context2D.createPattern = function (source, repetition) {
  return createPattern.call(this, skiaSourceOf(source), repetition);
};

/** `fetch` that reads `file:` URLs, as a page reads what its server serves. */
const networkFetch = globalThis.fetch;
async function fetch(input, init) {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
  if (!url.startsWith('file:')) return networkFetch(input, init);
  try {
    return new Response(await readFile(new URL(url)), { status: 200 });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }
}

const body = new Element();
body.isConnected = true;

const document = {
  body,
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`The gpu project stands in for canvases only, not <${tag}>. A test that needs the DOM belongs in test/browser`);
    return new HTMLCanvasElement();
  },
  addEventListener() {},
  removeEventListener() {}
};

Object.assign(globalThis, {
  document,
  HTMLCanvasElement,
  HTMLImageElement: SkiaImage,
  OffscreenCanvas,
  ImageBitmap,
  ImageData,
  createImageBitmap,
  fetch,
  requestAnimationFrame: (callback) => setTimeout(() => callback(performance.now()), 16),
  cancelAnimationFrame: (handle) => clearTimeout(handle)
});
