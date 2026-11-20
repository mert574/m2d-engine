import { createTexture, setTextureFiltering } from './device.ts';
import type { TextureSource } from '../baseRenderer.ts';

/** An uploaded texture and the size it was uploaded at. */
export interface TextureEntry {
  texture: WebGLTexture;
  width: number;
  height: number;
}

/** What an image source reports its size as, whichever kind it is. */
type SizedSource = { naturalWidth?: number; videoWidth?: number; width?: number };

/**
 * Maps image sources (HTMLImageElement, HTMLCanvasElement, ImageBitmap, ...)
 * to GPU textures. Keyed weakly so dropping the image frees the entry.
 */
export class TextureCache {
  gl: WebGL2RenderingContext;
  smooth: boolean;
  entries: WeakMap<object, TextureEntry>;
  /** Strong list so destroy() can release what was uploaded. */
  textures: Set<WebGLTexture>;

  /** @param smooth - Linear (true) or nearest filtering. */
  constructor(gl: WebGL2RenderingContext, smooth: boolean) {
    this.gl = gl;
    this.smooth = smooth;
    this.entries = new WeakMap();
    this.textures = new Set();
  }

  /**
   * Get (uploading on first use) the texture for an image source. Null when
   * the source has no pixels yet (e.g. an image still loading).
   */
  get(source: TextureSource): TextureEntry | null {
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

  setSmoothing(smooth: boolean): void {
    if (this.smooth === smooth) return;
    this.smooth = smooth;
    const gl = this.gl;
    for (const texture of this.textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      setTextureFiltering(gl, smooth);
    }
  }

  destroy(): void {
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.textures.clear();
    this.entries = new WeakMap();
  }
}

// Each kind of source names its size differently, and only some of the
// union's members carry each name.
function sourceWidth(source: TextureSource): number {
  const sized = source as SizedSource;
  return sized.naturalWidth || sized.videoWidth || sized.width || 0;
}

function sourceHeight(source: TextureSource): number {
  const sized = source as { naturalHeight?: number; videoHeight?: number; height?: number };
  return sized.naturalHeight || sized.videoHeight || sized.height || 0;
}
