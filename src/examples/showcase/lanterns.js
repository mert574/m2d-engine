import { makeRng, range } from './rng.js';

/**
 * Harbour lanterns, and the lighting layer.
 *
 * Each lantern is a sprite plus a `drawLight`, and the lighthouse lamp adds
 * one more that pulses with the beam's flare. On a backend with `lights` the
 * scene is genuinely dark and these carve it open; on one without, the layer
 * draws only the sprites and the world stays flat and evenly lit — which is
 * the clearest single difference between the two backends in the whole
 * showcase.
 *
 * Lights are submitted every frame like any other draw, so flicker is just a
 * per-lantern phase evaluated at draw time.
 *
 * Each lamp sits on top of a post planted in the bank. Without the post a
 * glowing rectangle hanging in mid-air reads as floating, however good the
 * lighting is — the light sells the mood, the post sells the ground.
 */
export class Lanterns {
  /**
   * @param {Object} options - Lantern options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Lantern SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.shoreY - World Y of the water/bank boundary
   * @param {import('./lighthouse.js').Lighthouse} options.lighthouse - Lamp to light
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=5150] - RNG seed
   */
  constructor({ renderer, sheet, bounds, shoreY, lighthouse, features, seed = 5150 }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.shoreY = shoreY;
    this.lighthouse = lighthouse;
    this.features = features;
    this.time = 0;

    const rng = makeRng(seed);
    const spacing = bounds.width / 9;

    /** Lanterns are fixed scenery, not part of the load sweep. */
    this.lanterns = [];
    for (let i = 0; i < 9; i++) {
      // Planted on the bank, below the shoreline, with the lamp a post's
      // height above its foot.
      const footY = shoreY + range(rng, 26, 120);
      const postHeight = range(rng, 90, 150);
      this.lanterns.push({
        x: spacing * (i + 0.5) + range(rng, -40, 40),
        footY,
        postHeight,
        y: footY - postHeight,
        size: range(rng, 42, 58),
        radius: range(rng, 240, 400),
        phase: range(rng, 0, Math.PI * 2),
        rate: range(rng, 1.4, 3.6),
        tile: rng() < 0.5 ? 0 : 1,
        color: rng() < 0.3 ? '#ffd27f' : '#ffbe66'
      });
    }

    this.count = this.lanterns.length;
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }

  /** Flicker multiplier for one lantern at the current time. */
  #flicker(lantern) {
    const wobble = Math.sin(this.time * lantern.rate + lantern.phase);
    const fast = Math.sin(this.time * lantern.rate * 2.7 + lantern.phase * 1.7);
    return 0.82 + 0.12 * wobble + 0.06 * fast;
  }

  drawSprites() {
    const image = this.sheet.image;
    const renderer = this.renderer;

    // Posts first, so every lamp is drawn over its own post.
    for (const lantern of this.lanterns) {
      renderer.drawRect({
        x: lantern.x - 3,
        y: lantern.y,
        width: 6,
        height: lantern.postHeight,
        fillStyle: '#2b2118'
      });
      // A wider foot where the post meets the mud.
      renderer.drawRect({
        x: lantern.x - 9,
        y: lantern.footY - 7,
        width: 18,
        height: 7,
        fillStyle: '#1d160f',
        cornerRadius: 2
      });
    }

    for (const lantern of this.lanterns) {
      renderer.drawSprite({
        image,
        x: lantern.x,
        y: lantern.y,
        tileX: lantern.tile,
        tileY: 0,
        tileWidth: this.sheet.tileW,
        tileHeight: this.sheet.tileH,
        width: lantern.size,
        height: lantern.size,
        globalAlpha: 0.75 + this.#flicker(lantern) * 0.25
      });
    }
  }

  /**
   * Submit this frame's lights. Separate from the sprites so the director can
   * keep lighting on while the lantern sprites are hidden, and so all the
   * lights land together regardless of draw order.
   */
  drawLights() {
    const renderer = this.renderer;

    for (const lantern of this.lanterns) {
      const flicker = this.#flicker(lantern);
      renderer.drawLight({
        x: lantern.x,
        y: lantern.y,
        radius: lantern.radius * (0.94 + flicker * 0.06),
        color: lantern.color,
        intensity: 0.75 * flicker
      });

      // A dimmer, wider pool so the bank between lanterns is not pitch black.
      renderer.drawLight({
        x: lantern.x,
        y: lantern.y + 40,
        radius: lantern.radius * 1.9,
        color: '#5f7196',
        intensity: 0.42
      });
    }

    // The lighthouse lamp itself, brightening as the beam swings toward us.
    const lamp = this.lighthouse;
    // Wide and gentle rather than bright and tight: a strong light centred on
    // the lamp sits on top of the tower sprite and burns it to flat white.
    const flare = Math.max(0, lamp.facing() - 0.7) / 0.3;
    renderer.drawLight({
      x: lamp.x,
      y: lamp.lampY,
      radius: 680,
      color: '#fff0c0',
      intensity: 0.5 + flare * 0.55
    });
  }
}
