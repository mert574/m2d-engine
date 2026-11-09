import { describe, it, expect } from 'vitest';
import { parseHDR, toHalf } from '../src/core/hdr.js';

/**
 * Radiance `.hdr` decoding.
 *
 * The files are built here rather than committed, so the bytes a case
 * is about are visible in the case. Expected radiances come from
 * Radiance's own `colr_color`: a byte names a quantisation bucket and
 * the value is its centre, `(mantissa + 0.5) * 2^(exponent - 136)`.
 *
 * Checked out of band against three.js's RGBELoader on Poly Haven's
 * 1024x512 `kloofendal_43d_clear_puresky_1k.hdr`: 1.57M samples, mean
 * relative difference 1.6e-3, and the only samples past 2.5% are the
 * twelve on the sun disc that this decoder clamps on purpose.
 */

/** An IEEE half, as a Uint16, back to a number. */
function fromHalf(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exponent = (h >> 10) & 0x1f;
  const mantissa = h & 0x3ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

/** What Radiance says an RGBE byte means. */
const radiance = (mantissa, exponent) => (mantissa + 0.5) * Math.pow(2, exponent - 136);

const HEADER = (width, height, extra = '') =>
  `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n${extra}\n-Y ${height} +X ${width}\n`;

const bytesOf = (header, body) => {
  const head = new TextEncoder().encode(header);
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
};

/** Pixels as `[r, g, b, e]` bytes, written flat. */
function flatFile(width, height, pixels) {
  const body = new Uint8Array(width * height * 4);
  pixels.forEach((p, i) => body.set(p, i * 4));
  return bytesOf(HEADER(width, height), body);
}

/**
 * One adaptive-RLE scanline: the 2,2,hi,lo marker then four planes,
 * each encoded as `literals` (a count under 128) or `runs` (count+128).
 */
function adaptiveFile(width, planes) {
  const parts = [2, 2, (width >> 8) & 0xff, width & 0xff];
  for (const plane of planes) {
    for (const chunk of plane) {
      if (chunk.run) parts.push(128 + chunk.values.length, chunk.values[0]);
      else parts.push(chunk.values.length, ...chunk.values);
    }
  }
  return bytesOf(HEADER(width, 1), new Uint8Array(parts));
}

const pixel = (image, x, y) => {
  const o = (y * image.width + x) * 4;
  return [0, 1, 2, 3].map((c) => fromHalf(image.data[o + c]));
};

describe('half floats', () => {
  it('round-trips the values an environment is made of', () => {
    for (const v of [0, 0.5, 1, 0.25, 2, 1024, 16384, 0.001953125]) {
      expect(fromHalf(toHalf(v)), `${v}`).toBeCloseTo(v, 6);
    }
  });

  it('keeps a value inside the format rather than letting it overflow', () => {
    // 65504 is the ceiling; past it a half is an infinity, which is the
    // thing every HDR pass in the renderer is careful never to produce.
    expect(fromHalf(toHalf(1e9))).toBe(65504);
    expect(Number.isFinite(fromHalf(toHalf(Infinity)))).toBe(true);
  });

  it('flushes what a half cannot represent to zero, not to a wrong number', () => {
    expect(fromHalf(toHalf(1e-9))).toBe(0);
  });
});

describe('reading a .hdr', () => {
  it('decodes flat scanlines to the radiance Radiance means', () => {
    const image = parseHDR(flatFile(2, 2, [
      [128, 64, 32, 128], [255, 255, 255, 128],
      [0, 0, 0, 0], [10, 20, 30, 140]
    ]));
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    const [r, g, b, a] = pixel(image, 0, 0);
    expect(r).toBeCloseTo(radiance(128, 128), 5);
    expect(g).toBeCloseTo(radiance(64, 128), 5);
    expect(b).toBeCloseTo(radiance(32, 128), 5);
    expect(a).toBe(1);
    // A zero exponent is black, not a very small number.
    expect(pixel(image, 0, 1).slice(0, 3)).toEqual([0, 0, 0]);
    // A high exponent is a bright pixel, which is the point of the format.
    expect(pixel(image, 1, 1)[0]).toBeCloseTo(radiance(10, 140), 4);
    // Rows come back top first, as the -Y order writes them.
    expect(pixel(image, 1, 0)[0]).toBeCloseTo(radiance(255, 128), 4);
  });

  it('decodes adaptive RLE: runs and literals, per channel', () => {
    // Width 8. Red is a run of 8; green four literals then a run of 4;
    // blue and the exponent are runs, so every pixel shares them.
    const image = parseHDR(adaptiveFile(8, [
      [{ run: true, values: [200, 200, 200, 200, 200, 200, 200, 200] }],
      [{ values: [1, 2, 3, 4] }, { run: true, values: [9, 9, 9, 9] }],
      [{ run: true, values: Array(8).fill(50) }],
      [{ run: true, values: Array(8).fill(128) }]
    ]));
    expect(image.width).toBe(8);
    for (let x = 0; x < 8; x++) {
      expect(pixel(image, x, 0)[0], `red at ${x}`).toBeCloseTo(radiance(200, 128), 5);
      expect(pixel(image, x, 0)[2], `blue at ${x}`).toBeCloseTo(radiance(50, 128), 5);
    }
    expect(pixel(image, 0, 0)[1]).toBeCloseTo(radiance(1, 128), 5);
    expect(pixel(image, 3, 0)[1]).toBeCloseTo(radiance(4, 128), 5);
    expect(pixel(image, 4, 0)[1]).toBeCloseTo(radiance(9, 128), 5);
    expect(pixel(image, 7, 0)[1]).toBeCloseTo(radiance(9, 128), 5);
  });

  it('clamps to the ceiling the renderer clamps its own targets to', () => {
    // Exponent 160 is far past anything a float16 target can hold; an
    // infinity in an environment map spreads through every prefiltered
    // mip, which is the bug the renderer's own clamp exists for.
    const image = parseHDR(flatFile(1, 1, [[255, 255, 255, 180]]));
    expect(pixel(image, 0, 0)[0]).toBe(16384);
  });

  it('applies the header EXPOSURE, which divides out of the stored values', () => {
    const doubled = parseHDR(bytesOf(
      '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=2.0\n\n-Y 1 +X 1\n',
      new Uint8Array([128, 128, 128, 128])
    ));
    expect(pixel(doubled, 0, 0)[0]).toBeCloseTo(radiance(128, 128) / 2, 5);
  });

  it('refuses what it cannot read, by name', () => {
    expect(() => parseHDR(new Uint8Array([1, 2, 3]), 'junk')).toThrow(/junk is not a Radiance/);
    expect(() => parseHDR(bytesOf('#?RADIANCE\nFORMAT=32-bit_rle_xyze\n\n-Y 1 +X 1\n', new Uint8Array(4)), 'xyz'))
      .toThrow(/xyz is 32-bit_rle_xyze/);
    // +Y or -X is a legal Radiance orientation this does not handle, and
    // decoding it as if it were the usual one would silently flip the sky.
    expect(() => parseHDR(bytesOf('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+Y 1 +X 1\n', new Uint8Array(4)), 'flipped'))
      .toThrow(/flipped has resolution '\+Y 1 \+X 1'/);
  });

  it('refuses a truncated or malformed scanline instead of reading past it', () => {
    const short = bytesOf(HEADER(4, 1), new Uint8Array([128, 128, 128, 128, 1, 2]));
    expect(() => parseHDR(short, 'short')).toThrow(/short ended inside a scanline/);
    // An adaptive run claiming 100 pixels of an 8-pixel scanline.
    const over = bytesOf(HEADER(8, 1), new Uint8Array([2, 2, 0, 8, 128 + 100, 7]));
    expect(() => parseHDR(over, 'over')).toThrow(/over has a run past the end/);
    // And a literal claiming more than it has bytes for.
    const greedy = bytesOf(HEADER(8, 1), new Uint8Array([2, 2, 0, 8, 100, 7, 7]));
    expect(() => parseHDR(greedy, 'greedy')).toThrow(/greedy has a literal past the end/);
  });
});
