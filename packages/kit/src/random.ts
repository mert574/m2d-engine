/**
 * Deterministic randomness for presentation: backdrops, scenery actors and
 * menus that want their own fixed seed. The generator is the engine's
 * (mulberry32, `m2d-engine/core/rng.js`); simulation code draws from
 * `game.rng`, which the engine seeds and reseeds, and never from here.
 */
export { makeRng } from 'm2d-engine/core/rng.js';

/** A generator `makeRng` made: a float in [0, 1) each call. */
export type Rng = () => number;

/**
 * A float in [min, max) from a generator `makeRng` made.
 * @param min - Inclusive
 * @param max - Exclusive
 */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
