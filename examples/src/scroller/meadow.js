import { makeRng, range } from '../shared/rng.js';

/**
 * The lane Beeline flies down: one long meadow verge at golden hour, laid
 * out ahead of time from a fixed seed. The auto-scroller rule (see
 * docs/contributing/determinism.md) is that nothing here is spawned against
 * the camera: every flower, pollen grain, bramble and wasp is placed now,
 * and the simulation only ever asks where the scroll front is.
 */

export const LENGTH = 7800;
export const HEIGHT = 540;
/** The window's pace rightward, px/s — both the camera's and the front's. */
export const SPEED = 120;
/** Where the bee may fly: below the sky's margin, above the verge. */
export const BAND = { top: 80, bottom: 450 };

const SEED = 0xbee1;

/** One flower kind per silhouette, with how tall it grows. */
const FLOWER_KINDS = [
  { sprite: 'flowerballs', min: 150, max: 260, weight: 3 },
  { sprite: 'seedheads', min: 140, max: 240, weight: 3 },
  { sprite: 'flowerspikes', min: 120, max: 200, weight: 2 },
  { sprite: 'cattails', min: 160, max: 280, weight: 2 }
];

export function buildMeadow() {
  const rng = makeRng(SEED);
  const pick = () => {
    const total = FLOWER_KINDS.reduce((sum, kind) => sum + kind.weight, 0);
    let roll = range(rng, 0, total);
    for (const kind of FLOWER_KINDS) {
      roll -= kind.weight;
      if (roll <= 0) return kind;
    }
    return FLOWER_KINDS[0];
  };

  // The verge: flowers all the way down the lane, pollen at most heads.
  const flowers = [];
  const pollen = [];
  for (let x = 420; x < LENGTH - 700; x += range(rng, 130, 240)) {
    const kind = pick();
    const h = range(rng, kind.min, kind.max);
    flowers.push({ x, sprite: kind.sprite, w: h * range(rng, 0.8, 1), h, sway: range(rng, 0, Math.PI * 2) });
    if (rng() < 0.72) {
      pollen.push({
        x: x + range(rng, -14, 14),
        y: Math.max(BAND.top + 30, HEIGHT - h - range(rng, 16, 44))
      });
    }
  }

  // Chains of three in the open air, inviting a weave away from the verge.
  // Every grain stays inside the flight band, or a perfect run is impossible.
  for (let x = 900; x < LENGTH - 900; x += range(rng, 750, 1150)) {
    const y = range(rng, BAND.top + 40, 300);
    const rise = range(rng, -50, 50);
    for (let i = 0; i < 3; i++) {
      pollen.push({
        x: x + i * 54,
        y: Math.min(BAND.bottom - 20, Math.max(BAND.top + 18, y + i * rise))
      });
    }
  }

  // Thistles on the verge: tall enough to block low flight.
  const brambles = [];
  for (let x = 1000; x < LENGTH - 800; x += range(rng, 420, 720)) {
    const size = range(rng, 130, 200);
    brambles.push({
      x, size,
      sprite: rng() < 0.5 ? 'bramble-a' : 'bramble-b',
      y: HEIGHT - range(rng, 40, 90) - size / 2
    });
  }

  // Wasps working the open air on their own slow loops.
  const wasps = [];
  for (let x = 1350; x < LENGTH - 900; x += range(rng, 580, 920)) {
    wasps.push({
      x,
      y: range(rng, 170, 360),
      amp: range(rng, 55, 120),
      rate: range(rng, 0.35, 0.7),
      drift: range(rng, 20, 50),
      phase: range(rng, 0, Math.PI * 2)
    });
  }

  // The hive on its post, in a quiet plaza past the last hazard.
  const hive = { x: LENGTH - 240, y: HEIGHT - 240 };

  return { flowers, pollen, brambles, wasps, hive };
}
