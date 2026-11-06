/**
 * Lays out Hollow Grove's scene JSON: `node scripts/buildGroveScene.mjs`.
 *
 * The map is authored here rather than by hand in JSON because a grove is
 * hundreds of placed things with a few rules between them — trees keep off
 * the paths and out of each other, lanterns sit beside the path, the
 * enchanted trees ring the clearing — and the rules are easier to read than
 * the coordinates they produce. The output is committed; the game loads
 * only the JSON. Nothing here draws: every sprite is a free, open texture
 * under `src/oblique/textures/` (see THIRD_PARTY_NOTICES.md).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 3200;
const H = 2400;

// A fixed sequence so a rebuild is the same grove.
let seed = 20261104;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const range = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];

/** The tree sheets: image size, and how tall each stands in the world. */
const TREES = {
  lime: { file: 'lime.png', w: 200, h: 215, scale: 1.35, trunk: 0.14 },
  oakA: { file: 'oak-a.png', w: 162, h: 188, scale: 1.5, trunk: 0.16 },
  oakB: { file: 'oak-b.png', w: 180, h: 230, scale: 1.35, trunk: 0.14 },
  goldA: { file: 'gold-a.png', w: 112, h: 169, scale: 1.5, trunk: 0.18 },
  goldB: { file: 'gold-b.png', w: 113, h: 175, scale: 1.45, trunk: 0.18 },
  elder: { file: 'elder.png', w: 220, h: 263, scale: 1.6, trunk: 0.2 },
  ember: { file: 'ember.png', w: 200, h: 215, scale: 1.4, trunk: 0.14 },
  violet: { file: 'violet.png', w: 149, h: 215, scale: 1.4, trunk: 0.14 },
  lilac: { file: 'lilac.png', w: 149, h: 215, scale: 1.35, trunk: 0.14 },
  dead: { file: 'dead.png', w: 162, h: 134, scale: 1.4, trunk: 0.12 }
};
const DECOR = {
  log: { file: 'log.png', w: 220, h: 150, scale: 0.8, footH: 0.3, footW: 0.7 },
  stump: { file: 'stump.png', w: 92, h: 115, scale: 0.9, footH: 0.3, footW: 0.5 }
};

/**
 * The character sheets are Flare's isometric hero and heroine (Clint
 * Bellanger, CC BY 3.0), layered into one sheet each: 128px frames, one
 * row per facing and the animations side by side in columns.
 */
// Flare's row order: W, NW, N, NE, E, SE, S, SW.
const FLARE_ROWS = ['left', 'up_left', 'up', 'up_right', 'right', 'down_right', 'down', 'down_left'];
const FLARE_COLUMNS = {
  idle: { from: 0, count: 4, fps: 5 },
  run: { from: 4, count: 8, fps: 14 },
  swing: { from: 12, count: 4, fps: 14, loop: false },
  hit: { from: 18, count: 2, fps: 8, loop: false },
  die: { from: 20, count: 4, fps: 8, loop: false },
  cast: { from: 24, count: 4, fps: 10, loop: false }
};
function flareAnimations() {
  const animations = {};
  FLARE_ROWS.forEach((direction, row) => {
    for (const [name, { from, count, fps, loop }] of Object.entries(FLARE_COLUMNS)) {
      const frames = Array.from({ length: count }, (_, i) => [from + i, row]);
      animations[`${name}_${direction}`] = loop === false ? { frames, fps, loop } : { frames, fps };
    }
  });
  animations.idle = animations.idle_down;
  animations.run = animations.run_down;
  return animations;
}
/** Drawn frame size for a character, and how far the figure's feet sit above the frame's bottom. */
const CHARACTER_FRAME = 250;
const CHARACTER_FEET = 0.22;

const spritesheets = {
  grass: { url: 'textures/grass.jpg', frameWidth: 512, frameHeight: 512 },
  ground: { url: 'textures/ground.jpg', frameWidth: 512, frameHeight: 512 },
  wanderer: { url: 'textures/characters/wanderer.png', frameWidth: 128, frameHeight: 128, animations: flareAnimations() },
  maren: { url: 'textures/characters/maren.png', frameWidth: 128, frameHeight: 128, animations: flareAnimations() },
  oswin: { url: 'textures/characters/oswin.png', frameWidth: 128, frameHeight: 128, animations: flareAnimations() }
};
const prefabs = {
  player: { actor: 'ObliquePlayer', spritesheet: 'wanderer', defaultAnimation: 'idle_down', physics: { bodyType: 'character', frictionAir: 0.2, footprint: { height: 18, width: 30 } } },
  wisp: { actor: 'Ghost', physics: { bodyType: 'dynamic', lockRotation: true, friction: 0.1, frictionAir: 0.2 } },
  lantern: { actor: 'Coin', physics: { bodyType: 'static', isSensor: true, footprint: { height: 16 } } },
  clearing: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } },
  maren: { actor: 'Npc', spritesheet: 'maren', defaultAnimation: 'idle_down', physics: { bodyType: 'static', footprint: { height: 16, width: 28 } } },
  oswin: { actor: 'Npc', spritesheet: 'oswin', defaultAnimation: 'idle_down', physics: { bodyType: 'static', footprint: { height: 16, width: 28 } } },
  pond: { actor: 'Pond', physics: { bodyType: 'static', shape: 'circle' } },
  bound: { actor: 'Bound', physics: { bodyType: 'static' } },
  groundDetail: { actor: 'GroundDetail', physics: { bodyType: 'static', isSensor: true } }
};
for (const [name, t] of Object.entries(TREES)) {
  spritesheets[`tree_${name}`] = { url: `textures/trees/${t.file}`, frameWidth: t.w, frameHeight: t.h };
  prefabs[`tree_${name}`] = {
    actor: 'Tree', spritesheet: `tree_${name}`,
    physics: { bodyType: 'static', footprint: { width: Math.round(t.w * t.scale * t.trunk), height: 22 } }
  };
}
for (const [name, d] of Object.entries(DECOR)) {
  spritesheets[`decor_${name}`] = { url: `textures/trees/${d.file}`, frameWidth: d.w, frameHeight: d.h };
  prefabs[`decor_${name}`] = {
    actor: 'Decor', spritesheet: `decor_${name}`,
    physics: { bodyType: 'static', footprint: { width: Math.round(d.w * d.scale * d.footW), height: Math.round(d.h * d.scale * d.footH) } }
  };
}

const objects = [];
const counts = new Map();
/** A stable id, readable in a diff: the prefab and its ordinal. */
const nextId = (prefab) => {
  const n = (counts.get(prefab) ?? 0) + 1;
  counts.set(prefab, n);
  return `${prefab}-${n}`;
};
function add(prefab, x, y, width, height, properties) {
  const o = { id: nextId(prefab), prefab, x: Math.round(x), y: Math.round(y) };
  if (width !== undefined) { o.width = Math.round(width); o.height = Math.round(height); }
  if (properties) o.properties = properties;
  objects.push(o);
  return o;
}

// === The places ===
const SPAWN = { x: 420, y: 2080 };
const MAREN = { x: 1120, y: 1500 };
const POND = { x: 1760, y: 1700, r: 170 };
const OSWIN = { x: 2420, y: 860 };
const CLEARING = { x: 2800, y: 330 };

// The path: spawn → Maren → around the pond → Oswin → the clearing. Points
// are hand-placed; the detail actor smooths and textures them.
const PATH = [
  { x: 420, y: 2160 }, { x: 560, y: 1980 }, { x: 760, y: 1800 }, { x: 980, y: 1640 },
  { x: MAREN.x + 60, y: MAREN.y + 80 }, { x: 1420, y: 1480 }, { x: 1620, y: 1440 },
  { x: 1900, y: 1420 }, { x: 2060, y: 1260 }, { x: 2200, y: 1060 }, { x: OSWIN.x - 70, y: OSWIN.y + 90 },
  { x: 2560, y: 700 }, { x: 2680, y: 520 }, { x: CLEARING.x, y: CLEARING.y + 70 }
];
const PATH_WIDTH = 64;

function distToPath(x, y) {
  let best = Infinity;
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
  }
  return best;
}
const placed = [];
const clear = (x, y, r) => placed.every(p => Math.hypot(p.x - x, p.y - y) > r + p.r);
const keepOut = [
  { ...SPAWN, r: 200 }, { ...MAREN, r: 170 }, { ...OSWIN, r: 170 }, { ...CLEARING, r: 260 }, { x: POND.x, y: POND.y, r: POND.r + 90 }
];
const open = (x, y) => keepOut.every(k => Math.hypot(k.x - x, k.y - y) > k.r);

function tree(kind, x, y) {
  const t = TREES[kind];
  const w = t.w * t.scale, h = t.h * t.scale;
  placed.push({ x, y, r: w * 0.28 });
  return add(`tree_${kind}`, x, y - h / 2, w, h, { seed: Math.floor(rand() * 1e6) });
}

// Ground detail first so it is drawn under everything at its zIndex.
add('groundDetail', W / 2, H / 2, 16, 16, { path: PATH, pathWidth: PATH_WIDTH, pond: POND, seed: 3 });

// Bounds: invisible walls, then a dense tree line just inside them.
const T = 48;
add('bound', W / 2, T / 2, W, T); add('bound', W / 2, H - T / 2, W, T);
add('bound', T / 2, H / 2, T, H); add('bound', W - T / 2, H / 2, T, H);
const EDGE_KINDS = ['oakA', 'oakB', 'lime', 'elder', 'oakA'];
for (let x = 90; x < W - 60; x += range(110, 150)) {
  tree(pick(EDGE_KINDS), x, 120 + range(-10, 40));
  tree(pick(EDGE_KINDS), x + range(-30, 30), H - range(10, 60));
}
for (let y = 260; y < H - 160; y += range(120, 160)) {
  tree(pick(EDGE_KINDS), 110 + range(-20, 40), y);
  tree(pick(EDGE_KINDS), W - 110 + range(-40, 20), y);
}

// Inner groves: clusters of mixed green, a gold stand near Oswin, embers by
// the pond, and the enchanted violets ringing the clearing.
const GROVES = [
  { x: 700, y: 900, r: 320, n: 14, kinds: ['oakA', 'oakB', 'lime', 'elder'] },
  { x: 1500, y: 600, r: 300, n: 12, kinds: ['oakA', 'lime', 'goldA', 'oakB'] },
  { x: 1300, y: 2050, r: 260, n: 10, kinds: ['oakB', 'oakA', 'elder'] },
  { x: 2200, y: 1700, r: 300, n: 11, kinds: ['goldA', 'goldB', 'oakA', 'ember'] },
  { x: 2700, y: 1300, r: 260, n: 9, kinds: ['goldB', 'goldA', 'lime'] },
  { x: 2050, y: 400, r: 220, n: 7, kinds: ['ember', 'oakB', 'goldA'] }
];
for (const g of GROVES) {
  let tries = 0;
  for (let i = 0; i < g.n && tries < 400; tries++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * g.r;
    const x = g.x + Math.cos(a) * d, y = g.y + Math.sin(a) * d;
    if (x < 220 || x > W - 220 || y < 260 || y > H - 160) continue;
    if (distToPath(x, y) < 130 || !open(x, y) || !clear(x, y, 60)) continue;
    tree(pick(g.kinds), x, y); i++;
  }
}
// Loose trees everywhere else, sparser.
for (let tries = 0, n = 0; n < 40 && tries < 3000; tries++) {
  const x = range(220, W - 220), y = range(280, H - 180);
  if (distToPath(x, y) < 150 || !open(x, y) || !clear(x, y, 110)) continue;
  tree(pick(['oakA', 'oakB', 'lime', 'goldA', 'elder', 'oakA']), x, y); n++;
}
// The enchanted ring, and dead trees on the approach to it.
for (let i = 0; i < 9; i++) {
  const a = -0.2 + i * 0.36 + range(-0.08, 0.08);
  const x = CLEARING.x + Math.cos(a) * range(250, 300), y = CLEARING.y + Math.sin(a) * range(200, 240);
  if (x < 200 || x > W - 200 || y < 200) continue;
  if (distToPath(x, y) < 110) continue;
  tree(i % 2 ? 'violet' : 'lilac', x, y);
}
for (const [x, y] of [[2500, 560], [2640, 880], [2330, 600], [2880, 760]]) {
  if (distToPath(x, y) > 110 && clear(x, y, 60)) tree('dead', x, y);
}

// Decor: logs and stumps beside the path and in the groves.
for (let tries = 0, n = 0; n < 14 && tries < 2000; tries++) {
  const x = range(240, W - 240), y = range(300, H - 200);
  const d = distToPath(x, y);
  if (d < 70 || d > 260 || !open(x, y) || !clear(x, y, 70)) continue;
  const kind = rand() < 0.4 ? 'log' : 'stump';
  const dd = DECOR[kind];
  const w = dd.w * dd.scale, h = dd.h * dd.scale;
  placed.push({ x, y, r: w * 0.3 });
  add(`decor_${kind}`, x, y - h / 2, w, h); n++;
}

// The pond, the two to talk to, and the clearing.
add('pond', POND.x, POND.y, POND.r * 2, POND.r * 2);
// A character's object is its drawn frame; the body is the footprint at the
// bottom of it, and the sprite is shifted down so the figure's feet meet it.
const npcProps = (who, facing) => ({ who, facing, spriteOffsetY: Math.round(CHARACTER_FRAME * CHARACTER_FEET) });
add('maren', MAREN.x, MAREN.y - CHARACTER_FRAME / 2, CHARACTER_FRAME, CHARACTER_FRAME, npcProps('maren', Math.PI * 0.25));
add('oswin', OSWIN.x, OSWIN.y - CHARACTER_FRAME / 2, CHARACTER_FRAME, CHARACTER_FRAME, npcProps('oswin', Math.PI * 0.75));
add('clearing', CLEARING.x, CLEARING.y, 220, 170, { visible: true, triggers: 'levelComplete', active: true });

// Lanterns along the path, one every so often, set just off it.
for (let i = 1; i < PATH.length - 1; i += 2) {
  const a = PATH[i], b = PATH[i + 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const side = i % 4 === 1 ? 1 : -1;
  add('lantern', a.x + nx * side * 70, a.y + ny * side * 70, 28, 56);
}
// Wisps haunt the groves away from the start.
for (const [x, y] of [[1500, 700], [2200, 1600], [700, 800], [2700, 1250], [1300, 1950], [2050, 450]]) {
  add('wisp', x, y, 40, 40);
}
add('player', SPAWN.x, SPAWN.y - CHARACTER_FRAME / 2, CHARACTER_FRAME, CHARACTER_FRAME, { spriteOffsetY: Math.round(CHARACTER_FRAME * CHARACTER_FEET) });

const scene = {
  version: 2, name: 'grove', type: 'level', gameType: 'oblique',
  world: { width: W, height: H, gravity: { x: 0, y: 0 }, sort: 'depth' },
  assets: { spritesheets },
  tileLayers: [{ name: 'ground', spritesheet: 'grass', zIndex: -1 }],
  prefabs,
  layers: [{ name: 'grove', type: 'objects', objects }]
};
const out = fileURLToPath(new URL('../src/oblique/scenes/grove.json', import.meta.url));
writeFileSync(out, JSON.stringify(scene, null, 2) + '\n');
console.log(`grove: ${objects.length} objects → ${out}`);
