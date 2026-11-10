/**
 * Lays out Salvage Run's scene JSON: `node scripts/buildDriftScene.mjs`.
 *
 * An asteroid field seen straight down, with the camera turning to keep
 * the ship's nose up the screen. Meteors are placed in drifting bands with
 * clear lanes between them, salvage pods along the lanes, drones near the
 * pods they guard, and the jump gate at the far side. Every sprite is from
 * Kenney's Space Shooter Redux (CC0); see THIRD_PARTY_NOTICES.md.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeScene } from 'm2d-editor-core';

const W = 7000;
const H = 7000;
let seed = 7001;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const range = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];

/** Meteor sprites: file, drawn size, and the mass class that decides how they split. */
const METEORS = {
  brownBig1: { file: 'meteors/brown-big1.png', w: 101, h: 84, size: 'big' },
  brownBig3: { file: 'meteors/brown-big3.png', w: 89, h: 82, size: 'big' },
  greyBig2: { file: 'meteors/grey-big2.png', w: 120, h: 98, size: 'big' },
  brownMed1: { file: 'meteors/brown-med1.png', w: 43, h: 43, size: 'med' },
  greyMed2: { file: 'meteors/grey-med2.png', w: 45, h: 40, size: 'med' },
  brownSmall1: { file: 'meteors/brown-small1.png', w: 28, h: 28, size: 'small' },
  greySmall2: { file: 'meteors/grey-small2.png', w: 29, h: 26, size: 'small' }
};
const SCALE = { big: 1.7, med: 1.6, small: 1.5 };

const spritesheets = {
  starsFar: { url: 'textures/backgrounds/stars-far.png', frameWidth: 256, frameHeight: 256 },
  star1: { url: 'textures/effects/star1.png', frameWidth: 25, frameHeight: 24 },
  star2: { url: 'textures/effects/star2.png', frameWidth: 25, frameHeight: 24 },
  star3: { url: 'textures/effects/star3.png', frameWidth: 24, frameHeight: 24 },
  player: { url: 'textures/ships/player.png', frameWidth: 112, frameHeight: 75 },
  droneRed: { url: 'textures/ships/drone-red.png', frameWidth: 93, frameHeight: 84 },
  droneBlack: { url: 'textures/ships/drone-black.png', frameWidth: 103, frameHeight: 84 },
  salvage: { url: 'textures/pickups/salvage.png', frameWidth: 19, frameHeight: 30 },
  beacon: { url: 'textures/pickups/beacon.png', frameWidth: 34, frameHeight: 33 }
};
const prefabs = {
  player: { actor: 'Ship', spritesheet: 'player', physics: { bodyType: 'dynamic', shape: 'circle', friction: 0.1, frictionAir: 0, restitution: 0.4 } },
  droneRed: { actor: 'Drone', spritesheet: 'droneRed', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, frictionAir: 0.3 } },
  droneBlack: { actor: 'Drone', spritesheet: 'droneBlack', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, frictionAir: 0.3 } },
  salvage: { actor: 'Salvage', spritesheet: 'salvage', physics: { bodyType: 'static', isSensor: true, shape: 'circle' } },
  gate: { actor: 'Gate', spritesheet: 'beacon', physics: { bodyType: 'static', isSensor: true, shape: 'circle' } },
  bound: { actor: 'Bound', physics: { bodyType: 'static', restitution: 0.6 } },
  sky: { actor: 'Sky', physics: { bodyType: 'static', isSensor: true } }
};
for (const [name, m] of Object.entries(METEORS)) {
  spritesheets[name] = { url: 'textures/' + m.file, frameWidth: m.w, frameHeight: m.h };
  prefabs[name] = { actor: 'Meteor', spritesheet: name, physics: { bodyType: 'dynamic', shape: 'circle', friction: 0.2, frictionAir: 0, restitution: 0.7 } };
}

const objects = [];
const counts = new Map();
/** A stable id, readable in a diff: the prefab and its ordinal. */
const nextId = (prefab) => {
  const n = (counts.get(prefab) ?? 0) + 1;
  counts.set(prefab, n);
  return `${prefab}-${n}`;
};
const add = (prefab, x, y, width, height, properties) => {
  const o = { id: nextId(prefab), prefab, x: Math.round(x), y: Math.round(y) };
  if (width !== undefined) { o.width = Math.round(width); o.height = Math.round(height); }
  if (properties) o.properties = properties;
  objects.push(o);
};

// The sky: nebulae and near stars above the star tile, at their own depths.
add('sky', W / 2, H / 2, 16, 16, { seed: 5 });
const T = 200;
add('bound', W / 2, -T / 2, W + 2 * T, T); add('bound', W / 2, H + T / 2, W + 2 * T, T);
add('bound', -T / 2, H / 2, T, H + 2 * T); add('bound', W + T / 2, H / 2, T, H + 2 * T);

const START = { x: 700, y: H - 700 };
const GATE = { x: W - 800, y: 800 };
// Three salvage routes, each a bezier-ish chain of waypoints from start to gate.
const routes = [
  [START, { x: 1800, y: 5600 }, { x: 3200, y: 4600 }, { x: 4400, y: 3200 }, { x: 5600, y: 1800 }, GATE],
  [START, { x: 1200, y: 4200 }, { x: 1800, y: 2600 }, { x: 3000, y: 1500 }, { x: 4800, y: 1100 }, GATE],
  [START, { x: 2400, y: 6200 }, { x: 4200, y: 5800 }, { x: 5600, y: 4400 }, { x: 6200, y: 2800 }, GATE]
];
const pods = [];
for (const route of routes) {
  for (let i = 1; i < route.length - 1; i++) {
    const p = route[i];
    pods.push({ x: p.x + range(-120, 120), y: p.y + range(-120, 120) });
  }
}
const distToRoutes = (x, y) => {
  let best = Infinity;
  for (const route of routes) for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
  }
  return best;
};

// Meteors: dense off the routes, sparse on them, none near start or gate.
const placed = [];
const kinds = Object.entries(METEORS);
for (let tries = 0, n = 0; n < 260 && tries < 20000; tries++) {
  const x = range(250, W - 250), y = range(250, H - 250);
  if (Math.hypot(x - START.x, y - START.y) < 700 || Math.hypot(x - GATE.x, y - GATE.y) < 600) continue;
  const lane = distToRoutes(x, y);
  if (lane < 260 && rand() < 0.85) continue;
  const [name, m] = pick(kinds);
  const r = Math.max(m.w, m.h) * SCALE[m.size] / 2;
  if (placed.some(p => Math.hypot(p.x - x, p.y - y) < r + p.r + 60)) continue;
  placed.push({ x, y, r });
  const d = Math.max(m.w, m.h) * SCALE[m.size];
  add(name, x, y, d, d, { spin: range(-0.6, 0.6), drift: [range(-18, 18), range(-18, 18)] });
  n++;
}
for (const p of pods) add('salvage', p.x, p.y, 44, 44);
// Drones guard the middle of each route and roam near the gate.
for (const route of routes) {
  const g = route[Math.floor(route.length / 2)];
  add('droneRed', g.x + range(-300, 300), g.y + range(-300, 300), 56, 56);
}
add('droneBlack', GATE.x - 500, GATE.y + 300, 64, 64);
add('droneBlack', GATE.x + 200, GATE.y + 600, 64, 64);
add('droneRed', W / 2 + 400, H / 2 - 300, 56, 56);
add('gate', GATE.x, GATE.y, 220, 220, { visible: true, triggers: 'levelComplete', active: true });
add('player', START.x, START.y, 60, 60);

const scene = {
  version: 2, name: 'field', type: 'level', generator: 'scripts/buildDriftScene.mjs', gameType: 'rotatingTopDown',
  world: { width: W, height: H, gravity: { x: 0, y: 0 }, sort: 'depth' },
  assets: { spritesheets },
  // The far star field, barely moving; the Sky entity draws the nearer
  // stars and the nebulae over it at their own parallax.
  tileLayers: [{ name: 'starsFar', spritesheet: 'starsFar', zIndex: -3, parallax: 0.12 }],
  prefabs,
  layers: [{ name: 'field', type: 'objects', objects }]
};
const out = fileURLToPath(new URL('../src/drift/scenes/field.json', import.meta.url));
writeFileSync(out, writeScene(scene));
writeFileSync(fileURLToPath(new URL('../src/drift/layout.json', import.meta.url)), JSON.stringify({ world: { width: W, height: H }, start: START, gate: GATE, pods: pods.length }, null, 2) + '\n');
console.log(`field: ${objects.length} objects, ${placed.length} meteors, ${pods.length} pods → ${out}`);
