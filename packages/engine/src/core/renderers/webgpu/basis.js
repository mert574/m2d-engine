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
/** transcoder_texture_format values (basis_universal). */
const TRANSCODE_FORMAT = { etc2: 1, bc7: 6, astc: 10, rgba8: 13 };

/** @type {Promise<object>|null} */
let pending = null;

/**
 * Compile and initialize the transcoder wasm, once per page. The vendored
 * script is imported here, not at the top, so nothing loads it — its UMD
 * footer included — until a KTX2 texture actually appears.
 */
export function initBasis() {
  pending ??= import('./basis/basis_transcoder.js').then(({ default: BASIS }) => BASIS({
    locateFile: (file) => new URL(`./basis/${file}`, import.meta.url).href
  })).then((module) => {
    module.initializeBasis();
    return module;
  });
  return pending;
}

/**
 * The best transcode target the device supports, by quality.
 * @param {GPUDevice} device
 * @returns {'astc'|'bc7'|'etc2'|'rgba8'}
 */
export function bestTranscodeTarget(device) {
  if (device.features.has('texture-compression-astc')) return 'astc';
  if (device.features.has('texture-compression-bc')) return 'bc7';
  if (device.features.has('texture-compression-etc2')) return 'etc2';
  return 'rgba8';
}

/**
 * Transcode a KTX2 file to `target`, every mip level it carries.
 *
 * The returned record is what `TextureCache3D.get` uploads: the base
 * format name (the sRGB-or-not choice stays with the material slot, as
 * it is for image textures), the dimensions, and one byte array per mip.
 *
 * @param {object} basis - The module from `initBasis()`
 * @param {Uint8Array} bytes - A .ktx2 file
 * @param {'astc'|'bc7'|'etc2'|'rgba8'} target
 * @param {string} [name] - For error messages
 * @returns {{compressed: true, base: string, width: number, height: number, mips: Uint8Array[]}}
 */
export function transcodeKTX2(basis, bytes, target, name = 'texture') {
  const file = new basis.KTX2File(bytes);
  try {
    if (!file.isValid()) throw new Error(`M2D: ${name} is not a valid KTX2 file`);
    const width = file.getWidth();
    const height = file.getHeight();
    const levels = file.getLevels();
    const format = TRANSCODE_FORMAT[target];
    if (!file.startTranscoding()) throw new Error(`M2D: ${name}: KTX2 transcoding failed to start`);
    const mips = [];
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
