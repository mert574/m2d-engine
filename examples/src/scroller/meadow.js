import { makeRng, range } from '../shared/rng.js';

/**
 * The lane Beeline flies down, laid out ahead of time from a fixed seed.
 * The auto-scroller rule (see docs/contributing/determinism.md) is that
 * nothing is spawned against the camera: every flower, grain, thistle, wasp
 * and web is placed now, and the simulation only asks where the scroll
 * front is.
 *
 * The run is paced in five acts, and the sky keeps time with them — the sun
 * goes down over the length of the lane:
 *
 *   open meadow   a gentle start: flowers and easy pollen
 *   the thistles  a slalom of burr heads on tall stems
 *   wasp beats    patrols that telegraph and dart; the best chains sit
 *                 inside their reach
 *   the hollow    orb webs strung across the lane; a dash tears free
 *   dusk glide    nothing hostile, fireflies out, a last arc of pollen
 *                 bending down to the hive
 */

export const LENGTH = 8400;
export const HEIGHT = 540;
/** The window's pace rightward, px/s — both the camera's and the front's. */
export const SPEED = 130;
/** Where the bee may fly: below the sky's margin, above the verge. */
export const BAND = { top: 80, bottom: 450 };

/** Act boundaries, for the layout and for anyone pacing music or light. */
export const ACTS = {
  thistles: 1500,
  wasps: 3400,
  hollow: 5300,
  glide: 6900
};

const SEED = 0xbee12;

/** One flower kind per silhouette, with how tall it grows. */
const FLOWER_KINDS = [
  { sprite: 'flowerballs', min: 150, max: 260, weight: 3 },
  { sprite: 'seedheads', min: 140, max: 240, weight: 3 },
  { sprite: 'flowerspikes', min: 120, max: 200, weight: 2 },
  { sprite: 'cattails', min: 160, max: 280, weight: 2 }
];

const clampY = (y) => Math.min(BAND.bottom - 18, Math.max(BAND.top + 16, y));

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

  // The verge: flowers all the way down the lane.
  const flowers = [];
  for (let x = 380; x < LENGTH - 600; x += range(rng, 120, 220)) {
    const kind = pick();
    const h = range(rng, kind.min, kind.max);
    flowers.push({ x, sprite: kind.sprite, w: h * range(rng, 0.8, 1), h, sway: range(rng, 0, Math.PI * 2) });
  }

  const pollen = [];
  /** A short arc of grains, each clamped into the flight band. */
  const arc = (x, y, count, stepX, stepY) => {
    for (let i = 0; i < count; i++) {
      pollen.push({ x: x + i * stepX, y: clampY(y + i * stepY) });
    }
  };

  // Act 1 — open meadow: generous, flowing lines that teach the collect.
  for (let x = 460; x < ACTS.thistles; x += range(rng, 260, 380)) {
    arc(x, range(rng, 180, 380), 4, 56, range(rng, -46, 46));
  }

  // Act 2 — the thistles: burr heads alternating high and low, with the
  // pollen threaded through the gaps they leave.
  const thistles = [];
  let high = rng() < 0.5;
  for (let x = ACTS.thistles + 150; x < ACTS.wasps - 150; x += range(rng, 260, 380)) {
    const size = range(rng, 110, 160);
    const y = high ? range(rng, 150, 240) : range(rng, 330, 420);
    thistles.push({ x, y, size, sprite: rng() < 0.5 ? 'bramble-a' : 'bramble-b', sway: range(rng, 0, Math.PI * 2) });
    arc(x + range(rng, 90, 150), high ? y + range(rng, 150, 190) : y - range(rng, 170, 210), 3, 50, range(rng, -20, 20));
    high = !high;
  }

  // Act 3 — wasp beats: each wasp owns a stretch, and the richest chains
  // sit inside its loop. A few thistles keep the floor honest.
  const wasps = [];
  for (let x = ACTS.wasps + 200; x < ACTS.hollow - 200; x += range(rng, 440, 640)) {
    const y = range(rng, 170, 340);
    wasps.push({
      x, y,
      amp: range(rng, 60, 110),
      rate: range(rng, 0.3, 0.55),
      drift: range(rng, 24, 60),
      phase: range(rng, 0, Math.PI * 2)
    });
    arc(x - 120, y + range(rng, -40, 40), 5, 60, range(rng, -24, 24));
    if (rng() < 0.5) {
      thistles.push({
        x: x + range(rng, 180, 260), y: range(rng, 350, 430),
        size: range(rng, 100, 140),
        sprite: rng() < 0.5 ? 'bramble-a' : 'bramble-b', sway: range(rng, 0, Math.PI * 2)
      });
    }
  }

  // Act 4 — the hollow: orb webs across the lane, pollen paying for the
  // risk of flying near them (and a grain or two sitting inside).
  const webs = [];
  for (let x = ACTS.hollow + 180; x < ACTS.glide - 200; x += range(rng, 430, 580)) {
    const y = clampY(range(rng, 160, 360));
    webs.push({ x, y, w: 150, h: 230, sway: range(rng, 0, Math.PI * 2) });
    pollen.push({ x, y: clampY(y + range(rng, -20, 20)) });
    arc(x + range(rng, 190, 240), range(rng, 140, 380), 3, 52, range(rng, -30, 30));
  }

  // Act 5 — dusk glide: one long line bending down toward the hive.
  const hive = { x: LENGTH - 240, y: HEIGHT - 240 };
  {
    const from = { x: ACTS.glide + 150, y: 160 };
    const count = 9;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      pollen.push({
        x: from.x + (hive.x - 260 - from.x) * t,
        y: clampY(from.y + (hive.y - from.y) * t * t)
      });
    }
  }

  // Pollen at some flower heads, outside the hollow where the webs rule.
  for (const flower of flowers) {
    if (flower.x > ACTS.hollow && flower.x < ACTS.glide) continue;
    if (flower.x > hive.x - 500) continue;
    if (rng() < 0.3) {
      pollen.push({ x: flower.x + range(rng, -12, 12), y: clampY(HEIGHT - flower.h - range(rng, 18, 40)) });
    }
  }

  return { flowers, pollen, thistles, wasps, webs, hive };
}
