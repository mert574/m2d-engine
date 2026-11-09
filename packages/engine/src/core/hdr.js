/**
 * Radiance `.hdr` images, decoded to half floats.
 *
 * An HDR environment is an equirectangular panorama whose pixels carry
 * real radiance — a sky a hundred times brighter than the ground it
 * lights — which an 8-bit image cannot hold. Radiance's RGBE packs each
 * pixel as three mantissas and one shared exponent, so a file is a
 * quarter the size of float RGB and loses little.
 *
 * The output is `rgba16float` ready: half floats are what the renderer
 * samples, they filter without an extra device feature (unlike
 * `rgba32float`), and they halve the upload. The format's ceiling is
 * 65504, so values are clamped to the same 16384 the renderer clamps
 * its own HDR targets to — one infinity in an environment map would
 * spread through the prefiltered mips exactly as the yard's glints did.
 *
 * Only what the format actually ships is read: `32-bit_rle_rgbe`, both
 * flat and new-style adaptive RLE scanlines, with `-Y height +X width`
 * orientation. Anything else fails by name rather than decoding wrongly.
 */

/** The renderer's HDR ceiling; see `clampHDR` in the shaders. */
const MAX_RADIANCE = 16384;

/**
 * Float32 to IEEE half, as the bits of a Uint16. Subnormals round to
 * zero, which for radiance is the difference between nothing and
 * nothing.
 * @param {number} value
 * @returns {number}
 */
export function toHalf(value) {
  if (!Number.isFinite(value)) return value > 0 ? 0x7bff : (value < 0 ? 0xfbff : 0);
  const sign = value < 0 ? 0x8000 : 0;
  const v = Math.min(Math.abs(value), 65504);
  if (v < 6.103515625e-5) return sign;
  const exponent = Math.floor(Math.log2(v));
  const e = Math.min(Math.max(exponent, -14), 15);
  const mantissa = Math.round((v / Math.pow(2, e) - 1) * 1024);
  // Rounding the mantissa to 1024 is the next exponent up.
  if (mantissa >= 1024) return sign | ((e + 1 + 15) << 10);
  return sign | ((e + 15) << 10) | mantissa;
}

/**
 * Decode a Radiance `.hdr`.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {string} [name='environment'] - For error messages
 * @returns {{width: number, height: number, data: Uint16Array}} RGBA half floats, top row first
 */
export function parseHDR(buffer, name = 'environment') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let at = 0;
  const line = () => {
    const start = at;
    while (at < bytes.length && bytes[at] !== 0x0a) at++;
    const text = String.fromCharCode(...bytes.subarray(start, at));
    at++;
    return text;
  };

  const magic = line();
  if (!magic.startsWith('#?')) throw new Error(`M2D: ${name} is not a Radiance .hdr`);
  let format = null;
  let exposure = 1;
  for (;;) {
    if (at >= bytes.length) throw new Error(`M2D: ${name} ended inside its header`);
    const text = line();
    if (text === '') break;
    if (text.startsWith('FORMAT=')) format = text.slice(7).trim();
    else if (text.startsWith('EXPOSURE=')) exposure *= parseFloat(text.slice(9)) || 1;
  }
  if (format && format !== '32-bit_rle_rgbe') {
    throw new Error(`M2D: ${name} is ${format}; only 32-bit_rle_rgbe is read`);
  }

  const resolution = line().trim();
  const match = /^-Y\s+(\d+)\s+\+X\s+(\d+)$/.exec(resolution);
  if (!match) {
    throw new Error(`M2D: ${name} has resolution '${resolution}'; only '-Y height +X width' is read`);
  }
  const height = Number(match[1]);
  const width = Number(match[2]);
  if (!width || !height) throw new Error(`M2D: ${name} is ${width}x${height}`);

  const data = new Uint16Array(width * height * 4);
  const scanline = new Uint8Array(width * 4);
  const scale = exposure === 1 ? 1 : 1 / exposure;

  for (let y = 0; y < height; y++) {
    readScanline(bytes, scanline, width, name, () => at, (next) => { at = next; });
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const e = scanline[width * 3 + x];
      // RGBE: zero exponent is a black pixel, not a tiny one. The half
      // mantissa is Radiance's own `colr_color`: a byte names a bucket
      // and the value is its centre, not its floor, which would read
      // every pixel about 0.4% dark.
      const f = e ? Math.pow(2, e - 136) * scale : 0;
      const o = row + x * 4;
      data[o] = toHalf(Math.min((scanline[x] + 0.5) * f, MAX_RADIANCE));
      data[o + 1] = toHalf(Math.min((scanline[width + x] + 0.5) * f, MAX_RADIANCE));
      data[o + 2] = toHalf(Math.min((scanline[width * 2 + x] + 0.5) * f, MAX_RADIANCE));
      data[o + 3] = toHalf(1);
    }
  }
  return { width, height, data };
}

/**
 * One scanline into `out`, planar: all reds, then greens, blues and
 * exponents. New-style RLE says so in its first four bytes; anything
 * else is read flat, interleaved, and transposed into the same planes.
 */
function readScanline(bytes, out, width, name, get, set) {
  let at = get();
  const adaptive = width >= 8 && width < 32768
    && bytes[at] === 2 && bytes[at + 1] === 2
    && ((bytes[at + 2] << 8) | bytes[at + 3]) === width;
  if (!adaptive) {
    // Flat RGBE, four bytes a pixel, possibly with old-style runs.
    let x = 0;
    let shift = 0;
    while (x < width) {
      if (at + 4 > bytes.length) throw new Error(`M2D: ${name} ended inside a scanline`);
      const r = bytes[at], g = bytes[at + 1], b = bytes[at + 2], e = bytes[at + 3];
      at += 4;
      if (r === 1 && g === 1 && b === 1) {
        // An old-style run repeats the pixel before it, e << shift times.
        const count = e << shift;
        if (x === 0) throw new Error(`M2D: ${name} opens a scanline with a run`);
        for (let i = 0; i < count && x < width; i++, x++) {
          out[x] = out[x - 1];
          out[width + x] = out[width + x - 1];
          out[width * 2 + x] = out[width * 2 + x - 1];
          out[width * 3 + x] = out[width * 3 + x - 1];
        }
        shift += 8;
        continue;
      }
      shift = 0;
      out[x] = r; out[width + x] = g; out[width * 2 + x] = b; out[width * 3 + x] = e;
      x++;
    }
    set(at);
    return;
  }

  at += 4;
  for (let channel = 0; channel < 4; channel++) {
    const base = channel * width;
    let x = 0;
    while (x < width) {
      if (at >= bytes.length) throw new Error(`M2D: ${name} ended inside a scanline`);
      let count = bytes[at++];
      if (count > 128) {
        // A run: one value repeated.
        count -= 128;
        if (at >= bytes.length) throw new Error(`M2D: ${name} ended inside a run`);
        const value = bytes[at++];
        if (x + count > width) throw new Error(`M2D: ${name} has a run past the end of a scanline`);
        for (let i = 0; i < count; i++) out[base + x++] = value;
      } else {
        if (!count) throw new Error(`M2D: ${name} has a zero-length run`);
        if (x + count > width || at + count > bytes.length) {
          throw new Error(`M2D: ${name} has a literal past the end of a scanline`);
        }
        for (let i = 0; i < count; i++) out[base + x++] = bytes[at++];
      }
    }
  }
  set(at);
}

/**
 * Fetch and decode a `.hdr` by URL.
 * @param {string} url
 * @returns {Promise<{width: number, height: number, data: Uint16Array}>}
 */
export async function loadHDR(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`M2D: could not fetch environment ${url} (${response.status})`);
  return parseHDR(await response.arrayBuffer(), url);
}
