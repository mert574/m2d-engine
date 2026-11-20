/**
 * KTX2 textures, transcoded to what the GPU has.
 *
 * The model compiler stores textures as KTX2 (Basis Universal: UASTC for
 * the maps that need fidelity, ETC1S for colour), one encode that every
 * GPU can use. At load the vendored Binomial transcoder (see `basis/`)
 * turns a file into the adapter's best block-compressed format — BC7 on
 * desktop, ASTC on mobile, ETC2 elsewhere — or plain RGBA8 when the
 * adapter compresses nothing. A 4k RGBA8 texture with mips is 85 MB of
 * GPU memory; BC7 is a quarter of that, and the file's own mip chain
 * means no generation pass.
 *
 * The wasm (~500 KB) is fetched and compiled once, lazily, on the first
 * KTX2 image seen, so a scene without models pays nothing.
 */
import type { BasisModule } from './basis/basis_transcoder.js';

export type { BasisModule } from './basis/basis_transcoder.js';

/** transcoder_texture_format values (basis_universal). */
const TRANSCODE_FORMAT = { etc2: 1, bc7: 6, astc: 10, rgba8: 13 } as const;

/** The block formats a KTX2 file can be transcoded to. */
export type TranscodeTarget = keyof typeof TRANSCODE_FORMAT;

let pending: Promise<BasisModule> | null = null;

/**
 * Compile and initialize the transcoder wasm, once per page. The vendored
 * script is imported here, not at the top, so nothing loads it until a
 * KTX2 texture actually appears.
 */
export function initBasis(): Promise<BasisModule> {
  pending ??= import('./basis/basis_transcoder.js').then(({ default: BASIS }) => BASIS({
    locateFile: (file) => new URL(`./basis/${file}`, import.meta.url).href
  })).then((module) => {
    module.initializeBasis();
    return module;
  });
  return pending;
}

/** The best transcode target the device supports, by quality. */
export function bestTranscodeTarget(device: GPUDevice): TranscodeTarget {
  if (device.features.has('texture-compression-astc')) return 'astc';
  if (device.features.has('texture-compression-bc')) return 'bc7';
  if (device.features.has('texture-compression-etc2')) return 'etc2';
  return 'rgba8';
}

/** What `TextureCache3D.get` uploads for a transcoded KTX2 file. */
export interface TranscodedTexture {
  compressed: true;
  /** The base format name; the sRGB-or-not choice stays with the material slot. */
  base: TranscodeTarget;
  width: number;
  height: number;
  /** One byte array per mip level the file carries. */
  mips: Uint8Array[];
}

/**
 * Transcode a KTX2 file to `target`, every mip level it carries.
 *
 * The returned record is what `TextureCache3D.get` uploads: the base
 * format name (the sRGB-or-not choice stays with the material slot, as
 * it is for image textures), the dimensions, and one byte array per mip.
 *
 * @param basis - The module from `initBasis()`
 * @param bytes - A .ktx2 file
 * @param name - For error messages
 */
export function transcodeKTX2(
  basis: BasisModule, bytes: Uint8Array, target: TranscodeTarget, name = 'texture'
): TranscodedTexture {
  const file = new basis.KTX2File(bytes);
  try {
    if (!file.isValid()) throw new Error(`M2D: ${name} is not a valid KTX2 file`);
    const width = file.getWidth();
    const height = file.getHeight();
    const levels = file.getLevels();
    const format = TRANSCODE_FORMAT[target];
    if (!file.startTranscoding()) throw new Error(`M2D: ${name}: KTX2 transcoding failed to start`);
    const mips: Uint8Array[] = [];
    for (let level = 0; level < levels; level++) {
      const size = file.getImageTranscodedSizeInBytes(level, 0, 0, format);
      const data = new Uint8Array(size);
      if (!file.transcodeImage(data, level, 0, 0, format, 0, -1, -1)) {
        throw new Error(`M2D: ${name}: KTX2 transcode failed at mip ${level}`);
      }
      mips.push(data);
    }
    return { compressed: true, base: target, width, height, mips };
  } finally {
    file.close();
    file.delete();
  }
}
