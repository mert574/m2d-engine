import { makeRng, range } from './rng.js';

/**
 * A storm of floating damage numbers.
 *
 * Text is the layer where the two backends differ most in *kind*. The WebGL
 * backend rasterises each distinct string once into a cached label texture and
 * then draws it as a textured quad; the Canvas backend re-runs the browser's
 * text shaper on every call. Labels are therefore drawn from a small fixed
 * vocabulary — exactly the pattern a real game produces, and the one the cache
 * is built for.
 */
const VOCABULARY = [
  '12', '27', '41', '68', '94', '115', '203', '377',
  'CRIT!', 'MISS', 'BLOCK', 'PARRY', '+5 HP', 'COMBO x3'
];

const COLORS = ['#ffe082', '#ff8a65', '#80deea', '#c5e1a5', '#f48fb1', '#ffffff'];

export class LabelStorm {
  /**
   * @param {Object} options - Storm options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} [options.seed=909] - RNG seed
   */
  constructor({ renderer, bounds, seed = 909 }) {
    this.renderer = renderer;
    this.bounds = bounds;
    this.seed = seed;
    this.labels = [];
    this.count = 0;
  }

  /**
   * @param {number} count - Desired label count
   */
  setCount(count) {
    const target = Math.max(0, Math.floor(count));
    const rng = makeRng(this.seed);

    this.labels = [];
    for (let i = 0; i < target; i++) {
      this.labels.push({
        x: range(rng, 0, this.bounds.width),
        y: range(rng, 0, this.bounds.height),
        rise: range(rng, 18, 54),
        life: range(rng, 0, 1),
        decay: range(rng, 0.18, 0.5),
        fontSize: Math.round(range(rng, 13, 24)),
        text: VOCABULARY[Math.floor(range(rng, 0, VOCABULARY.length))],
        color: COLORS[Math.floor(range(rng, 0, COLORS.length))]
      });
    }

    this.count = this.labels.length;
    this.rng = rng;
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    const rng = this.rng;
    if (!rng) return;

    for (const label of this.labels) {
      label.y -= label.rise * deltaTime;
      label.life -= label.decay * deltaTime;

      if (label.life <= 0) {
        // Respawn in place rather than allocating: the workload stays flat.
        label.life = 1;
        label.x = range(rng, 0, this.bounds.width);
        label.y = range(rng, 0, this.bounds.height);
        label.text = VOCABULARY[Math.floor(range(rng, 0, VOCABULARY.length))];
        label.color = COLORS[Math.floor(range(rng, 0, COLORS.length))];
      }
    }
  }

  draw() {
    for (const label of this.labels) {
      this.renderer.drawText({
        text: label.text,
        x: label.x,
        y: label.y,
        fillStyle: label.color,
        strokeStyle: 'rgba(0, 0, 0, 0.85)',
        lineWidth: 3,
        fontSize: `${label.fontSize}px`,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: Math.min(1, label.life)
      });
    }
  }
}
