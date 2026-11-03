/**
 * Deterministic RNG for the examples' presentation layers.
 *
 * The generator itself is the engine's (`m2d-engine/core/rng.js`,
 * mulberry32). Simulation code draws from `game.rng`, which the engine
 * seeds and reseeds. These helpers are for the examples' backdrops and
 * decorative actors, which want their own fixed seeds: the showcase doubles
 * as the renderer comparison harness, so the same seed must lay out the
 * same scene on every backend and every run, and a menu backdrop should
 * look the same every time it opens.
 */
export { makeRng } from 'm2d-engine/core/rng.js';

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
