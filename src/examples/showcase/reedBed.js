import { makeRng, range } from './rng.js';

/**
 * A bed of reeds swaying along the waterline.
 *
 * Where MoteField stresses raw sprite count, this layer stresses per-sprite
 * *rotation*: every reed has its own angle every frame, so nothing can be
 * hoisted into a shared transform. Reeds pivot at their base rather than
 * their centre, which is done with arithmetic instead of a transform push —
 * a push per reed would fragment the batch and defeat the measurement.
 *
 * It is also the per-sprite `tint` layer. Reeds further up the bank are
 * tinted toward the cold night air, which is a depth cue that no amount of
 * alpha gives you. Tint is worth showing here precisely because it is *free*
 * on a batching backend — it folds into the vertex colour rather than the
 * batch key, so 2,000 differently-tinted reeds are still one draw call, where
 * Canvas would need an offscreen pass each and declines the feature outright.
 * The tints are quantised to a small palette so the colour parser's cache
 * keeps hitting instead of churning a new string per reed.
 */

/** Depth tints, nearest first. Quantised so the strings repeat. */
const DEPTH_TINTS = [
  '#ffffff', '#eef6ff', '#dceaff', '#c9dcf8',
  '#b4ccef', '#9fbce6', '#8aacdd', '#789dd4'
];
export class ReedBed {
  /**
   * @param {Object} options - Bed options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Reed SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.waterline - World Y the reeds stand on
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=4242] - RNG seed
   */
  constructor({ renderer, sheet, bounds, waterline, features, seed = 4242 }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.waterline = waterline;
    this.features = features;
    this.seed = seed;
    this.tileCount = Math.max(1, Math.floor(sheet.image.width / sheet.tileW));
    this.reeds = [];
    this.time = 0;
    this.count = 0;
  }

  /**
   * @param {number} count - Desired reed count
   */
  setCount(count) {
    const target = Math.max(0, Math.floor(count));
    const rng = makeRng(this.seed);

    this.reeds = [];
    for (let i = 0; i < target; i++) {
      const height = range(rng, 30, 96);
      // One draw decides where up the bank the reed stands, and that single
      // number drives both its position and its depth tint, so the cues agree.
      const bankOffset = range(rng, -34, 96);
      const farness = (bankOffset + 34) / 130;
      this.reeds.push({
        x: range(rng, -40, this.bounds.width + 40),
        // Reeds further up the bank are drawn smaller and dimmer, which fakes
        // depth without needing a second sheet.
        baseY: this.waterline - bankOffset,
        height,
        width: height * 0.45,
        phase: range(rng, 0, Math.PI * 2),
        speed: range(rng, 0.6, 1.5),
        amplitude: range(rng, 0.05, 0.22),
        alpha: range(rng, 0.45, 1),
        tint: DEPTH_TINTS[Math.min(DEPTH_TINTS.length - 1, Math.floor(farness * DEPTH_TINTS.length))],
        tile: Math.floor(range(rng, 0, this.tileCount))
      });
    }

    // Painter's order: far reeds first so near ones overlap them.
    this.reeds.sort((a, b) => a.baseY - b.baseY);
    this.count = this.reeds.length;
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }

  draw() {
    const image = this.sheet.image;
    const tileWidth = this.sheet.tileW;
    const tileHeight = this.sheet.tileH;
    const tinted = this.features.tint;

    for (const reed of this.reeds) {
      const angle = Math.sin(this.time * reed.speed + reed.phase) * reed.amplitude;
      const half = reed.height / 2;

      // drawSprite rotates about the sprite centre. Placing the centre at
      // base + R(angle) * (0, -half) makes the reed pivot at its base.
      this.renderer.drawSprite({
        image,
        x: reed.x + Math.sin(angle) * half,
        y: reed.baseY - Math.cos(angle) * half,
        tileX: reed.tile,
        tileY: 0,
        tileWidth,
        tileHeight,
        width: reed.width,
        height: reed.height,
        rotation: angle,
        globalAlpha: reed.alpha,
        tint: tinted ? reed.tint : undefined
      });
    }
  }
}
