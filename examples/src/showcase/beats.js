import { advanceCycle, cycleLook } from 'm2d-engine/core/look.js';

/**
 * The showcase's programme: a loop of timed beats that put the engine's
 * frame-wide effects on show — the turn from dusk to night and back, a
 * camera shake, a zoom pulse, a roll, and a stretch of slow motion — over
 * a scene that is otherwise a steady stress test.
 *
 * Everything here is a function of the *unscaled* clock, so the programme
 * runs at the same pace on every backend and at any frame rate: two runs
 * compared side by side are at the same beat with the same workload, which
 * is what the showcase exists for. Slow motion is the one beat that bends
 * game time, and it bends it identically.
 *
 * A beat only ever sets renderer or camera state. Nothing here changes how
 * many primitives a layer draws, so the counters stay honest.
 */

/** The programme, in seconds from the top; it repeats at LOOP. */
const LOOP = 28;
const BEATS = [
  { at: 0, for: 7, name: 'drift' },
  { at: 7, for: 4, name: 'quake' },
  { at: 11, for: 5, name: 'close in' },
  { at: 16, for: 5, name: 'slow motion' },
  { at: 21, for: 7, name: 'roll' }
];

/**
 * The hours the scene turns through. Each is the look at one point in the
 * turn; the engine blends between them, and the post stack moves with the
 * light — more bloom and a colder grade at night, a warm wash at dawn.
 */
const HOURS = {
  period: 64,
  states: [
    {
      name: 'dusk',
      lighting: { ambient: '#4a4a74' },
      post: {
        bloom: { threshold: 0.72, strength: 0.55, blur: 30 },
        vignette: { strength: 0.38, start: 0.5 },
        grade: { shadows: '#2c3358', highlights: '#ffd9a8', amount: 0.35, saturation: 1.1, contrast: 1.04 },
        chromatic: { strength: 0.0012 },
        blur: { strength: 0 }
      }
    },
    {
      name: 'night',
      lighting: { ambient: '#2b3350' },
      post: {
        bloom: { threshold: 0.6, strength: 0.85, blur: 40 },
        vignette: { strength: 0.52, start: 0.4 },
        grade: { shadows: '#1b2448', highlights: '#bcd8ff', amount: 0.5, saturation: 0.95, contrast: 1.1 },
        chromatic: { strength: 0.0026 },
        blur: { strength: 0 }
      }
    },
    {
      name: 'first light',
      lighting: { ambient: '#6a6080' },
      post: {
        bloom: { threshold: 0.78, strength: 0.45, blur: 26 },
        vignette: { strength: 0.3, start: 0.55 },
        grade: { shadows: '#4a3f63', highlights: '#ffe8c4', amount: 0.3, saturation: 1.18, contrast: 1.02 },
        chromatic: { strength: 0.0008 },
        blur: { strength: 0 }
      }
    }
  ]
};

/** Eased 0→1→0 over a beat: everything here comes in and goes out. */
const swell = (t) => Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);

export class Beats {
  /** @param {import('m2d-engine/core/m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
    /** The programme's own clock: wall seconds, so a slow beat cannot slow the programme. */
    this.clock = 0;
    this.cycle = { ...HOURS, phase: 0, count: HOURS.states.length, target: 0 };
    /** What the camera is offset and turned by this frame, for the pan to add to. */
    this.offset = { x: 0, y: 0 };
    this.zoom = 1;
    this.rotation = 0;
    this.enabled = true;
  }

  /** Which beat is playing, and how far into it: 0 at its start, 1 at its end. */
  get beat() {
    const at = this.clock % LOOP;
    const beat = BEATS.find((b) => at >= b.at && at < b.at + b.for) ?? BEATS[0];
    return { name: beat.name, t: (at - beat.at) / beat.for };
  }

  /** The hour the light is at, for the HUD. */
  get hour() {
    return HOURS.states[Math.floor(this.cycle.phase) % HOURS.states.length].name;
  }

  /**
   * Advance the programme and work out what it asks of the frame.
   * @param {number} unscaled - Wall seconds since the last frame
   */
  update(unscaled) {
    if (!this.enabled) {
      this.offset = { x: 0, y: 0 };
      this.zoom = 1;
      this.rotation = 0;
      this.game.time.scale = 1;
      return;
    }
    this.clock += unscaled;
    this.cycle.phase = advanceCycle(this.cycle, unscaled);

    const { name, t } = this.beat;
    const swelling = swell(t);

    // A shake is two sines well off each other's frequency, so it reads as
    // a knock rather than a wobble, decaying across the beat.
    const shaking = name === 'quake' ? (1 - t) ** 2 : 0;
    this.offset = {
      x: Math.sin(this.clock * 61) * 26 * shaking,
      y: Math.sin(this.clock * 47 + 1.3) * 18 * shaking
    };
    this.zoom = name === 'close in' ? 1 + 0.45 * swelling : 1;
    this.rotation = name === 'roll' ? 0.07 * Math.sin(t * Math.PI * 2) : 0;
    this.game.time.scale = name === 'slow motion' ? 1 - 0.7 * swelling : 1;
  }

  /**
   * The light and the post stack at this point in the turn, with what the
   * beat playing adds to it: the world blurs as it slows, and a knock
   * splits the colour for as long as it rings.
   */
  look() {
    const look = cycleLook(this.cycle, this.cycle.phase);
    if (!this.enabled) return look;
    const { name, t } = this.beat;
    if (name === 'slow motion') {
      look.post = { ...look.post, blur: { strength: 0.55 * swell(t) } };
    } else if (name === 'quake') {
      const ring = (1 - t) ** 2;
      look.post = { ...look.post, chromatic: { strength: (look.post?.chromatic?.strength ?? 0) + 0.006 * ring } };
    }
    return look;
  }
}
