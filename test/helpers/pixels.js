import { expect } from 'vitest';

/**
 * Pixel inspection helpers for renderer tests.
 *
 * Comparisons are tolerance-based on purpose: different backends rasterize
 * antialiased edges differently, so assertions sample shape interiors and
 * allow small channel deviations rather than demanding exact equality.
 */

/**
 * Parse a CSS color into [r, g, b, a] with a in 0..255.
 * Supports #rgb, #rrggbb, #rrggbbaa, rgb(), and rgba().
 * @param {string|number[]} color
 * @returns {number[]}
 */
export function parseColor(color) {
  if (Array.isArray(color)) {
    return color.length === 3 ? [...color, 255] : [...color];
  }

  const value = color.trim();

  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map(c => c + c).join('');
    }
    const int = parseInt(hex, 16);
    if (hex.length === 8) {
      return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255];
    }
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255, 255];
  }

  const match = value.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1].split(',').map(p => parseFloat(p.trim()));
    return [parts[0], parts[1], parts[2], parts[3] === undefined ? 255 : Math.round(parts[3] * 255)];
  }

  throw new Error(`Unsupported color format in test assertion: ${color}`);
}

/**
 * Take a readable snapshot of a render target.
 * @param {{readPixels: Function}} harness - Renderer harness
 * @param {*} target - Render target
 */
export function snapshot(harness, target) {
  const { width, height, data } = harness.readPixels(target);

  return {
    width,
    height,
    data,

    /**
     * Read the RGBA value at a pixel.
     * @returns {number[]} [r, g, b, a]
     */
    at(x, y) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= width || py >= height) {
        throw new Error(`Sample (${px}, ${py}) is outside the ${width}x${height} target`);
      }
      const i = (py * width + px) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    },

    /**
     * Count pixels matching a predicate.
     * @param {(rgba: number[], x: number, y: number) => boolean} predicate
     */
    count(predicate) {
      let total = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (predicate([data[i], data[i + 1], data[i + 2], data[i + 3]], x, y)) total++;
        }
      }
      return total;
    },

    /**
     * Bounding box of pixels matching a predicate, or null if none match.
     * @param {(rgba: number[], x: number, y: number) => boolean} predicate
     */
    bounds(predicate) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (predicate([data[i], data[i + 1], data[i + 2], data[i + 3]], x, y)) {
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (!found) return null;
      return {
        minX, minY, maxX, maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
      };
    }
  };
}

/**
 * Assert the pixel at (x, y) matches an expected color within tolerance.
 * Alpha is only compared when the expectation specifies it.
 */
export function expectColorAt(snap, x, y, expected, { tolerance = 3, label = '' } = {}) {
  const actual = snap.at(x, y);
  const want = parseColor(expected);
  const compareAlpha = Array.isArray(expected) ? expected.length === 4 : want[3] !== 255;
  const channels = compareAlpha ? 4 : 3;

  for (let c = 0; c < channels; c++) {
    const delta = Math.abs(actual[c] - want[c]);
    if (delta > tolerance) {
      expect.fail(
        `${label || 'pixel'} at (${x}, ${y}): expected ~[${want.slice(0, channels)}], ` +
        `got [${actual.slice(0, channels)}] (channel ${c} off by ${delta}, tolerance ${tolerance})`
      );
    }
  }
}

/** Assert the pixel at (x, y) is NOT close to a color (i.e. nothing was drawn there). */
export function expectNotColorAt(snap, x, y, unexpected, { tolerance = 3, label = '' } = {}) {
  const actual = snap.at(x, y);
  const want = parseColor(unexpected);
  const close = [0, 1, 2].every(c => Math.abs(actual[c] - want[c]) <= tolerance);
  if (close) {
    expect.fail(
      `${label || 'pixel'} at (${x}, ${y}): expected NOT ~[${want.slice(0, 3)}], got [${actual.slice(0, 3)}]`
    );
  }
}

/** Assert the pixel at (x, y) is fully transparent. */
export function expectTransparentAt(snap, x, y, { label = '' } = {}) {
  const actual = snap.at(x, y);
  if (actual[3] !== 0) {
    expect.fail(`${label || 'pixel'} at (${x}, ${y}): expected transparent, got alpha ${actual[3]}`);
  }
}

/**
 * Build a predicate matching pixels that differ from a background color.
 * Used for ink/extent measurements where exact glyph shapes are irrelevant.
 */
export function differsFrom(background, tolerance = 12) {
  const bg = parseColor(background);
  return (rgba) => [0, 1, 2].some(c => Math.abs(rgba[c] - bg[c]) > tolerance);
}
