/**
 * Seeded random numbers, mounted as `game.rng`.
 *
 * `Math.random()` is the one source of non-determinism a fixed-step
 * simulation cannot remove on its own: two machines running identical
 * ticks on identical input still diverge the moment an enemy picks a
 * wander target from it. A seeded generator makes the sequence part of the
 * game's state — a level restarted with the same seed plays the same, a
 * replay reproduces, and a server can hand every client one seed.
 *
 * The generator is mulberry32: 32 bits of state, fast, and good enough for
 * gameplay. It is not for anything cryptographic.
 *
 * Simulation code (`fixedUpdate`, timers, collision handlers) draws from
 * `game.rng`. Presentation code is free to use `Math.random()` — a flame
 * flicker in `draw` affects nothing the simulation sees — but using the
 * same generator costs nothing and keeps one rule.
 */
export class Rng {
  /** The seed the current sequence started from. */
  seed!: number;
  state!: number;
  /** Draws since the last reseed. With `seed`, enough to resume a sequence. */
  draws!: number;

  constructor(seed = 1) {
    this.reseed(seed);
  }

  /**
   * Restart the sequence from a seed. The engine does this on every scene
   * load and `reset()`, so a restarted level plays the same.
   * `seed` is any finite number; only its low 32 bits matter.
   */
  reseed(seed: number): void {
    if (typeof seed !== 'number' || !Number.isFinite(seed)) {
      throw new Error(`M2D rng: seed needs a finite number, got ${seed}`);
    }
    this.seed = seed;
    this.state = seed >>> 0;
    this.draws = 0;
  }

  /** A float in [0, 1), like `Math.random()`. */
  next(): number {
    this.draws += 1;
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p`: 0 never, 1 always. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One element of an array, or `undefined` for an empty one. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }

  /** Shuffle an array in place (Fisher–Yates) and return it. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }

  /**
   * A derived generator that does not disturb this one's sequence, for a
   * subsystem (a particle layer, a procedural backdrop) that wants its own
   * stream. Deterministic: the same parent state gives the same child.
   */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}

/**
 * A bare generator function, the shape older code and the examples' shared
 * backdrops take: `const next = makeRng(seed); next() // [0, 1)`.
 */
export function makeRng(seed: number): () => number {
  const rng = new Rng(seed);
  return () => rng.next();
}
