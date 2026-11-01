import { createTexture, setTextureFiltering } from './device.js';

/**
 * Maps image sources (HTMLImageElement, HTMLCanvasElement, ImageBitmap, ...)
 * to GPU textures. Keyed weakly so dropping the image frees the entry.
 */
export class TextureCache {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {boolean} smooth - Linear (true) or nearest filtering
   */
  constructor(gl, smooth) {
    this.gl = gl;
    this.smooth = smooth;
    /** @type {WeakMap<object, {texture: WebGLTexture, width: number, height: number}>} */
    this.entries = new WeakMap();
    /** Strong list so destroy() can release what was uploaded. */
    this.textures = new Set();
  }

  /**
   * Get (uploading on first use) the texture for an image source.
   * @returns {{texture: WebGLTexture, width: number, height: number}|null}
   *   null when the source has no pixels yet (e.g. an image still loading)
   */
  get(source) {
    let entry = this.entries.get(source);
    if (entry) return entry;

    const width = sourceWidth(source);
    const height = sourceHeight(source);
    if (!width || !height) return null;
    if (source instanceof HTMLImageElement && !source.complete) return null;

    const texture = createTexture(this.gl, { source, smooth: this.smooth });
    entry = { texture, width, height };
    this.entries.set(source, entry);
    this.textures.add(texture);
    return entry;
  }

  setSmoothing(smooth) {
    if (this.smooth === smooth) return;
    this.smooth = smooth;
    const gl = this.gl;
    for (const texture of this.textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      setTextureFiltering(gl, smooth);
    }
  }

  destroy() {
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.textures.clear();
    this.entries = new WeakMap();
  }
}

function sourceWidth(source) {
  return source.naturalWidth || source.videoWidth || source.width || 0;
}

function sourceHeight(source) {
  return source.naturalHeight || source.videoHeight || source.height || 0;
}
