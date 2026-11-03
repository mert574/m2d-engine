import { makeRng, range } from '../shared/rng.js';

/**
 * The platformer's menu: a valley at dusk.
 *
 * A side-scroller is about horizons, so its menu gets one. Four ridges in
 * parallax slide past at different speeds, a low sun sinks behind the
 * farthest of them, cloud bands drift and a flock crosses now and then. All
 * of it is drawn from a seeded profile function, so the valley is the same
 * every time the menu opens and never shows a seam when it scrolls.
 *
 * Nothing here is sprites: the skyline is four filled paths sampled every
 * few pixels. The one rule is that nothing moves fast. The nearest ridge
 * covers about a screen width every minute; a menu that visibly scrolls is
 * a screensaver.
 */

/** Sky from zenith to horizon. The warm band is what sells the hour. */
const SKY = [
  { offset: 0, color: '#040a12' },
  { offset: 0.42, color: '#0e2a44' },
  { offset: 0.7, color: '#4a3f57' },
  { offset: 0.86, color: '#a9653c' },
  { offset: 1, color: '#e9a865' }
];

/** Where the farthest ridge stands, as a fraction of the height. */
const HORIZON = 0.64;

/**
 * Ridges, far to near. `base` and `amp` are fractions of the height,
 * `freqs` are in radians per height so a screen width holds a few peaks,
 * `speed` is in UI units per second. The farthest is `peaked`, a mountain
 * line; the rest roll. The two nearest carry a treeline, a ragged
 * triangle wave of `trees` height on top of the profile.
 */
const RIDGES = [
  { base: 0.68, amp: 0.2, freqs: [7.5, 17, 39], speed: 2.5, color: '#2c4a66', peaked: true },
  { base: 0.74, amp: 0.075, freqs: [5.2, 12, 27], speed: 6, color: '#1a3049' },
  { base: 0.82, amp: 0.06, freqs: [4.1, 9.3, 21], speed: 12, color: '#0d1b2b', trees: 0.02 },
  { base: 0.91, amp: 0.045, freqs: [3.2, 7.1, 16], speed: 21, color: '#04090f', trees: 0.032 }
];

/** Sampling step along a ridge, in UI units. */
const STEP = 6;

export class DuskValley {
  constructor(seed = 11) {
    const rng = makeRng(seed);
    // Phases, so no two ridges share a silhouette.
    this.ridges = RIDGES.map((ridge) => ({
      ...ridge,
      phases: ridge.freqs.map(() => range(rng, 0, Math.PI * 2)),
      treePhase: range(rng, 0, Math.PI * 2)
    }));
    this.clouds = Array.from({ length: 4 }, (_, i) => ({
      y: 0.4 + i * 0.05 + range(rng, -0.01, 0.01),
      width: range(rng, 0.2, 0.4),
      x: rng(),
      speed: range(rng, 2.5, 5),
      alpha: range(rng, 0.4, 0.65),
      phase: range(rng, 0, Math.PI * 2)
    }));
    this.flock = Array.from({ length: 7 }, () => ({
      dx: range(rng, 0, 0.09),
      dy: range(rng, -0.035, 0.035),
      flap: range(rng, 0, Math.PI * 2)
    }));
  }

  /** Height of a ridge profile at `u`, in normalized horizontal units. */
  #profile(ridge, u, height) {
    const [a, b, c] = ridge.freqs;
    const [pa, pb, pc] = ridge.phases;
    let relief;
    if (ridge.peaked) {
      // Folded sines for sharp crests, over a slow roll so the valleys
      // between them sit at different heights rather than on one line.
      relief = 0.12 + 0.1 * Math.sin(u * 1.9 + pa * 0.5)
        + 0.5 * (1 - Math.abs(Math.sin(u * a + pa)))
        + 0.22 * (1 - Math.abs(Math.sin(u * b + pb)))
        + 0.1 * (1 - Math.abs(Math.sin(u * c + pc)));
    } else {
      relief = 0.5 + 0.5 * (
        0.55 * Math.sin(u * a + pa)
        + 0.3 * Math.sin(u * b + pb)
        + 0.15 * Math.sin(u * c + pc)
      );
    }
    let y = ridge.base * height - ridge.amp * height * relief;
    if (ridge.trees) {
      // Pines: two triangle waves of different pitch, the taller winning,
      // with the stature breathing along the ridge so no two look alike.
      const pitchA = Math.abs(((u * 24) % 1) - 0.5) * 2;
      const pitchB = Math.abs(((u * 15.3 + 0.37) % 1) - 0.5) * 2;
      const stature = 0.5 + 0.5 * Math.sin(u * 5.1 + ridge.treePhase) * Math.sin(u * 1.7);
      y -= Math.max(pitchA, pitchB * 0.8) * ridge.trees * height * (0.6 + stature);
    }
    return y;
  }

  draw(paint, { width, height, elapsed }) {
    const horizon = height * HORIZON;
    const unit = Math.min(width, height);

    // Sky, graded to the horizon. Below it the far ridge takes over, as its
    // profile never drops under its base.
    paint.drawRect({
      x: 0, y: 0, width, height,
      fillStyle: { type: 'linear', x0: 0, y0: 0, x1: 0, y1: horizon, stops: SKY }
    });

    // The sun, low and partly behind the far ridge.
    const sunX = width * 0.7;
    const sunY = height * 0.555;
    paint.drawRect({
      x: 0, y: 0, width, height: horizon + 2,
      fillStyle: {
        type: 'radial', x: sunX, y: sunY, r0: 0, r1: unit * 0.46,
        stops: [
          { offset: 0, color: 'rgba(255, 178, 96, 0.5)' },
          { offset: 0.35, color: 'rgba(255, 150, 90, 0.16)' },
          { offset: 1, color: 'rgba(255, 140, 90, 0)' }
        ]
      }
    });
    paint.drawArc({
      x: sunX, y: sunY, radius: unit * 0.048,
      fillStyle: {
        type: 'radial', x: sunX, y: sunY - unit * 0.01, r0: 0, r1: unit * 0.048,
        stops: [{ offset: 0, color: '#fff1cc' }, { offset: 1, color: '#ffc782' }]
      }
    });

    for (const cloud of this.clouds) this.#drawCloud(paint, cloud, width, height, elapsed);

    this.#drawFlock(paint, width, height, elapsed);

    // Ridges, far to near. A haze band between the far two gives depth.
    this.ridges.forEach((ridge, index) => {
      if (index === 1) {
        // Fades in from nothing at the top, so no edge crosses the peaks.
        const hazeTop = horizon - height * 0.14;
        paint.drawRect({
          x: 0, y: hazeTop, width, height: height * 0.4,
          fillStyle: {
            type: 'linear', x0: 0, y0: hazeTop, x1: 0, y1: hazeTop + height * 0.4,
            stops: [
              { offset: 0, color: 'rgba(233, 168, 101, 0)' },
              { offset: 0.38, color: 'rgba(233, 168, 101, 0.2)' },
              { offset: 1, color: 'rgba(233, 168, 101, 0)' }
            ]
          }
        });
      }
      this.#drawRidge(paint, ridge, width, height, elapsed);
    });
  }

  /**
   * A cloud at dusk is a dark lens: flat underneath, lumpy on top, long.
   * Eight lumps of two sines are enough to stop it reading as a bar.
   */
  #drawCloud(paint, cloud, width, height, elapsed) {
    const bandWidth = cloud.width * width;
    const left = ((cloud.x * width + elapsed * cloud.speed) % (width + bandWidth)) - bandWidth;
    const y = cloud.y * height;
    const thickness = height * 0.016;
    const points = [{ x: left, y }];
    for (let i = 1; i < 24; i++) {
      const t = i / 24;
      const lump = Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.abs(Math.sin(t * 9.1 + cloud.phase)));
      points.push({ x: left + t * bandWidth, y: y - thickness * lump });
    }
    points.push({ x: left + bandWidth, y });
    paint.drawPath({ points, closed: true, fillStyle: '#141d2d', globalAlpha: cloud.alpha });
  }

  #drawRidge(paint, ridge, width, height, elapsed) {
    const scroll = elapsed * ridge.speed;
    const points = [{ x: -STEP, y: height + STEP }];
    for (let x = -STEP; x <= width + STEP; x += STEP) {
      // Normalized against the height, so slopes read the same at any size.
      points.push({ x, y: this.#profile(ridge, (x + scroll) / height, height) });
    }
    points.push({ x: width + STEP, y: height + STEP });
    paint.drawPath({ points, closed: true, fillStyle: ridge.color });
  }

  /** A line of birds, right to left, once every eighty seconds or so. */
  #drawFlock(paint, width, height, elapsed) {
    const span = width + 200;
    const lead = width + 100 - ((elapsed * 17) % span);
    for (const bird of this.flock) {
      const x = lead + bird.dx * width;
      const y = height * 0.44 + bird.dy * height;
      const wing = Math.sin(elapsed * 7 + bird.flap) * 3;
      const size = 5;
      paint.drawPath({
        points: [{ x: x - size, y: y - wing }, { x, y }, { x: x + size, y: y - wing }],
        strokeStyle: '#0a1420',
        lineWidth: 1.5,
        globalAlpha: 0.85
      });
    }
  }
}

/** `UIBackdrop` options for the platformer's menu. */
export const menuBackdrop = {
  gradient: null,
  layers: [new DuskValley()],
  // Fireflies over the near slope.
  motes: 28,
  moteColor: '#ffd27a',
  vignette: 0.5
};
