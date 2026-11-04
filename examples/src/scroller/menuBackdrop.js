import { makeRng, range } from '../shared/rng.js';

/**
 * Beeline's menu: the meadow at rest, before the run.
 *
 * Three banded silhouettes of blades and seed heads under a low sun, each
 * swaying on its own slow clock, and one bee crossing the frame in lazy
 * loops with a dotted line behind it — the route the game is about. All
 * vector: the level's paper-cut planes, restated in ink.
 */

const BANDS = [
  { base: 1.0, height: 0.42, color: 'rgba(240, 216, 150, 0.35)', blades: 46, lift: 0.3, sway: 0.5 },
  { base: 1.0, height: 0.3, color: 'rgba(146, 148, 74, 0.5)', blades: 38, lift: 0.16, sway: 0.8 },
  { base: 1.04, height: 0.24, color: 'rgba(42, 64, 30, 0.85)', blades: 30, lift: 0, sway: 1.2 }
];

export class MeadowRest {
  constructor() {
    const rng = makeRng(0xbee);
    this.bands = BANDS.map(band => ({
      ...band,
      stalks: Array.from({ length: band.blades }, () => ({
        at: rng(),
        h: range(rng, 0.45, 1),
        lean: range(rng, -0.12, 0.12),
        phase: range(rng, 0, Math.PI * 2),
        head: rng() < 0.3
      }))
    }));
    this.seeds = Array.from({ length: 10 }, () => ({
      at: rng(),
      y: range(rng, 0.15, 0.75),
      speed: range(rng, 14, 30),
      phase: range(rng, 0, Math.PI * 2)
    }));
  }

  draw(paint, { width, height, elapsed }) {
    // The sun, low over the far band.
    const sunX = width * 0.72;
    const sunY = height * 0.38;
    paint.drawArc({
      x: sunX, y: sunY, radius: height * 0.3,
      fillStyle: {
        type: 'radial', x: sunX, y: sunY, r0: height * 0.05, r1: height * 0.3,
        stops: [{ offset: 0, color: 'rgba(255, 238, 190, 0.5)' }, { offset: 1, color: 'rgba(255, 238, 190, 0)' }]
      }
    });
    paint.drawArc({ x: sunX, y: sunY, radius: height * 0.055, fillStyle: 'rgba(255, 248, 224, 0.95)' });

    // The bands, far to near: blades as slim triangles from a common floor.
    for (const band of this.bands) {
      const floor = height * band.base;
      const reach = height * band.height;
      for (const stalk of band.stalks) {
        const x = stalk.at * width * 1.05 - width * 0.02;
        const h = reach * stalk.h;
        const sway = Math.sin(elapsed * band.sway * 0.6 + stalk.phase) * 6 + stalk.lean * h;
        const tip = { x: x + sway, y: floor - h };
        paint.drawPath({
          points: [{ x: x - h * 0.06 - 3, y: floor }, { x: x + h * 0.06 + 3, y: floor }, tip],
          fillStyle: band.color
        });
        if (stalk.head) {
          paint.drawArc({ x: tip.x, y: tip.y - 4, radius: Math.max(3, h * 0.05), fillStyle: band.color });
        }
      }
    }

    // Seeds on the breeze.
    for (const seed of this.seeds) {
      const span = width + 120;
      const x = -60 + ((seed.at * span + elapsed * seed.speed) % span + span) % span;
      const y = seed.y * height + Math.sin(elapsed * 0.7 + seed.phase) * 18;
      paint.drawArc({ x, y, radius: 2, fillStyle: 'rgba(255, 252, 240, 0.8)' });
    }

    // The bee, crossing in lazy loops, its route dotted behind it.
    const t = elapsed * 0.11;
    const beeAt = (k) => ({
      x: width * (0.08 + (((t - k) % 1) + 1) % 1 * 0.9),
      y: height * 0.42 + Math.sin((t - k) * Math.PI * 7) * height * 0.13
    });
    for (let k = 0.012; k < 0.1; k += 0.012) {
      const dot = beeAt(k);
      paint.drawArc({ x: dot.x, y: dot.y, radius: 1.6, fillStyle: 'rgba(90, 70, 20, 0.35)' });
    }
    const bee = beeAt(0);
    const flap = Math.sin(elapsed * 36);
    paint.drawArc({ x: bee.x - 2, y: bee.y - 6 - 3 * Math.abs(flap), radius: 3.4, fillStyle: 'rgba(240, 246, 252, 0.7)' });
    paint.drawArc({ x: bee.x - 4, y: bee.y, radius: 4.4, fillStyle: '#e8b23c' });
    paint.drawArc({ x: bee.x, y: bee.y, radius: 3.6, fillStyle: '#3f3217' });
    paint.drawArc({ x: bee.x + 4.5, y: bee.y - 0.5, radius: 2.8, fillStyle: '#e8b23c' });
  }
}

/** `UIBackdrop` options for Beeline's menu. */
export const menuBackdrop = {
  gradient: { from: '#f4b45c', to: '#f9dda0', angle: 170 },
  layers: [new MeadowRest()],
  motes: 0,
  vignette: 0.42
};
