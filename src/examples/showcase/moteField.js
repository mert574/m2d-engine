import { makeRng, range } from './rng.js';

/**
 * The drifting light in the harbour: fireflies over the reed bank, sea spray
 * above the water, and high mist in the sky.
 *
 * This is the batching layer — every mote comes from one 4-tile sheet, so a
 * batching backend collapses the whole field into a handful of draw calls
 * while a per-primitive backend issues one each. But a few thousand
 * identically-random dots read as noise, so a mote's zone decides what it is:
 * warm tiles bob and flicker near the bank, cool tiles drift fast and faint
 * over the water. Each mote wraps inside its own band rather than the whole
 * world, so the three zones stay legible instead of mixing over time.
 *
 * Light adds: fireflies and spray are drawn with the `additive` blend where
 * the backend has it, so overlapping motes brighten instead of painting over
 * each other. Mist stays `normal` — it is fog, and fog occludes. That split
 * is also why the field draws in two groups rather than one loop: blend mode
 * is part of the batch's paint state, so interleaving the two would flush the
 * batch thousands of times a frame. Grouping by paint state is the whole
 * discipline a batching backend asks of its caller.
 *
 * Nothing here is culled. The field submits every mote every frame so the
 * counters describe the same workload on both backends.
 */

/** Tile indices in mote.png: warm tiles first, then cool. See generateSprites. */
const WARM_TILES = [0, 1];
const COOL_TILES = [2, 3];

/** rng() calls consumed per mote; keeps incremental re-seeding in step. */
const MOTE_DRAWS = 11;

export class MoteField {
  /**
   * @param {Object} options - Field options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Mote SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds motes wrap within
   * @param {number} options.waterline - World Y dividing bank from water
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=1337] - RNG seed
   */
  constructor({ renderer, sheet, bounds, waterline, features, seed = 1337 }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.waterline = waterline;
    this.features = features;
    this.seed = seed;
    this.motes = [];
    /** Motes split by blend mode, so each group is one batch. */
    this.glowing = [];
    this.dim = [];
    this.count = 0;
    this.time = 0;
  }

  /**
   * Build one mote from eleven draws. Every branch consumes the same draws so
   * that a field of N is always the first N motes of the same sequence.
   * @param {() => number} rng - Seeded generator
   * @returns {Object} Mote
   */
  #makeMote(rng) {
    const x = range(rng, 0, this.bounds.width);
    const y = range(rng, 0, this.bounds.height);
    const drift = range(rng, -1, 1);
    const rise = rng();
    const sizePick = rng();
    const spin = range(rng, 0, Math.PI * 2);
    const spinRate = range(rng, -1.6, 1.6);
    const alphaPick = rng();
    const flickerPhase = range(rng, 0, Math.PI * 2);
    const flickerRate = range(rng, 1.5, 5);
    const tilePick = rng();

    const bankTop = this.waterline - 200;
    const bankBottom = this.waterline + 40;

    if (y >= bankTop && y <= bankBottom) {
      // Fireflies: slow, small, bright, and they pulse.
      return {
        x, y, spin, spinRate, flickerPhase, flickerRate,
        vx: drift * 14,
        vy: -6 - rise * 10,
        size: 6 + sizePick * 9,
        alpha: 0.55 + alphaPick * 0.45,
        flickers: true,
        glows: true,
        tile: WARM_TILES[tilePick < 0.5 ? 0 : 1],
        bandTop: bankTop,
        bandBottom: bankBottom
      };
    }

    if (y > bankBottom) {
      // Sea spray: faint, quick, skimming the water.
      return {
        x, y, spin, spinRate, flickerPhase, flickerRate,
        vx: drift * 26,
        vy: -4 - rise * 9,
        size: 4 + sizePick * 7,
        alpha: 0.1 + alphaPick * 0.18,
        flickers: false,
        glows: true,
        tile: COOL_TILES[tilePick < 0.5 ? 0 : 1],
        bandTop: bankBottom,
        bandBottom: this.bounds.height
      };
    }

    // High mist: large, very faint, mostly horizontal.
    return {
      x, y, spin, spinRate, flickerPhase, flickerRate,
      vx: drift * 20,
      vy: (rise - 0.5) * 4,
      size: 12 + sizePick * 18,
      alpha: 0.035 + alphaPick * 0.075,
      flickers: false,
      glows: false,
      tile: COOL_TILES[tilePick < 0.5 ? 0 : 1],
      bandTop: 0,
      bandBottom: bankTop
    };
  }

  /**
   * Grow or shrink the field. Growing appends motes generated from the same
   * seeded stream, so a field of N is always the first N motes of the same
   * sequence regardless of how it got there.
   * @param {number} count - Desired mote count
   */
  setCount(count) {
    const target = Math.max(0, Math.floor(count));

    if (target < this.motes.length) {
      this.motes.length = target;
      this.count = target;
      this.#regroup();
      return;
    }

    // Re-seed and skip the motes already built so appending stays deterministic.
    const rng = makeRng(this.seed);
    for (let i = 0; i < this.motes.length * MOTE_DRAWS; i++) rng();

    while (this.motes.length < target) {
      this.motes.push(this.#makeMote(rng));
    }

    this.count = this.motes.length;
    this.#regroup();
  }

  /**
   * Split the field by blend mode once, at build time. Doing it per frame
   * would cost more than the batching it protects.
   */
  #regroup() {
    this.glowing = this.motes.filter((mote) => mote.glows);
    this.dim = this.motes.filter((mote) => !mote.glows);
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    const width = this.bounds.width;
    this.time += deltaTime;

    for (const mote of this.motes) {
      mote.x += mote.vx * deltaTime;
      mote.y += mote.vy * deltaTime;
      mote.spin += mote.spinRate * deltaTime;

      // Wrap rather than bounce: wrapping is branch-cheap and keeps each
      // band's density uniform, so the workload does not drift over time.
      if (mote.x < 0) mote.x += width;
      else if (mote.x > width) mote.x -= width;

      const bandHeight = mote.bandBottom - mote.bandTop;
      if (mote.y < mote.bandTop) mote.y += bandHeight;
      else if (mote.y > mote.bandBottom) mote.y -= bandHeight;
    }
  }

  draw() {
    // Mist behind, then the glowing motes in front of it.
    this.#drawGroup(this.dim, undefined);
    this.#drawGroup(this.glowing, this.features.blendModes ? 'additive' : undefined);
  }

  /**
   * @param {Object[]} motes - One blend group
   * @param {string} [blend] - Blend mode for the whole group
   */
  #drawGroup(motes, blend) {
    const image = this.sheet.image;
    const tileWidth = this.sheet.tileW;
    const tileHeight = this.sheet.tileH;
    const time = this.time;

    for (const mote of motes) {
      const pulse = mote.flickers
        ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * mote.flickerRate + mote.flickerPhase))
        : 1;

      this.renderer.drawSprite({
        image,
        x: mote.x,
        y: mote.y,
        tileX: mote.tile,
        tileY: 0,
        tileWidth,
        tileHeight,
        width: mote.size,
        height: mote.size,
        rotation: mote.spin,
        globalAlpha: mote.alpha * pulse,
        blend
      });
    }
  }
}
