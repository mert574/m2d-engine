/**
 * The car's voice, built in code: an electric motor and the road under it.
 *
 * The one sound in the demos that is generated rather than sampled, on
 * purpose: an EV's note is a stack of near-pure tones that must slide
 * smoothly with speed, and a seamless loop pitched by playback rate tracks
 * the car better than any recording would.
 *
 * Two loops, mixed by the car each frame:
 *
 * - **motor** — the harmonic stack, pitched with speed. Every partial comes
 *   as a *pair* a few cycles apart, so the pairs beat slowly against each
 *   other and the tone shimmers instead of sitting on one dead note; a
 *   soft sub-octave gives it a floor and a faint inverter whine a ceiling.
 * - **road** — filtered noise, unpitched, rising with speed: the tyre roar
 *   and wind that give the whine something to sit in.
 *
 * Both loops are long (eight seconds) so the element's loop seam comes
 * round rarely, and every partial completes a whole number of cycles in
 * the loop, so the seam itself is silent. Nothing modulates the loop in
 * time: at double rate a tremolo would become a siren.
 */

const SAMPLE_RATE = 22050;
const SECONDS = 8;

/**
 * Motor partials as [cycles per loop, amplitude]. At rate 1 the
 * fundamental is 100 cycles / 8 s = 12.5 Hz × 8 = 100 Hz. Each order has a
 * twin a few cycles away: the detune is the chorus.
 */
const MOTOR = [
  [400, 0.30], [403, 0.22],       // fundamental pair, ~0.4 Hz beat
  [800, 0.18], [806, 0.12],       // second order
  [1200, 0.09], [1207, 0.06],     // third
  [1600, 0.05], [1609, 0.035],    // fourth
  [200, 0.16],                    // sub-octave floor
  [7200, 0.025], [7211, 0.018]    // inverter whine, barely there
];

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
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 30000), true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** The motor whine. @returns {string} A data URL of a seamless WAV. */
export function evMotorLoop() {
  const frames = SAMPLE_RATE * SECONDS;
  const out = new Float32Array(frames);
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    let sample = 0;
    for (const [cycles, amplitude] of MOTOR) sample += Math.sin(2 * Math.PI * cycles * t) * amplitude;
    out[i] = sample;
    if (Math.abs(sample) > peak) peak = Math.abs(sample);
  }
  for (let i = 0; i < frames; i++) out[i] = (out[i] / peak) * 0.85;
  return wavDataUrl(out);
}

/**
 * Road and wind: low-passed noise with a slow, loop-safe swell so it is
 * not a flat hiss. Seeded, so the loop is the same every load.
 */
export function roadNoiseLoop() {
  const frames = SAMPLE_RATE * SECONDS;
  const out = new Float32Array(frames);
  let state = 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
  // Two one-pole low-passes in series: a brown, roaring noise rather than
  // a hiss. Primed for a second so the loop start carries no transient.
  let a = 0;
  let b = 0;
  for (let i = 0; i < SAMPLE_RATE; i++) { a += 0.08 * (next() - a); b += 0.08 * (a - b); }
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    a += 0.08 * (next() - a);
    b += 0.08 * (a - b);
    const t = i / frames;
    // Whole-cycle swells (3 and 5 per loop): seamless, never periodic enough to hear.
    const swell = 0.8 + 0.12 * Math.sin(2 * Math.PI * 3 * t) + 0.08 * Math.sin(2 * Math.PI * 5 * t + 1);
    out[i] = b * swell;
    if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
  }
  // The seam: the noise does not repeat, so cross-fade the last 50 ms into
  // the first so the join is inaudible.
  const fade = Math.round(SAMPLE_RATE * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    const tail = frames - fade + i;
    out[tail] = out[tail] * (1 - k) + out[i] * k;
  }
  for (let i = 0; i < frames; i++) out[i] = (out[i] / peak) * 0.8;
  return wavDataUrl(out);
}
