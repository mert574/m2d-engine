import { advanceCycle, cycleLook } from 'm2d-engine/core/look.js';

/**
 * The harbour's weather and its hour.
 *
 * The showcase used to run a reel of effects — a shake, a zoom, a roll,
 * a stretch of slow motion — one after another on a short loop. They
 * showed the engine's range and nothing else: there was no reason for any
 * of them, so they read as a demo of a demo. This is the same range put
 * behind one cause. A front crosses the harbour over two and a half
 * minutes: the wind gets up and leans the rain and the reeds, the sea
 * roughens and the camera breathes with the swell, the grade goes cold
 * and grainy, lightning strikes and the frame flashes and knocks. Then it
 * passes, the air clears, and the light goes on turning from dusk through
 * night to first light on its own, longer cycle.
 *
 * Everything here is a function of the wall clock, so two backends are in
 * the same weather at the same moment, and — this is the part that
 * matters for a comparison harness — **the weather changes how the scene
 * looks, never how much of it there is**. No count moves with it. The
 * stress load is as fixed as it ever was.
 *
 * Slow motion is deliberately not here. In a harness whose headline
 * number is frames per second, a scene that slows itself down reads as a
 * stutter, and the one thing this screen must never do is lie about its
 * own frame rate.
 */

/** Seconds for the front to cross and clear. */
const FRONT = 150;
/** Seconds for the light to turn through all its hours and round again. */
const HOURS_PERIOD = 96;

/** The hours, as looks the engine blends between. */
const HOURS = {
  period: HOURS_PERIOD,
  states: [
    {
      name: 'dusk',
      lighting: { ambient: '#4a4a74' },
      post: {
        bloom: { threshold: 0.72, strength: 0.5, blur: 28 },
        vignette: { strength: 0.34, start: 0.52 },
        grade: { shadows: '#2c3358', highlights: '#ffd9a8', amount: 0.32, saturation: 1.12, contrast: 1.03 }
      }
    },
    {
      name: 'night',
      lighting: { ambient: '#2a3250' },
      post: {
        bloom: { threshold: 0.6, strength: 0.8, blur: 38 },
        vignette: { strength: 0.46, start: 0.44 },
        grade: { shadows: '#1b2448', highlights: '#bcd8ff', amount: 0.46, saturation: 1, contrast: 1.08 }
      }
    },
    {
      name: 'first light',
      lighting: { ambient: '#6a6080' },
      post: {
        bloom: { threshold: 0.78, strength: 0.42, blur: 24 },
        vignette: { strength: 0.28, start: 0.56 },
        grade: { shadows: '#4a3f63', highlights: '#ffe8c4', amount: 0.3, saturation: 1.18, contrast: 1.02 }
      }
    }
  ]
};

/**
 * When lightning strikes, as fractions of the front. They sit inside the
 * squall and nowhere near each other; the brightest is the one at its
 * peak. Fixed rather than random, so both backends strike together.
 */
const STRIKES = [
  { at: 0.42, power: 0.6 },
  { at: 0.5, power: 1 },
  { at: 0.56, power: 0.45 },
  { at: 0.63, power: 0.8 }
];
/** How long a strike's flash and knock last, seconds. */
const STRIKE = 0.55;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Smooth 0→1 between two edges. */
const ramp = (v, from, to) => clamp01((v - from) / (to - from)) ** 2 * (3 - 2 * clamp01((v - from) / (to - from)));

export class Weather {
  /** @param {import('m2d-engine/core/m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
    /** Wall seconds: the weather and the hour both run on it. */
    this.clock = 0;
    this.cycle = { ...HOURS, phase: 0, count: HOURS.states.length, target: 0 };
    this.enabled = true;
  }

  /** How far through the front we are, 0 to 1. */
  get front() {
    return (this.clock % FRONT) / FRONT;
  }

  /**
   * How hard it is blowing, 0 calm to 1 squall: it gets up over the first
   * third, holds through the middle, and clears over the last quarter.
   */
  get strength() {
    if (!this.enabled) return 0;
    const t = this.front;
    return ramp(t, 0.12, 0.4) * (1 - ramp(t, 0.68, 0.92));
  }

  /** What the weather is called, for the readout. */
  get name() {
    const s = this.strength;
    if (s < 0.12) return 'calm';
    if (s < 0.4) return 'freshening';
    if (s < 0.75) return 'blowing';
    return 'squall';
  }

  /** The hour the light is at. */
  get hour() {
    return HOURS.states[Math.floor(this.cycle.phase) % HOURS.states.length].name;
  }

  /**
   * The wind, -1 to 1 across the harbour: a steady lean with the front,
   * and gusts riding on it that the reeds and the rain both feel.
   */
  get wind() {
    const gust = Math.sin(this.clock * 0.37) * 0.3 + Math.sin(this.clock * 0.91 + 1.7) * 0.18;
    return clamp01(this.strength) * (0.55 + gust);
  }

  /** The strike happening now and how far through it, or null. */
  get strike() {
    if (!this.enabled) return null;
    const t = this.front;
    for (const strike of STRIKES) {
      const since = (t - strike.at) * FRONT;
      if (since >= 0 && since < STRIKE) return { power: strike.power, t: since / STRIKE };
    }
    return null;
  }

  /** @param {number} unscaled - Wall seconds since the last frame */
  update(unscaled) {
    this.clock += unscaled;
    if (this.enabled) this.cycle.phase = advanceCycle(this.cycle, unscaled);
  }

  /**
   * What the camera does with the sea: a slow breath in and out with the
   * swell, a fraction of a degree of roll, and the knock of a near strike.
   * Never more than a couple of percent — a comparison harness has to keep
   * showing the same amount of world.
   */
  camera() {
    const swell = this.strength;
    const roll = Math.sin(this.clock * 0.21) * 0.004 + Math.sin(this.clock * 0.13 + 2.1) * 0.003;
    const breath = Math.sin(this.clock * 0.17) * 0.012;
    const strike = this.strike;
    // A knock rings out over the strike rather than shaking for its whole
    // length: two sines well off each other, decaying fast.
    const knock = strike ? strike.power * (1 - strike.t) ** 3 : 0;
    return {
      offset: {
        x: Math.sin(this.clock * 57) * 14 * knock,
        y: Math.sin(this.clock * 43 + 1.1) * 10 * knock
      },
      zoom: 1 + breath + swell * 0.015,
      rotation: roll * (1 + swell * 2)
    };
  }

  /**
   * The light and the full post stack: the hour's look, roughened by the
   * weather and lit up by a strike.
   */
  look() {
    const look = cycleLook(this.cycle, this.cycle.phase);
    if (!this.enabled) return look;
    const s = this.strength;
    const strike = this.strike;
    const flash = strike ? strike.power * (1 - strike.t) ** 2 : 0;

    const grade = { ...look.post?.grade };
    // Rain takes the colour out of a scene and flattens it.
    grade.saturation = (grade.saturation ?? 1) * (1 - 0.25 * s);
    grade.amount = (grade.amount ?? 0) + 0.08 * s;

    look.post = {
      ...look.post,
      grade,
      vignette: { ...look.post?.vignette, strength: (look.post?.vignette?.strength ?? 0.3) + 0.16 * s },
      // The haze of heavy rain, and the lens it is falling on.
      blur: { strength: 0.18 * s },
      grain: { strength: 0.02 + 0.05 * s },
      chromatic: { strength: 0.0008 + 0.0022 * s + 0.004 * flash },
      ...(flash > 0.01 && { flash: { color: '#dce9ff', strength: 0.5 * flash } })
    };
    if (flash > 0.01 && look.lighting) {
      // The strike lights the whole harbour for an instant.
      look.lighting = { ...look.lighting, ambient: '#9fb4e8' };
    }
    return look;
  }
}
