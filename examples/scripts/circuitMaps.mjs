/**
 * The five circuits, as the shapes they are seeded from.
 *
 * `scripts/buildCircuitScenes.mjs` runs this once and writes the roads
 * into `src/circuit/scenes/*.json` as closed smooth paths; nothing here
 * is loaded by the game.
 *
 * A map's road is a radial loop: control points on a distorted ellipse,
 * `radius(θ)` shaped by a few sine harmonics. Single-valued radius means
 * the loop can never cross itself, and scaling the whole thing tunes lap
 * length exactly — each map is normalised to its `targetLength`, so the
 * slowest map still takes over a minute to lap. Width has its own profile:
 * dips are the narrow streets, bulges the wide sweepers.
 *
 * Everything else — cones, barrels, oil, boosts, gates, traffic, lamps —
 * is authored per map as `{ t, o }`: lap fraction and offset from the
 * centreline (negative left, positive right). Difficulty rises map to map:
 * narrower pinches, sharper harmonics, more gates and traffic in the way.
 */
import { Track } from '../src/circuit/track.js';

/** Control points per loop. Plenty for smooth hairpins at this scale. */
const POINTS = 72;

/**
 * Build a Track from a radial description, scaled to `targetLength`.
 * @param {object} shape
 * @param {number} shape.squash - Ellipse b/a ratio
 * @param {Array<[k, amp, phase]>} shape.harmonics - Radius wobble
 * @param {(t: number) => number} shape.width - Half-width at lap fraction t
 * @param {number} targetLength - Lap length, px
 */
function radialTrack({ squash, harmonics, width }, targetLength) {
  const controls = [];
  for (let i = 0; i < POINTS; i++) {
    const t = i / POINTS;
    const theta = t * Math.PI * 2;
    let r = 1;
    for (const [k, amp, phase] of harmonics) r += amp * Math.sin(k * theta + phase);
    controls.push({
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r * squash,
      w: width(t)
    });
  }
  // Measure at unit scale, then scale to the target lap length.
  const unit = new Track(controls.map((p) => ({ ...p, x: p.x * 1000, y: p.y * 1000 })));
  const scale = targetLength / unit.length;
  const cx = 1000 * scale * 1.6;
  const cy = 1000 * scale * 1.35;
  return new Track(controls.map((p) => ({
    x: p.x * 1000 * scale + cx,
    y: p.y * 1000 * scale + cy,
    w: p.w
  })));
}

/** A cone line: `n` cones along the track from `t`, `spacing` px apart. */
function coneRow(t, o, n, spacing = 30) {
  return { t, o, n, spacing };
}

export const MAPS = [
  {
    name: 'circuit1',
    title: 'Sundown Ring',
    subtitle: 'wide and friendly · learn the car',
    seed: 101,
    targetLength: 26000,
    ambient: '#8a88a6',
    grade: { bloom: 0.5, vignette: 0.35, shadows: '#3a3f6a', highlights: '#ffe4c0', saturation: 1.3 },
    // Dusk over parkland: warm lamps, green verges, trees everywhere.
    theme: {
      ground: 'grass', asphalt: '#3d4254', worn: '#343a4b', shoulder: '#2e2823',
      lamp: '#ffd9a0', edge: 'rgba(232, 236, 245, 0.85)', dash: 'rgba(255, 211, 77, 0.75)',
      decor: { treeLarge: 90, treeSmall: 70, rock: 20, tent: 10, tribune: 4 },
      roadGrip: 1
    },
    shape: {
      squash: 0.74,
      harmonics: [[2, 0.1, 1.2], [3, 0.08, 0.4], [5, 0.035, 2.1]],
      width: (t) => 104 - 18 * Math.sin(t * Math.PI * 6)
    },
    checkpoints: [0.25, 0.5, 0.75],
    props: {
      cones: [coneRow(0.18, 40, 4), coneRow(0.52, -45, 4), coneRow(0.86, 0, 3, 36)],
      barrels: [{ t: 0.34, o: 70, n: 2 }, { t: 0.67, o: -75, n: 2 }],
      oil: [],
      boosts: [{ t: 0.08, o: 0 }, { t: 0.45, o: 0 }, { t: 0.78, o: 0 }],
      gates: [],
      traffic: []
    },
    lampEvery: 900
  },
  {
    name: 'circuit2',
    title: 'Riverside Run',
    subtitle: 'esses and a hairpin · mind the barrels',
    seed: 202,
    targetLength: 26800,
    ambient: '#8c8aa0',
    grade: { bloom: 0.55, vignette: 0.4, shadows: '#4a3a52', highlights: '#ffe7d0', saturation: 1.25 },
    // Sand flats under a violet sky: cool white lamps, dunes and rocks.
    theme: {
      ground: 'sand', asphalt: '#44464f', worn: '#3b3d47', shoulder: '#6a5a3e',
      lamp: '#e8f0ff', edge: 'rgba(240, 244, 255, 0.8)', dash: 'rgba(255, 255, 255, 0.55)',
      decor: { treeLarge: 20, treeSmall: 40, rock: 90, tent: 16, tribune: 3 },
      roadGrip: 1
    },
    shape: {
      squash: 0.8,
      harmonics: [[2, 0.12, 0.3], [4, 0.1, 1.7], [7, 0.04, 0.9]],
      width: (t) => 94 - 24 * Math.sin(t * Math.PI * 8 + 1)
    },
    checkpoints: [0.25, 0.5, 0.75],
    props: {
      cones: [coneRow(0.12, -50, 5), coneRow(0.41, 35, 5), coneRow(0.63, -30, 4), coneRow(0.9, 45, 4)],
      barrels: [
        { t: 0.22, o: -60, n: 3 }, { t: 0.48, o: 65, n: 2 },
        { t: 0.74, o: -55, n: 3 }
      ],
      oil: [{ t: 0.57, o: 20, r: 60 }],
      boosts: [{ t: 0.05, o: 0 }, { t: 0.35, o: 0 }, { t: 0.68, o: 0 }],
      gates: [{ t: 0.3 }],
      traffic: []
    },
    lampEvery: 820
  },
  {
    name: 'circuit3',
    title: 'Old Town Sprint',
    subtitle: 'narrow streets · gates and traffic',
    seed: 303,
    targetLength: 27600,
    ambient: '#7f7a8e',
    grade: { bloom: 0.65, vignette: 0.45, shadows: '#3d3448', highlights: '#ffd9a8', saturation: 1.2 },
    // Sodium-lit streets on packed dirt: amber everything, lamps every block.
    theme: {
      ground: 'dirt', asphalt: '#3a3838', worn: '#312f30', shoulder: '#4a3b2c',
      lamp: '#ffb347', edge: 'rgba(255, 240, 220, 0.8)', dash: 'rgba(255, 190, 90, 0.7)',
      decor: { treeLarge: 25, treeSmall: 35, rock: 25, tent: 30, tribune: 6 },
      roadGrip: 1
    },
    shape: {
      squash: 0.7,
      harmonics: [[3, 0.14, 0.8], [5, 0.09, 2.4], [8, 0.045, 0.2]],
      width: (t) => 82 - 26 * Math.sin(t * Math.PI * 10 + 2)
    },
    checkpoints: [0.25, 0.5, 0.75],
    props: {
      cones: [
        coneRow(0.08, 30, 5), coneRow(0.27, -40, 6), coneRow(0.5, 25, 5),
        coneRow(0.72, -35, 5), coneRow(0.93, 0, 4, 34)
      ],
      barrels: [
        { t: 0.16, o: 55, n: 3 }, { t: 0.38, o: -50, n: 3 },
        { t: 0.61, o: 50, n: 2 }, { t: 0.84, o: -55, n: 3 }
      ],
      oil: [{ t: 0.33, o: -15, r: 55 }, { t: 0.79, o: 25, r: 60 }],
      boosts: [{ t: 0.04, o: 0 }, { t: 0.44, o: 0 }, { t: 0.66, o: 0 }],
      gates: [{ t: 0.21 }, { t: 0.56 }],
      traffic: [{ t0: 0.68, t1: 0.88, o: -30, speed: 190 }]
    },
    lampEvery: 760
  },
  {
    name: 'circuit4',
    title: 'Switchyard',
    subtitle: 'hairpin ladder · keep the nitro for the straights',
    seed: 404,
    targetLength: 28500,
    ambient: '#6e7a94',
    grade: { bloom: 0.7, vignette: 0.48, shadows: '#243048', highlights: '#d8f0ff', saturation: 1.15 },
    // An industrial yard: cold blue-white floods, tyre walls, hardly a tree.
    theme: {
      ground: 'dirt', asphalt: '#3b4150', worn: '#323847', shoulder: '#3b3a3a',
      lamp: '#cfe6ff', edge: 'rgba(220, 235, 255, 0.85)', dash: 'rgba(120, 200, 255, 0.7)',
      decor: { treeLarge: 6, treeSmall: 12, rock: 60, tent: 4, tribune: 8 },
      roadGrip: 1
    },
    shape: {
      squash: 0.66,
      harmonics: [[3, 0.18, 2.6], [6, 0.13, 1.1], [9, 0.07, 1.8]],
      width: (t) => 76 - 24 * Math.sin(t * Math.PI * 12 + 0.5)
    },
    checkpoints: [0.25, 0.5, 0.75],
    props: {
      cones: [
        coneRow(0.1, -30, 6), coneRow(0.3, 40, 5), coneRow(0.47, -25, 6),
        coneRow(0.69, 30, 5), coneRow(0.88, -40, 5)
      ],
      barrels: [
        { t: 0.06, o: -50, n: 3 }, { t: 0.24, o: 45, n: 3 },
        { t: 0.52, o: -45, n: 4 }, { t: 0.76, o: 50, n: 3 }
      ],
      oil: [{ t: 0.18, o: 10, r: 55 }, { t: 0.42, o: -20, r: 60 }, { t: 0.95, o: 0, r: 65 }],
      boosts: [{ t: 0.02, o: 0 }, { t: 0.37, o: 0 }, { t: 0.6, o: 0 }, { t: 0.82, o: 0 }],
      gates: [{ t: 0.14 }, { t: 0.49 }, { t: 0.73 }],
      traffic: [
        { t0: 0.26, t1: 0.46, o: 28, speed: 200 },
        { t0: 0.78, t1: 0.97, o: -28, speed: 185 }
      ]
    },
    lampEvery: 720
  },
  {
    name: 'circuit5',
    title: 'Gauntlet GP',
    subtitle: 'everything at once · in the rain',
    seed: 505,
    targetLength: 30200,
    ambient: '#62667e',
    grade: { bloom: 0.75, vignette: 0.52, shadows: '#20283e', highlights: '#cfe0ff', saturation: 1.05 },
    // A storm: wet asphalt, mist drifting across the beams, less grip.
    theme: {
      ground: 'grass', asphalt: '#2f3446', worn: '#283040', shoulder: '#262a30',
      lamp: '#dbe4ff', edge: 'rgba(230, 238, 255, 0.9)', dash: 'rgba(200, 220, 255, 0.6)',
      decor: { treeLarge: 60, treeSmall: 50, rock: 40, tent: 6, tribune: 5 },
      roadGrip: 0.82,
      weather: { rain: 1, mist: 1 }
    },
    shape: {
      squash: 0.72,
      harmonics: [[2, 0.12, 1.9], [5, 0.15, 0.6], [7, 0.09, 2.9], [11, 0.05, 1.3]],
      width: (t) => 72 - 26 * Math.sin(t * Math.PI * 14 + 1.7)
    },
    checkpoints: [0.25, 0.5, 0.75],
    props: {
      cones: [
        coneRow(0.05, 25, 6), coneRow(0.2, -35, 6), coneRow(0.35, 30, 5),
        coneRow(0.55, -25, 7), coneRow(0.7, 35, 5), coneRow(0.9, -30, 6)
      ],
      barrels: [
        { t: 0.11, o: 50, n: 4 }, { t: 0.29, o: -45, n: 3 },
        { t: 0.45, o: 45, n: 4 }, { t: 0.63, o: -50, n: 3 },
        { t: 0.81, o: 45, n: 4 }
      ],
      oil: [
        { t: 0.08, o: -15, r: 55 }, { t: 0.4, o: 20, r: 60 },
        { t: 0.67, o: -10, r: 65 }, { t: 0.86, o: 15, r: 55 }
      ],
      boosts: [{ t: 0.01, o: 0 }, { t: 0.26, o: 0 }, { t: 0.52, o: 0 }, { t: 0.76, o: 0 }],
      gates: [{ t: 0.17 }, { t: 0.38 }, { t: 0.6 }, { t: 0.93 }],
      traffic: [
        { t0: 0.12, t1: 0.3, o: 26, speed: 205 },
        { t0: 0.46, t1: 0.64, o: -26, speed: 195 },
        { t0: 0.72, t1: 0.9, o: 24, speed: 210 }
      ]
    },
    lampEvery: 680
  }
];

/** Build (and cache) the Track for a map. */
const built = new Map();
export function trackFor(map) {
  if (!built.has(map.name)) {
    built.set(map.name, radialTrack(map.shape, map.targetLength));
  }
  return built.get(map.name);
}
