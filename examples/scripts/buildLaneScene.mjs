/**
 * Lays out Beeline's lane: `node scripts/buildLaneScene.mjs`.
 *
 * The auto-scroller rule (docs/contributing/determinism.md) is that
 * nothing is spawned against the camera: every flower, grain, thistle,
 * wasp and web is placed ahead of time, and the simulation only asks
 * where the scroll front is. That used to mean building the lane from its
 * seed at boot; now the seed runs here, once, and the JSON is the lane —
 * the editor opens it, a server reads it, a person can move a grain.
 *
 * Every silhouette is a free, open asset under `src/scroller/textures/`
 * (see THIRD_PARTY_NOTICES.md).
 */
import { writeFileSync } from 'node:fs';
import { writeScene } from 'm2d-editor-core';
import { seedTarget } from './seedScene.mjs';
import { LENGTH, HEIGHT, SPEED, buildMeadow } from '../src/scroller/meadow.js';

// A seed: writes the scene only when it is not there; see seedScene.mjs.
const out = seedTarget(new URL('../src/scroller/scenes/lane.json', import.meta.url));

const meadow = buildMeadow();

const objects = [];
const counts = new Map();
/** A stable id, readable in a diff: the prefab and its ordinal. */
const nextId = (prefab) => {
  const n = (counts.get(prefab) ?? 0) + 1;
  counts.set(prefab, n);
  return `${prefab}-${n}`;
};
const round = (n) => Math.round(n * 100) / 100;
const add = (prefab, x, y, width, height, properties) => {
  const o = { id: nextId(prefab), prefab, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  if (properties) o.properties = properties;
  objects.push(o);
};

/** The silhouettes each parallax plane is populated from. */
const PLANES = {
  trees: ['tree-a', 'tree-b', 'tree-c'],
  far: ['far-grass-a', 'far-grass-b', 'far-bush'],
  mid: ['mid-grass-a', 'mid-grass-b', 'mid-flowers', 'mid-sprouts'],
  verge: ['play-grass-a', 'play-grass-b', 'play-grass-c'],
  fore: ['fore-grass-a', 'fore-grass-b', 'fore-bush']
};
const { fore, ...behind } = PLANES;

// The painted lane: the planes behind, the grass the lane is seen
// through in front, and the window the simulation believes in.
add('meadow', LENGTH / 2, HEIGHT / 2, 16, 16, behind);
add('foreMeadow', LENGTH / 2, HEIGHT / 2, 16, 16, { fore });
add('front', 480, HEIGHT / 2, 16, 16);

for (const f of meadow.flowers) add(f.sprite, f.x, HEIGHT - f.h / 2, f.w, f.h, { sway: round(f.sway) });
for (const b of meadow.thistles) add(b.sprite, b.x, b.y, b.size * 0.58, b.size * 0.58, { sway: round(b.sway) });
for (const w of meadow.webs) add('web', w.x, w.y, w.w, w.h, { sway: round(w.sway) });
for (const p of meadow.pollen) add('pollen', p.x, p.y, 26, 26);
for (const w of meadow.wasps) {
  add('wasp', w.x, w.y, 32, 20,
    { amp: round(w.amp), rate: round(w.rate), drift: round(w.drift), phase: round(w.phase) });
}
add('hive', meadow.hive.x, meadow.hive.y, 70, 110);
add('player', 220, HEIGHT / 2, 32, 24);

/** The six flower and bramble sheets, each one silhouette. */
const FOLIAGE = ['flowerballs', 'seedheads', 'flowerspikes', 'cattails', 'bramble-a', 'bramble-b'];
/** The scenery silhouettes, loaded whole: the planes name them by key. */
const SCENERY = Object.values(PLANES).flat();

const sensor = { bodyType: 'static', isSensor: true };
const flower = (sheet) => ({ actor: 'Flower', spritesheet: sheet, physics: sensor });
const bramble = (sheet) => ({ actor: 'Thistle', spritesheet: sheet, physics: sensor });

/**
 * The sun goes down over the length of the lane, as three looks the
 * engine blends between. A cycle turns through all of its states in
 * `period` seconds, so the phase reaches the last one — dusk, with the
 * hive lit — exactly as the lane runs out.
 */
const RUN_SECONDS = LENGTH / SPEED;
const SKY_PERIOD = Math.round((3 * RUN_SECONDS) / 2);

const scene = {
  version: 4,
  name: 'lane',
  type: 'level',
  gameType: 'autoScroller',
  title: 'The lane',
  world: {
    width: LENGTH,
    height: HEIGHT,
    gravity: { x: 0, y: 0 },
    player: 'player-1',
    // The view travels at the window's pace; the ScrollFront mirrors it
    // in the simulation, which never reads the camera.
    camera: { mode: 'scroll', scrollVelocity: { x: SPEED, y: 0 }, bounds: 'world' },
    lighting: { ambient: '#fff8e8' },
    post: {
      bloom: { threshold: 0.8, strength: 0.45, blur: 20 },
      vignette: { strength: 0.12, start: 0.66 },
      grade: { shadows: '#9a9a6e', highlights: '#fff6da', amount: 0.32, saturation: 1.08, contrast: 1.02 },
      grain: { strength: 0.03 }
    },
    cycle: {
      period: SKY_PERIOD,
      states: [
        { name: 'afternoon', lighting: { ambient: '#fff8e8' } },
        {
          name: 'sundown',
          lighting: { ambient: '#f3dcd8' },
          post: {
            bloom: { threshold: 0.72, strength: 0.55, blur: 24 },
            vignette: { strength: 0.16, start: 0.62 },
            grade: { shadows: '#7a6a8a', highlights: '#ffdcae', amount: 0.4, saturation: 1.12, contrast: 1.04 },
            grain: { strength: 0.035 }
          }
        },
        {
          name: 'dusk',
          lighting: { ambient: '#d6c4ea' },
          post: {
            bloom: { threshold: 0.6, strength: 0.7, blur: 26 },
            vignette: { strength: 0.2, start: 0.58 },
            grade: { shadows: '#4e4a7a', highlights: '#ffc994', amount: 0.45, saturation: 1.08, contrast: 1.05 },
            grain: { strength: 0.04 }
          }
        }
      ]
    },
    music: { track: 'game' },
    counters: { total: { prefab: 'pollen', count: 'placed' } },
    rules: [
      {
        id: 'brief',
        when: { event: 'start' },
        then: [
          { do: 'notice', text: 'Reach the hive before dark', seconds: 3.6 },
          { do: 'notice', element: 'sub', text: 'chain the pollen — the combo keeps the score climbing', seconds: 3.6 }
        ]
      },
      {
        id: 'home',
        when: { event: 'notify', name: 'arrived' },
        then: [
          { do: 'sound', key: 'arrived' },
          { do: 'switch', scene: 'mainMenu', after: 5 }
        ]
      },
      {
        id: 'menu',
        when: { event: 'action', action: 'menu' },
        then: [{ do: 'switch', scene: 'mainMenu' }]
      }
    ]
  },
  assets: {
    spritesheets: Object.fromEntries(FOLIAGE.map((name) =>
      [name, { url: `textures/foliage/${name}.png`, frameWidth: 256, frameHeight: 256 }])),
    images: Object.fromEntries(SCENERY.map((name) => [name, { url: `textures/foliage/${name}.png` }])),
    sounds: {
      collect: { url: 'sounds/confirmation_001.ogg', volume: 0.45 },
      damage: { url: 'sounds/error_008.ogg' },
      dash: { url: 'sounds/bong_001.ogg', volume: 0.5 },
      web: { url: 'sounds/minimize_006.ogg', volume: 0.5 },
      tear: { url: 'sounds/minimize_008.ogg', volume: 0.6 },
      arrived: { url: 'sounds/maximize_008.ogg' }
    },
    music: { game: { url: 'music/theget-perfect-union.ogg', volume: 0.6 } }
  },
  prefabs: {
    meadow: { actor: 'Meadow', physics: sensor },
    foreMeadow: { actor: 'ForeMeadow', physics: sensor },
    front: { actor: 'ScrollFront', physics: sensor },
    player: { actor: 'Bee', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, frictionAir: 0.05 } },
    flowerballs: flower('flowerballs'),
    seedheads: flower('seedheads'),
    flowerspikes: flower('flowerspikes'),
    cattails: flower('cattails'),
    pollen: { actor: 'Pollen', physics: sensor },
    'bramble-a': bramble('bramble-a'),
    'bramble-b': bramble('bramble-b'),
    wasp: { actor: 'Wasp', physics: sensor },
    web: { actor: 'Web', physics: sensor },
    hive: { actor: 'Hive', physics: sensor }
  },
  layers: [{ name: 'lane', objects }],
  hud: [
    {
      type: 'component',
      id: 'status',
      component: 'beeStatus',
      x: 0,
      y: 0,
      anchor: 'top-left',
      properties: {
        totalCounter: 'total',
        hint: 'Arrows fly · Space dashes — through danger, out of webs · wasps raise a mark before they strike'
      }
    },
    {
      type: 'notice',
      id: 'notice',
      x: 0,
      y: -120,
      anchor: 'center',
      properties: {
        fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#fff3d6',
        outlineColor: 'rgba(70, 30, 0, 0.6)', outlineWidth: 3
      }
    },
    {
      type: 'notice',
      id: 'sub',
      x: 0,
      y: -84,
      anchor: 'center',
      properties: {
        fontSize: '16px', letterSpacing: 2, color: '#ffe2ae',
        outlineColor: 'rgba(70, 30, 0, 0.5)', outlineWidth: 2
      }
    }
  ]
};

writeFileSync(out, writeScene(scene));
console.log(`lane: ${objects.length} objects, ${meadow.pollen.length} pollen → ${out}`);
