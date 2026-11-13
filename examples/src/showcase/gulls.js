import { makeRng, range } from '../shared/rng.js';

/**
 * A flock crossing the harbour: the showcase's animated sprite sheet and
 * its parallax, in one layer.
 *
 * Each gull plays the same six-frame wingbeat at its own phase and rate,
 * and sits in one of three bands of depth — the far ones small, pale and
 * slow, the near ones large and quick. Depth drives size, speed, tint and
 * how far the camera's travel moves them, which is what makes a flat
 * sheet read as distance.
 *
 * Seeded and stateless per gull beyond its own x, so the flock is the
 * same on every backend and at any frame rate.
 */

/** How the three bands differ: scale, speed, how much of the camera they feel. */
const BANDS = [
  { scale: 0.5, speed: 26, parallax: 0.25, alpha: 0.45 },
  { scale: 0.8, speed: 44, parallax: 0.55, alpha: 0.7 },
  { scale: 1.15, speed: 68, parallax: 0.85, alpha: 0.9 }
];

/** Frames in the sheet's one wingbeat. */
const FRAMES = 6;

export class Gulls {
  /**
   * @param {Object} options
   * @param {Object} options.renderer
   * @param {Object} options.sheet - The gull sheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.horizonY - They fly above this
   * @param {{tint: boolean}} options.features
   */
  constructor({ renderer, sheet, bounds, horizonY, features }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.horizonY = horizonY;
    this.features = features;
    this.time = 0;
    this.gulls = [];
    this.count = 0;
  }

  /**
   * Rebuild the flock at a new size. Seeded from the index, so growing the
   * flock keeps every gull that was already in it where it was.
   * @param {number} count
   */
  setCount(count) {
    const wanted = Math.max(0, Math.round(count));
    const rng = makeRng(0x9117);
    this.gulls = Array.from({ length: wanted }, (_, i) => {
      const band = BANDS[i % BANDS.length];
      return {
        band,
        x: range(rng, -200, this.bounds.width + 200),
        y: range(rng, 60, this.horizonY - 40),
        // Its own place in the wingbeat, and its own rate: a flock whose
        // wings all beat together looks like one bird copied.
        phase: range(rng, 0, 1),
        rate: range(rng, 1.6, 2.6),
        drift: range(rng, -6, 6)
      };
    });
    this.count = this.gulls.length;
  }

  /** @param {number} deltaTime - Seconds since the last frame */
  update(deltaTime) {
    this.time += deltaTime;
    const span = this.bounds.width + 400;
    for (const gull of this.gulls) {
      gull.x += gull.band.speed * deltaTime;
      if (gull.x > this.bounds.width + 200) gull.x -= span;
      gull.y += Math.sin(this.time * 0.4 + gull.phase * 7) * gull.drift * deltaTime;
    }
  }

  draw() {
    const image = this.sheet?.image;
    if (!image || !this.gulls.length) return;
    const tileWidth = image.width / FRAMES;
    const tileHeight = image.height;

    for (const gull of this.gulls) {
      const frame = Math.floor((this.time * gull.rate + gull.phase) * FRAMES) % FRAMES;
      this.renderer.drawSprite({
        image,
        x: gull.x,
        y: gull.y,
        tileX: frame,
        tileY: 0,
        tileWidth,
        tileHeight,
        width: tileWidth * gull.band.scale,
        height: tileHeight * gull.band.scale,
        // Haze takes the far birds; without tint they simply fade.
        globalAlpha: gull.band.alpha,
        ...(this.features.tint && { tint: '#cfe0ff', tintStrength: 1 - gull.band.parallax })
      });
    }
  }
}
