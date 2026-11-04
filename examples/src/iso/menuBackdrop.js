import { makeRng, range } from '../shared/rng.js';

/**
 * Cinder Keep's menu: a torchlit vault seen from above, in the game's own
 * isometric projection. Diamonds of floor recede into the dark, a few
 * block silhouettes stand up out of them, and the torches breathe. The
 * menu column sits on the left, so the vault is built to the right.
 */
const RATIO = 0.5;

export class VaultPlan {
  constructor(seed = 9) {
    const rng = makeRng(seed);
    this.torches = Array.from({ length: 7 }, () => ({ i: Math.floor(range(rng, 0, 12)), j: Math.floor(range(rng, 0, 10)), phase: range(rng, 0, 6.28) }));
    this.blocks = Array.from({ length: 16 }, () => ({ i: Math.floor(range(rng, 0, 12)), j: Math.floor(range(rng, 0, 10)) }));
    this.embers = Array.from({ length: 40 }, () => ({ x: range(rng, 0.35, 1), y: range(rng, 0.2, 1), rise: range(rng, 0.01, 0.03), phase: range(rng, 0, 6.28) }));
  }

  update(deltaTime) {
    for (const e of this.embers) { e.y -= e.rise * deltaTime; if (e.y < 0.15) e.y = 1.02; }
  }

  draw(paint, { width, height, elapsed }) {
    const tile = Math.max(40, height / 11);
    const ox = width * 0.66;
    const oy = height * 0.22;
    const project = (i, j) => ({ x: ox + (i - j) * tile, y: oy + (i + j) * tile * RATIO });

    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 10; j++) {
        const p = project(i, j);
        const glow = this.torches.reduce((g, t) => g + 0.9 / (1 + Math.hypot(t.i - i, t.j - j) * 1.4), 0);
        const lit = Math.min(1, 0.12 + glow * (0.85 + 0.15 * Math.sin(elapsed * 6 + i + j)));
        paint.drawPath({
          points: [{ x: p.x, y: p.y - tile * RATIO }, { x: p.x + tile, y: p.y }, { x: p.x, y: p.y + tile * RATIO }, { x: p.x - tile, y: p.y }],
          closed: true, fillStyle: `rgba(${Math.round(70 * lit + 10)}, ${Math.round(48 * lit + 8)}, ${Math.round(36 * lit + 10)}, 1)`,
          strokeStyle: 'rgba(0, 0, 0, 0.35)', lineWidth: 1
        });
      }
    }
    for (const b of this.blocks) {
      const p = project(b.i, b.j);
      const h = tile * 0.9;
      paint.drawPath({ points: [{ x: p.x, y: p.y - tile * RATIO - h }, { x: p.x + tile, y: p.y - h }, { x: p.x, y: p.y + tile * RATIO - h }, { x: p.x - tile, y: p.y - h }], closed: true, fillStyle: '#2a2420' });
      paint.drawPath({ points: [{ x: p.x - tile, y: p.y - h }, { x: p.x, y: p.y + tile * RATIO - h }, { x: p.x, y: p.y + tile * RATIO }, { x: p.x - tile, y: p.y }], closed: true, fillStyle: '#1a1512' });
      paint.drawPath({ points: [{ x: p.x + tile, y: p.y - h }, { x: p.x, y: p.y + tile * RATIO - h }, { x: p.x, y: p.y + tile * RATIO }, { x: p.x + tile, y: p.y }], closed: true, fillStyle: '#120e0c' });
    }
    for (const t of this.torches) {
      const p = project(t.i, t.j);
      const flicker = 0.8 + 0.2 * Math.sin(elapsed * 9 + t.phase) * Math.sin(elapsed * 3.3 + t.phase);
      paint.drawArc({ x: p.x, y: p.y - tile * 0.5, radius: tile * 1.6, fillStyle: { type: 'radial', x: p.x, y: p.y - tile * 0.5, r0: 0, r1: tile * 1.6, stops: [{ offset: 0, color: `rgba(255, 170, 80, ${0.28 * flicker})` }, { offset: 1, color: 'rgba(255, 170, 80, 0)' }] } });
      paint.drawArc({ x: p.x, y: p.y - tile * 0.5, radius: 3, fillStyle: '#fff1c8' });
    }
    for (const e of this.embers) {
      const glow = 0.4 + 0.6 * Math.max(0, Math.sin(elapsed * 2 + e.phase));
      paint.drawArc({ x: e.x * width + Math.sin(elapsed + e.phase) * 6, y: e.y * height, radius: 1.8, fillStyle: `rgba(255, 150, 70, ${glow})` });
    }
  }
}

export const menuBackdrop = {
  gradient: { from: '#1a1210', to: '#07060a', angle: 160 },
  layers: [new VaultPlan()],
  motes: 0,
  vignette: 0.6
};
