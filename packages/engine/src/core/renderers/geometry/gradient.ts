import { parseColor, type Rgba } from './color.ts';

export const GRADIENT_LUT_SIZE = 256;

/** One stop of a gradient, as the scene format and the draw options give it. */
export interface GradientStop {
  offset: number;
  color: string;
}

/**
 * Bake gradient stops into a premultiplied RGBA lookup row of
 * GRADIENT_LUT_SIZE texels, interpolating in straight-alpha space the way
 * Canvas 2D does and premultiplying the result for the GPU.
 */
export function bakeGradient(stops: readonly GradientStop[] | null | undefined): Uint8Array {
  const parsed: ParsedStop[] = (stops || [])
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
export function gradientKey(style: { stops?: readonly GradientStop[] }): string {
  return (style.stops || []).map(s => `${s.offset}:${s.color}`).join('|');
}

type ParsedStop = { offset: number; color: Rgba };

function sample(stops: ParsedStop[], t: number): Rgba {
  // `bakeGradient` never calls this with an empty list: it pushes a
  // transparent stop first.
  const first = stops[0]!;
  if (t <= first.offset) return first.color;
  const last = stops[stops.length - 1]!;
  if (t >= last.offset) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!, b = stops[i + 1]!;
    if (t >= a.offset && t <= b.offset) {
      const span = b.offset - a.offset;
      const f = span <= 0 ? 0 : (t - a.offset) / span;
      const mix = (k: 0 | 1 | 2 | 3) => a.color[k] + (b.color[k] - a.color[k]) * f;
      return [mix(0), mix(1), mix(2), mix(3)];
    }
  }
  return last.color;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number(v) || 0));
}
