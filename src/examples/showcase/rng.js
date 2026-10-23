/**
 * Deterministic RNG (mulberry32).
 *
 * The showcase doubles as the renderer comparison harness, so the same seed
 * must lay out the same scene on every backend and every run. Math.random()
 * would make frame-time summaries incomparable between backends.
 *
 * @param {number} seed - Seed value
 * @returns {() => number} Generator returning floats in [0, 1)
 */
export function makeRng(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random float in a range.
 * @param {() => number} rng - Generator from makeRng
 * @param {number} min - Lower bound (inclusive)
 * @param {number} max - Upper bound (exclusive)
 * @returns {number} Value in [min, max)
 */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}
