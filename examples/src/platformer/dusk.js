/**
 * The platformer's palette and terrain profile, shared between the menu
 * backdrop and the level.
 *
 * The menu promises a valley at dusk; the level has to keep that promise.
 * Everything that defines the hour — the sky grade, the ridge silhouettes,
 * the relief function that shapes them — lives here so the two scenes are
 * the same place and not two paintings that happen to share a title.
 */

/** Sky from zenith to horizon. The warm band is what sells the hour. */
export const SKY = [
  { offset: 0, color: '#040a12' },
  { offset: 0.42, color: '#0e2a44' },
  { offset: 0.7, color: '#4a3f57' },
  { offset: 0.86, color: '#a9653c' },
  { offset: 1, color: '#e9a865' }
];

/**
 * Ridges, far to near. `base` and `amp` are fractions of the reference
 * height, `freqs` are in radians per height so a screen width holds a few
 * peaks, `speed` is the menu's drift in UI units per second (the level uses
 * `parallax` instead). The farthest is `peaked`, a mountain line; the rest
 * roll. The two nearest carry a treeline, a ragged triangle wave of `trees`
 * height on top of the profile.
 */
export const RIDGES = [
  { base: 0.68, amp: 0.2, freqs: [7.5, 17, 39], speed: 2.5, parallax: 0.1, color: '#2c4a66', peaked: true },
  { base: 0.74, amp: 0.075, freqs: [5.2, 12, 27], speed: 6, parallax: 0.2, color: '#1a3049' },
  { base: 0.82, amp: 0.06, freqs: [4.1, 9.3, 21], speed: 12, parallax: 0.38, color: '#0d1b2b', trees: 0.02 },
  { base: 0.91, amp: 0.045, freqs: [3.2, 7.1, 16], speed: 21, parallax: 0.6, color: '#04090f', trees: 0.032 }
];

/**
 * Height of a ridge profile at `u`, in normalized horizontal units. The
 * ridge must carry `phases` (one per frequency) and, if it has trees,
 * `treePhase` — see `seedRidges`.
 *
 * @param {Object} ridge - One of `RIDGES`, seeded
 * @param {number} u - Horizontal position in units of `height`
 * @param {number} height - Reference height the fractions scale against
 * @returns {number} The profile's y at `u`
 */
export function ridgeProfile(ridge, u, height) {
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

/**
 * Copy the ridge set with phases rolled from `rng`, so no two ridges share
 * a silhouette but the same seed always builds the same valley.
 *
 * @param {() => number} rng - Seeded generator from `makeRng`
 * @returns {Array<Object>} Seeded copies of `RIDGES`
 */
export function seedRidges(rng) {
  return RIDGES.map((ridge) => ({
    ...ridge,
    phases: ridge.freqs.map(() => rng() * Math.PI * 2),
    treePhase: rng() * Math.PI * 2
  }));
}
