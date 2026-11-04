import { makeRng, range } from '../shared/rng.js';

/**
 * Hollow Grove's menu: the tree line at dusk.
 *
 * Three ranks of silhouetted trees, each nearer rank darker and swaying a
 * little more, under a sky going from amber to night. Fireflies drift
 * between the ranks. The menu column sits on the left, so the trees
 * thicken toward the right where the eye is sent.
 */

const FIREFLIES = 26;

export class TreeLine {
  constructor(seed = 5) {
    const rng = makeRng(seed);
    this.ranks = [0.22, 0.5, 1].map((depth, rank) => ({
      depth,
      tone: ['rgba(44, 66, 48, 1)', 'rgba(22, 40, 28, 1)', 'rgba(8, 18, 12, 1)'][rank],
      sway: range(rng, 0, Math.PI * 2),
      trees: Array.from({ length: 9 + rank * 4 }, () => ({
        x: range(rng, 0.3, 1.08),
        height: range(rng, 0.28, 0.5) * (0.6 + depth * 0.5),
        width: range(rng, 0.05, 0.1) * (0.6 + depth * 0.5),
        lobes: 3 + Math.floor(rng() * 3),
        phase: range(rng, 0, Math.PI * 2)
      }))
    }));
    this.fireflies = Array.from({ length: FIREFLIES }, () => ({
      x: range(rng, 0.3, 1), y: range(rng, 0.35, 0.95),
      drift: range(rng, -0.01, 0.01), rise: range(rng, -0.008, 0.004),
      phase: range(rng, 0, Math.PI * 2), rate: range(rng, 0.8, 1.8)
    }));
  }

  update(deltaTime) {
    for (const fly of this.fireflies) {
      fly.x += fly.drift * deltaTime;
      fly.y += fly.rise * deltaTime;
      if (fly.x < 0.28) fly.x = 1.02;
      if (fly.x > 1.04) fly.x = 0.3;
      if (fly.y < 0.3) fly.y = 0.95;
    }
  }

  draw(paint, { width, height, elapsed }) {
    const horizon = height * 0.78;

    // A low moon.
    const mx = width * 0.74;
    const my = height * 0.3;
    paint.drawArc({
      x: mx, y: my, radius: height * 0.16,
      fillStyle: {
        type: 'radial', x: mx, y: my, r0: height * 0.05, r1: height * 0.16,
        stops: [{ offset: 0, color: 'rgba(255, 226, 180, 0.22)' }, { offset: 1, color: 'rgba(255, 226, 180, 0)' }]
      }
    });
    paint.drawArc({ x: mx, y: my, radius: height * 0.052, fillStyle: 'rgba(255, 236, 205, 0.9)' });

    for (const rank of this.ranks) {
      const ground = horizon + (rank.depth - 0.2) * height * 0.16;
      for (const tree of rank.trees) {
        const x = tree.x * width;
        const h = tree.height * height;
        const w = tree.width * width;
        const sway = Math.sin(elapsed * 0.35 + tree.phase + rank.sway) * rank.depth * 5;
        paint.drawRect({ x: x - w * 0.08 + sway * 0.3, y: ground - h * 0.55, width: w * 0.16, height: h * 0.6, fillStyle: rank.tone });
        for (let i = 0; i < tree.lobes; i++) {
          const t = i / Math.max(1, tree.lobes - 1);
          const r = w * (0.55 - t * 0.2);
          paint.drawArc({
            x: x + Math.sin(tree.phase + i * 2.1) * w * 0.22 + sway * (0.5 + t * 0.5),
            y: ground - h * (0.55 + t * 0.4),
            radius: r,
            fillStyle: rank.tone
          });
        }
      }
      paint.drawRect({ x: 0, y: ground, width, height: height - ground, fillStyle: rank.tone });
    }

    for (const fly of this.fireflies) {
      const glow = 0.35 + 0.65 * Math.max(0, Math.sin(elapsed * fly.rate + fly.phase));
      const x = fly.x * width;
      const y = fly.y * height + Math.sin(elapsed * 0.9 + fly.phase) * 4;
      paint.drawArc({
        x, y, radius: 9,
        fillStyle: {
          type: 'radial', x, y, r0: 0, r1: 9,
          stops: [{ offset: 0, color: `rgba(255, 220, 120, ${0.5 * glow})` }, { offset: 1, color: 'rgba(255, 220, 120, 0)' }]
        }
      });
      paint.drawArc({ x, y, radius: 1.6, fillStyle: `rgba(255, 240, 180, ${glow})` });
    }
  }
}

export const menuBackdrop = {
  gradient: { from: '#2a1a2e', to: '#0a1410', angle: 170 },
  layers: [new TreeLine()],
  motes: 0,
  vignette: 0.55
};
