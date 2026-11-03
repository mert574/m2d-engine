import { makeRng, range } from '../shared/rng.js';

/**
 * The showcase's menu: the harbour, before the storm.
 *
 * The scene behind Start is a harbour at night, so the menu shows the same
 * place from the shore. Stars over a dark sea, a moon laying its path on
 * the water, a lighthouse on the point with its beam turning, and lanterns
 * along the jetty. It is the showcase's own imagery, drawn with none of the
 * showcase's machinery: arcs, lines, paths and gradients, so it looks the
 * same on both backends before the comparison has started.
 */

const HORIZON = 0.64;
const STARS = 170;
const RIPPLES = 34;
const BEAM_RATE = 0.42;
const BEAM_HALF_ANGLE = 0.055;

const SKY = [
  { offset: 0, color: '#01030a' },
  { offset: 0.55, color: '#061125' },
  { offset: 1, color: '#0d1d3a' }
];
const SEA = [
  { offset: 0, color: '#0a1a33' },
  { offset: 0.25, color: '#061126' },
  { offset: 1, color: '#02050c' }
];
const SILHOUETTE = '#02050a';

export class HarbourNight {
  constructor(seed = 7) {
    const rng = makeRng(seed);
    this.stars = Array.from({ length: STARS }, () => ({
      x: rng(),
      y: Math.pow(rng(), 0.8) * 0.95,
      size: range(rng, 0.5, 1.5),
      rate: range(rng, 0.8, 2.6),
      phase: range(rng, 0, Math.PI * 2),
      alpha: range(rng, 0.35, 0.95)
    }));
    this.ripples = Array.from({ length: RIPPLES }, (_, i) => ({
      depth: (i + 0.5) / RIPPLES,
      phase: range(rng, 0, Math.PI * 2),
      rate: range(rng, 0.5, 1.1),
      wander: range(rng, 0.4, 1)
    }));
    this.lanterns = [0.79, 0.845, 0.905].map((x) => ({ x, phase: range(rng, 0, Math.PI * 2) }));
    this.wisps = Array.from({ length: 3 }, (_, i) => ({
      y: 0.16 + i * 0.07 + range(rng, -0.01, 0.01),
      width: range(rng, 0.22, 0.4),
      x: rng(),
      speed: range(rng, 2, 4)
    }));
  }

  draw(paint, { width, height, elapsed }) {
    const horizon = height * HORIZON;
    const unit = Math.min(width, height);

    paint.drawRect({
      x: 0, y: 0, width, height: horizon,
      fillStyle: { type: 'linear', x0: 0, y0: 0, x1: 0, y1: horizon, stops: SKY }
    });

    for (const star of this.stars) {
      const twinkle = 0.6 + 0.4 * Math.sin(elapsed * star.rate + star.phase);
      paint.drawArc({
        x: star.x * width, y: star.y * horizon, radius: star.size,
        fillStyle: '#dfe9ff', globalAlpha: star.alpha * twinkle
      });
    }

    // The moon and its halo.
    const moonX = width * 0.6;
    const moonY = height * 0.2;
    const moonRadius = unit * 0.027;
    paint.drawRect({
      x: 0, y: 0, width, height: horizon,
      fillStyle: {
        type: 'radial', x: moonX, y: moonY, r0: moonRadius, r1: unit * 0.26,
        stops: [
          { offset: 0, color: 'rgba(200, 216, 255, 0.26)' },
          { offset: 0.4, color: 'rgba(200, 216, 255, 0.06)' },
          { offset: 1, color: 'rgba(200, 216, 255, 0)' }
        ]
      }
    });
    paint.drawArc({ x: moonX, y: moonY, radius: moonRadius, fillStyle: '#eaf0fb' });

    for (const wisp of this.wisps) {
      const bandWidth = wisp.width * width;
      const x = ((wisp.x * width + elapsed * wisp.speed) % (width + bandWidth)) - bandWidth;
      const bandHeight = height * 0.014;
      paint.drawRect({
        x, y: wisp.y * height, width: bandWidth, height: bandHeight,
        cornerRadius: bandHeight / 2, fillStyle: '#070f20', globalAlpha: 0.7
      });
    }

    // The sea, and the moon's path across it: short dashes that widen and
    // scatter with depth, each shifting on its own clock.
    paint.drawRect({
      x: 0, y: horizon, width, height: height - horizon,
      fillStyle: { type: 'linear', x0: 0, y0: horizon, x1: 0, y1: height, stops: SEA }
    });
    for (const ripple of this.ripples) {
      const y = horizon + ripple.depth * (height - horizon) * 0.92;
      const spread = unit * (0.01 + ripple.depth * 0.09);
      const x = moonX + Math.sin(elapsed * ripple.rate + ripple.phase) * spread * ripple.wander;
      const dash = unit * (0.012 + ripple.depth * 0.05);
      const shimmer = 0.5 + 0.5 * Math.sin(elapsed * ripple.rate * 1.7 + ripple.phase);
      paint.drawRect({
        x: x - dash / 2, y, width: dash, height: 1.5,
        fillStyle: '#dfe9ff', globalAlpha: (0.55 - ripple.depth * 0.4) * shimmer
      });
    }

    this.#drawPoint(paint, width, height, horizon, elapsed);
  }

  /** The point: rocks, a jetty with its lanterns, the lighthouse and beam. */
  #drawPoint(paint, width, height, horizon, elapsed) {
    const baseY = horizon + height * 0.018;
    const towerX = width * 0.9;
    const towerHeight = height * 0.27;
    const lampY = baseY - towerHeight;

    // The beam first, clipped to the sky, so the tower stands in front.
    paint.pushClip({ x: 0, y: 0, width, height: horizon });
    const angle = elapsed * BEAM_RATE;
    // Two fans per side, one wide and faint inside one narrow and brighter,
    // so the beam has a soft edge instead of a ruled one.
    const length = width * 1.1;
    for (const side of [0, Math.PI]) {
      const a = angle + side;
      for (const [spread, peak] of [[BEAM_HALF_ANGLE * 2.2, 0.14], [BEAM_HALF_ANGLE, 0.3]]) {
        paint.drawPath({
          points: [
            { x: towerX, y: lampY },
            { x: towerX + Math.cos(a - spread) * length, y: lampY + Math.sin(a - spread) * length },
            { x: towerX + Math.cos(a + spread) * length, y: lampY + Math.sin(a + spread) * length }
          ],
          closed: true,
          fillStyle: {
            type: 'radial', x: towerX, y: lampY, r0: 0, r1: length,
            stops: [
              { offset: 0, color: `rgba(255, 236, 190, ${peak})` },
              { offset: 0.3, color: `rgba(255, 236, 190, ${peak * 0.45})` },
              { offset: 1, color: 'rgba(255, 236, 190, 0)' }
            ]
          }
        });
      }
    }
    paint.popClip();

    // Rocks: a low mound rising out of the water towards the right edge.
    const rockLeft = width * 0.7;
    const rock = [{ x: rockLeft, y: baseY + 1 }];
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const x = rockLeft + t * (width + 4 - rockLeft);
      const rise = Math.pow(Math.sin(Math.min(t, 0.85) / 0.85 * Math.PI * 0.5), 1.4);
      const y = baseY - height * (0.045 * rise + 0.006 * Math.sin(t * 23) * rise);
      rock.push({ x, y });
    }
    rock.push({ x: width + 4, y: baseY + 1 });
    paint.drawPath({ points: rock, closed: true, fillStyle: SILHOUETTE });

    // The jetty: a deck on piles, out from the rocks.
    const deckY = baseY - height * 0.012;
    paint.drawRect({ x: width * 0.76, y: deckY, width: width * 0.17, height: 3, fillStyle: SILHOUETTE });
    for (let i = 0; i < 6; i++) {
      const x = width * (0.77 + i * 0.03);
      paint.drawRect({ x, y: deckY, width: 2, height: height * 0.03, fillStyle: SILHOUETTE });
    }
    for (const lantern of this.lanterns) {
      const x = lantern.x * width;
      const y = deckY - height * 0.026;
      const flicker = 0.8 + 0.2 * Math.sin(elapsed * 5.3 + lantern.phase) * Math.sin(elapsed * 1.9 + lantern.phase);
      paint.drawRect({ x: x - 1, y, width: 2, height: height * 0.026, fillStyle: SILHOUETTE });
      paint.drawArc({
        x, y, radius: height * 0.045,
        fillStyle: {
          type: 'radial', x, y, r0: 0, r1: height * 0.045,
          stops: [
            { offset: 0, color: 'rgba(255, 184, 96, 0.3)' },
            { offset: 1, color: 'rgba(255, 184, 96, 0)' }
          ]
        },
        globalAlpha: flicker
      });
      paint.drawArc({ x, y, radius: 2, fillStyle: '#ffd9a0', globalAlpha: flicker });
    }

    // The tower, its gallery and the lamp.
    const footHalf = width * 0.011;
    const topHalf = width * 0.0065;
    paint.drawPath({
      points: [
        { x: towerX - footHalf, y: baseY + 2 },
        { x: towerX - topHalf, y: lampY + height * 0.02 },
        { x: towerX + topHalf, y: lampY + height * 0.02 },
        { x: towerX + footHalf, y: baseY + 2 }
      ],
      closed: true,
      fillStyle: SILHOUETTE
    });
    paint.drawRect({
      x: towerX - topHalf * 1.6, y: lampY + height * 0.016, width: topHalf * 3.2, height: 3, fillStyle: SILHOUETTE
    });
    paint.drawRect({
      x: towerX - topHalf * 0.9, y: lampY - height * 0.012, width: topHalf * 1.8, height: height * 0.03,
      fillStyle: '#0a1426'
    });
    paint.drawArc({
      x: towerX, y: lampY, radius: height * 0.05,
      fillStyle: {
        type: 'radial', x: towerX, y: lampY, r0: 0, r1: height * 0.05,
        stops: [
          { offset: 0, color: 'rgba(255, 240, 200, 0.55)' },
          { offset: 1, color: 'rgba(255, 240, 200, 0)' }
        ]
      }
    });
    paint.drawArc({ x: towerX, y: lampY, radius: 2.5, fillStyle: '#fff4d6' });
  }
}

/** `UIBackdrop` options for the showcase's menu. */
export const menuBackdrop = {
  gradient: null,
  layers: [new HarbourNight()],
  motes: 0,
  vignette: 0.62
};
