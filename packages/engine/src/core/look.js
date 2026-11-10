import { parseColor } from './renderers/geometry/color.js';

/**
 * Blending two "look" blocks — `world.lighting`, `world.post`, as a scene
 * writes them — for a day and night cycle (`world.cycle`): numbers lerp,
 * CSS colours mix, vectors and nested blocks blend key by key, and
 * anything else switches halfway. Both blocks are the scene's own words,
 * so a state a cycle moves between is written the same way as the level's
 * resting look.
 */

const COLOUR = /^(#|rgb|hsl)/i;

export function blendLook(a, b, t) {
  if (a === b || t <= 0 || b === undefined) return a;
  if (t >= 1 || a === undefined) return b;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (typeof a === 'string' && typeof b === 'string' && COLOUR.test(a) && COLOUR.test(b)) {
    const [r1, g1, b1, a1 = 1] = parseColor(a);
    const [r2, g2, b2, a2 = 1] = parseColor(b);
    const mix = (x, y) => Math.round((x + (y - x) * t) * 255);
    const alpha = a1 + (a2 - a1) * t;
    return alpha >= 0.999 ? `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})` : `rgba(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)}, ${Math.round(alpha * 1000) / 1000})`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => blendLook(a[i], b[i], t));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = blendLook(a[key], b[key], t);
    return out;
  }
  return t < 0.5 ? a : b;
}

/**
 * A cycle's look at `phase`: the states blended pairwise, wrapping from
 * the last back to the first. Each state's `lighting` and `post` lie over
 * the level's resting ones, so a state names only what moves.
 */
export function cycleLook(cycle, phase, resting = {}) {
  const states = cycle?.states ?? [];
  if (!states.length) return { lighting: resting.lighting, post: resting.post };
  const n = states.length;
  const wrapped = ((phase % n) + n) % n;
  const i = Math.floor(wrapped);
  const t = wrapped - i;
  const from = states[i];
  const to = states[(i + 1) % n];
  const blend = (key) => {
    const a = { ...resting[key], ...from[key] };
    const b = { ...resting[key], ...to[key] };
    return blendLook(a, b, t);
  };
  return { lighting: blend('lighting'), post: blend('post') };
}

/**
 * Where a cycle's phase stands after `dt` seconds: turning at `period`
 * seconds per revolution when one is set, else easing toward `target` at
 * `ease` per second (an exponential approach, frame-rate independent).
 */
export function advanceCycle(state, dt) {
  const n = state.count;
  if (n < 2) return state.phase;
  if (state.period > 0) return (((state.phase + (dt * n) / state.period) % n) + n) % n;
  const ease = state.ease ?? 1.5;
  const k = 1 - Math.exp(-dt * ease);
  return state.phase + (state.target - state.phase) * k;
}
