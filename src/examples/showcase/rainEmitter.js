import { makeRng, range } from './rng.js';
import { PARTICLE_STRIDE } from '../../core/renderers/baseRenderer.js';

/**
 * Rain over the harbour, submitted as one particle buffer.
 *
 * This is the `particles` layer. Every drop is eight floats in a single
 * Float32Array that goes to the backend in one `drawParticles` call. A
 * backend with the capability turns that into a handful of draw calls; one
 * without it falls back to a sprite per drop, so the emitter caps itself
 * there and says so in the HUD rather than crawling.
 *
 * Positions are pure functions of time, not integrated. A drop's fall is
 * `(time * speed + phase) mod span`, so two backends running at different
 * frame rates still show the identical sky at the same moment — which is
 * what makes the frame-time numbers comparable.
 */

/** Static per-drop parameters: spawnX, speed, phase, size, alpha. */
const PARAM_STRIDE = 5;

/** Drops a fallback backend is asked to draw as individual sprites. */
const FALLBACK_CAP = 800;

export class RainEmitter {
  /**
   * @param {Object} options - Emitter options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Rain streak SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.waterline - World Y the rain falls to
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=777] - RNG seed
   */
  constructor({ renderer, sheet, bounds, waterline, features, seed = 777 }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.waterline = waterline;
    this.features = features;
    this.seed = seed;
    this.time = 0;
    /** Wind as a horizontal drift per unit of fall. */
    this.wind = 0.18;
    this.slant = Math.atan(this.wind);
    this.data = new Float32Array(0);
    this.params = new Float32Array(0);
    this.count = 0;
    /** Count requested before the fallback cap, for the HUD. */
    this.requested = 0;
  }

  /** @returns {boolean} Whether this backend had to cap the drop count */
  capped() {
    return this.count < this.requested;
  }

  /**
   * @param {number} count - Desired drop count
   */
  setCount(count) {
    this.requested = Math.max(0, Math.floor(count));
    const target = this.features.particles ? this.requested : Math.min(this.requested, FALLBACK_CAP);
    const rng = makeRng(this.seed);

    this.params = new Float32Array(target * PARAM_STRIDE);
    this.data = new Float32Array(target * PARTICLE_STRIDE);

    for (let i = 0; i < target; i++) {
      const p = i * PARAM_STRIDE;
      // Nearer drops are bigger, faster and more opaque; one draw drives all
      // three so a drop never looks big-and-slow.
      const nearness = rng();
      this.params[p] = range(rng, -this.bounds.width * 0.1, this.bounds.width * 1.1);
      this.params[p + 1] = 520 + nearness * 780;
      this.params[p + 2] = rng();
      this.params[p + 3] = 10 + nearness * 22;
      this.params[p + 4] = 0.16 + nearness * 0.34;

      // Rotation and colour never change; write them once.
      const d = i * PARTICLE_STRIDE;
      this.data[d + 3] = this.slant;
      this.data[d + 4] = 0.78;
      this.data[d + 5] = 0.88;
      this.data[d + 6] = 1;
    }

    this.count = target;
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;

    const span = this.waterline + 40;
    const data = this.data;
    const params = this.params;
    const time = this.time;
    const wind = this.wind;

    for (let i = 0; i < this.count; i++) {
      const p = i * PARAM_STRIDE;
      const d = i * PARTICLE_STRIDE;
      const speed = params[p + 1];
      const fall = (time * speed + params[p + 2] * span) % span;

      data[d] = params[p] + fall * wind;
      data[d + 1] = fall - 20;
      data[d + 2] = params[p + 3];
      // Fade in over the first stretch so respawns do not pop at the top.
      data[d + 7] = params[p + 4] * Math.min(1, fall / 80);
    }
  }

  draw() {
    if (this.count === 0) return;

    this.renderer.drawParticles({
      image: this.sheet.image,
      tileX: 0,
      tileY: 0,
      tileWidth: this.sheet.tileW,
      tileHeight: this.sheet.tileH,
      data: this.data,
      count: this.count,
      blend: this.features.blendModes ? 'screen' : undefined
    });
  }
}
