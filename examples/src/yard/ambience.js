/**
 * The yard's sound, built in code and kept quiet: a breath of wind that
 * never stops, and the fox's footfalls on dry ground.
 *
 * Generated rather than sampled, as the circuit's motor is (see
 * `circuit/evSound.js`): the shared sample set is interface tones, and
 * what a yard needs is texture, which filtered noise does better than any
 * short clip. Everything is rendered once into WAV data URLs and played
 * through `game.soundManager`, so the Audio setting and the sound volume
 * apply as they do everywhere else.
 *
 * - **wind** — a twelve-second loop of low-passed noise whose cutoff and
 *   level drift under two slow, incommensurate cycles, so gusts come and
 *   go without the loop announcing itself. Its gain is faded in over the
 *   first seconds so a page does not open on a gust.
 * - **steps** — four short bursts of band-passed noise with a soft attack
 *   and a quick fall, the dry scuff of a paw on earth. The hero plays one
 *   each stride while it moves on the ground, picking a different one
 *   each time so a run is not a metronome.
 */

const SAMPLE_RATE = 22050;

/** A seeded generator, so the sound is the same every load. */
function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
}

function wavDataUrl(samples) {
  const frames = samples.length;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Twelve seconds of wind: brown-ish noise through a drifting one-pole low-pass, with a drifting level. */
function wind() {
  const seconds = 12;
  const frames = SAMPLE_RATE * seconds;
  const out = new Float32Array(frames);
  const rand = noise(7);
  let brown = 0;
  let low = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    // Two slow cycles, whole numbers per loop so the seam is quiet: a
    // gust every four seconds and a longer swell every twelve.
    const gust = 0.5 + 0.5 * Math.sin(t / seconds * Math.PI * 2 * 3 + 1.2);
    const swell = 0.5 + 0.5 * Math.sin(t / seconds * Math.PI * 2);
    brown = brown * 0.98 + rand() * 0.06;
    // The cutoff rises with the gust: a gust is brighter as well as louder.
    const k = 0.012 + 0.03 * gust;
    low += (brown - low) * k;
    out[i] = low * (0.35 + 0.65 * (0.4 * gust + 0.6 * swell)) * 2.2;
  }
  return wavDataUrl(out);
}

/** One footfall: a few hundred milliseconds of band-passed noise, soft in, quick out. */
function step(seed, tone) {
  const frames = Math.round(SAMPLE_RATE * 0.22);
  const out = new Float32Array(frames);
  const rand = noise(seed);
  let low = 0;
  let lower = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const env = Math.min(1, t * 18) * Math.exp(-t * 11);
    const n = rand();
    low += (n - low) * tone;
    lower += (low - lower) * 0.06;
    out[i] = (low - lower) * env * 0.9;
  }
  return wavDataUrl(out);
}

/** Load the yard's sounds into the manager. Call once, before the scene plays them. */
export function loadAmbience(soundManager) {
  soundManager.loadSound('wind', { src: wind(), volume: 0.5 });
  [[11, 0.22], [23, 0.27], [37, 0.19], [53, 0.25]].forEach(([seed, tone], i) => {
    soundManager.loadSound(`step${i}`, { src: step(seed, tone), volume: 0.45 });
  });
}

/**
 * The yard's footsteps: call `update` each frame with the hero's ground
 * speed and whether it stands on anything; a step sounds every stride.
 */
export class Footsteps {
  constructor(soundManager) {
    this.soundManager = soundManager;
    this.phase = 0;
    this.last = -1;
  }

  update(deltaTime, speed, grounded) {
    if (!grounded || speed < 0.3) { this.phase = 0.6; return; }
    // A stride every 0.55 m at a walk, shorter as the pace picks up.
    this.phase += deltaTime * speed / Math.max(0.55, 1.1 - speed * 0.1);
    if (this.phase < 1) return;
    this.phase -= 1;
    let pick = Math.floor(Math.random() * 4);
    if (pick === this.last) pick = (pick + 1) % 4;
    this.last = pick;
    this.soundManager.playSound(`step${pick}`);
  }
}
