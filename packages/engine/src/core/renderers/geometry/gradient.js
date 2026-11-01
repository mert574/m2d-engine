import { parseColor } from './color.js';

export const GRADIENT_LUT_SIZE = 256;

/**
 * Bake gradient stops into a premultiplied RGBA lookup row of
 * GRADIENT_LUT_SIZE texels, interpolating in straight-alpha space the way
 * Canvas 2D does and premultiplying the result for the GPU.
 * @param {Array<{offset: number, color: string}>} stops
 * @returns {Uint8Array}
 */
export function bakeGradient(stops) {
  const parsed = (stops || [])
    .map(s => ({ offset: clamp01(s.offset), color: parseColor(s.color) }))
    .sort((a, b) => a.offset - b.offset);
  if (parsed.length === 0) parsed.push({ offset: 0, color: [0, 0, 0, 0] });

  const out = new Uint8Array(GRADIENT_LUT_SIZE * 4);
  for (let i = 0; i < GRADIENT_LUT_SIZE; i++) {
    const t = i / (GRADIENT_LUT_SIZE - 1);
    const [r, g, b, a] = sample(parsed, t);
    out[i * 4] = Math.round(r * a * 255);
    out[i * 4 + 1] = Math.round(g * a * 255);
    out[i * 4 + 2] = Math.round(b * a * 255);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** Stable cache key for a gradient descriptor's colour ramp. */
export function gradientKey(style) {
  return (style.stops || []).map(s => `${s.offset}:${s.color}`).join('|');
}

function sample(stops, t) {
  if (t <= stops[0].offset) return stops[0].color;
  const last = stops[stops.length - 1];
  if (t >= last.offset) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.offset && t <= b.offset) {
      const span = b.offset - a.offset;
      const f = span <= 0 ? 0 : (t - a.offset) / span;
      return a.color.map((c, k) => c + (b.color[k] - c) * f);
    }
  }
  return last.color;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0));
}
