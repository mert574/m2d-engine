import { makeRng, range } from './rng.js';

/**
 * The harbour itself: sky, water and the near bank.
 *
 * Without this the scene had only a two-stop gradient behind it, so the reeds
 * and lanterns read as floating in space — there was no surface for anything
 * to stand on. Three bands fix that, and the boundaries between them are what
 * the rest of the scene is positioned against:
 *
 *   sky        top .. horizonY
 *   water      horizonY .. shoreY   (reeds stand in the shallow end of this)
 *   bank       shoreY .. bottom     (lanterns and the lighthouse stand here)
 *
 * The water carries drifting ripple dashes and a glitter path under the
 * lighthouse. Both are deterministic and animated purely from `time`, like
 * every other layer, so the two backends stay comparable.
 */
export class Backdrop {
  /**
   * @param {Object} options - Backdrop options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.horizonY - Sky/water boundary (the eye level)
   * @param {number} options.shoreY - Water/bank boundary
   * @param {number} options.glitterX - World X the glitter path sits under
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=2024] - RNG seed
   */
  constructor({ renderer, bounds, horizonY, shoreY, glitterX, features, seed = 2024 }) {
    this.renderer = renderer;
    this.bounds = bounds;
    this.horizonY = horizonY;
    this.shoreY = shoreY;
    this.glitterX = glitterX;
    this.features = features;
    this.time = 0;

    const rng = makeRng(seed);
    const span = shoreY - horizonY;

    // Ripples: nearer ones are longer, thicker and more separated, which is
    // the whole depth cue for a flat band of colour.
    this.ripples = [];
    for (let i = 0; i < 260; i++) {
      const depth = Math.sqrt(rng());
      this.ripples.push({
        x: range(rng, -60, bounds.width + 60),
        y: horizonY + depth * span,
        width: 14 + depth * 110,
        height: 1 + depth * 2.2,
        alpha: 0.12 + depth * 0.3,
        drift: range(rng, -9, 9) * (0.3 + depth),
        phase: range(rng, 0, Math.PI * 2),
        rate: range(rng, 0.4, 1.3)
      });
    }

    // Glitter: the lamp's reflection, a column of short dashes that widens
    // toward the viewer the way a real light path on water does.
    this.glitter = [];
    for (let i = 0; i < 90; i++) {
      const depth = rng();
      this.glitter.push({
        offset: range(rng, -1, 1) * (26 + depth * 150),
        y: horizonY + depth * span,
        width: 6 + depth * 34,
        height: 1 + depth * 2,
        alpha: (0.1 + depth * 0.3) * range(rng, 0.4, 1),
        phase: range(rng, 0, Math.PI * 2),
        rate: range(rng, 1.1, 2.8)
      });
    }
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }

  /**
   * Skyglow on the water.
   *
   * Under a night ambient the water has no headroom left: multiplying any
   * plausible sea colour by the ambient lands it on the same near-black as
   * the sky, and brightening the base colour enough to survive would make it
   * glow in daylight. Lighting it is the honest fix — open water at night is
   * lit, by the sky if nothing else — so the band carries a few broad, cool,
   * low-intensity lights of its own.
   */
  drawLights() {
    const renderer = this.renderer;
    const span = this.shoreY - this.horizonY;
    const midY = this.horizonY + span * 0.45;
    const count = 5;

    for (let i = 0; i < count; i++) {
      renderer.drawLight({
        x: (this.bounds.width / count) * (i + 0.5),
        y: midY,
        radius: this.bounds.width / count + span,
        color: '#8fb4e8',
        intensity: 0.5
      });
    }

    // The lamp's path on the water, brighter and warmer than the skyglow.
    renderer.drawLight({
      x: this.glitterX,
      y: this.horizonY + span * 0.6,
      radius: span * 1.5,
      color: '#ffd9a0',
      intensity: 0.5
    });
  }

  /**
   * Sky and open water. Drawn before the reeds, which stand in the shallows.
   */
  drawDistance() {
    this.#drawSky();
    this.#drawWater();
  }

  /**
   * The near bank. Drawn *after* the reeds on purpose: reeds stand further
   * out in the water, so the shore in front of them has to occlude their
   * feet. Painting it with the rest of the backdrop put the near ground
   * behind everything and left the reeds hanging in the water.
   */
  drawBank() {
    this.#drawBank();
  }

  #drawSky() {
    this.renderer.drawRect({
      x: 0,
      y: 0,
      width: this.bounds.width,
      height: this.horizonY,
      fillStyle: {
        type: 'linear',
        x0: 0,
        y0: 0,
        x1: 0,
        y1: this.horizonY,
        stops: [
          { offset: 0, color: '#05070f' },
          { offset: 0.65, color: '#0c1830' },
          { offset: 1, color: '#1b2d4e' }
        ]
      }
    });
  }

  #drawWater() {
    const renderer = this.renderer;
    const { width } = this.bounds;
    const span = this.shoreY - this.horizonY;
    const time = this.time;
    const blend = this.features.blendModes ? 'additive' : undefined;

    renderer.drawRect({
      x: 0,
      y: this.horizonY,
      width,
      height: span,
      fillStyle: {
        type: 'linear',
        x0: 0,
        y0: this.horizonY,
        x1: 0,
        y1: this.shoreY,
        stops: [
          { offset: 0, color: '#264875' },
          { offset: 0.45, color: '#1a3459' },
          { offset: 1, color: '#11223d' }
        ]
      }
    });

    // A bright seam right on the horizon reads as distance haze on the water
    // and stops the sky and sea merging into one flat field.
    renderer.drawRect({
      x: 0,
      y: this.horizonY - 1,
      width,
      height: 2,
      fillStyle: 'rgba(190, 220, 255, 0.34)'
    });

    for (const ripple of this.ripples) {
      const bob = Math.sin(time * ripple.rate + ripple.phase);
      let x = ripple.x + time * ripple.drift;
      // Wrap with a margin so a ripple never pops in at the screen edge.
      const wrapSpan = width + 120;
      x = ((x + 60) % wrapSpan + wrapSpan) % wrapSpan - 60;

      renderer.drawRect({
        x,
        y: ripple.y + bob * 1.5,
        width: ripple.width,
        height: ripple.height,
        fillStyle: 'rgba(170, 205, 245, 0.9)',
        globalAlpha: ripple.alpha * (0.65 + 0.35 * bob),
        cornerRadius: ripple.height
      });
    }

    for (const dash of this.glitter) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * dash.rate + dash.phase);
      renderer.drawRect({
        x: this.glitterX + dash.offset - dash.width / 2,
        y: dash.y,
        width: dash.width,
        height: dash.height,
        fillStyle: 'rgba(255, 228, 160, 0.95)',
        globalAlpha: dash.alpha * twinkle,
        blend,
        cornerRadius: dash.height
      });
    }
  }

  #drawBank() {
    const renderer = this.renderer;
    const { width, height } = this.bounds;

    renderer.drawRect({
      x: 0,
      y: this.shoreY,
      width,
      height: height - this.shoreY,
      fillStyle: {
        type: 'linear',
        x0: 0,
        y0: this.shoreY,
        x1: 0,
        y1: height,
        stops: [
          { offset: 0, color: '#243524' },
          { offset: 0.25, color: '#1a2619' },
          { offset: 1, color: '#0b1210' }
        ]
      }
    });

    // Wet edge where the water meets the mud, and a soft grass lip above it.
    renderer.drawRect({
      x: 0,
      y: this.shoreY - 3,
      width,
      height: 6,
      fillStyle: 'rgba(120, 150, 170, 0.33)'
    });
    renderer.drawRect({
      x: 0,
      y: this.shoreY + 3,
      width,
      height: 14,
      fillStyle: 'rgba(60, 92, 56, 0.45)'
    });
  }
}
