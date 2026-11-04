/**
 * Lays out Cinder Keep's scene JSON: `node scripts/buildKeepScene.mjs`.
 *
 * An isometric dungeon on a tile grid: rooms joined by corridors, carved
 * from solid rock. Every tile that borders the carved space becomes a wall
 * block; torches hang on the blocks whose lit faces the player can see;
 * embers, the keep's dead and the stair down are placed by room. The
 * output is committed; the game loads only the JSON. Every sprite is a
 * free, open asset under `src/iso/textures/` (see THIRD_PARTY_NOTICES.md).
 *
 * Coordinates are on the ground plane: a tile is TILE by TILE ground units,
 * drawn through the scene's isometric projection as a 128 by 64 diamond.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TILE = 64;
const COLS = 64;
const ROWS = 48;
const W = COLS * TILE;
const H = ROWS * TILE;

let seed = 11042026;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const range = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];

/** Rooms in tiles: x, y, w, h. The first is the start, the last holds the stair. */
const ROOMS = [
  { x: 3, y: 38, w: 7, h: 6, name: 'gate' },
  { x: 13, y: 32, w: 9, h: 8, name: 'hall' },
  { x: 6, y: 20, w: 7, h: 7, name: 'well' },
  { x: 17, y: 16, w: 11, h: 8, name: 'barracks' },
  { x: 28, y: 30, w: 10, h: 10, name: 'vault' },
  { x: 8, y: 6, w: 9, h: 7, name: 'crypt' },
  { x: 32, y: 6, w: 12, h: 9, name: 'armoury' },
  { x: 42, y: 22, w: 8, h: 8, name: 'cistern' },
  { x: 48, y: 36, w: 9, h: 7, name: 'ossuary' },
  { x: 54, y: 10, w: 7, h: 7, name: 'stair' }
];
const LINKS = [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5], [3, 6], [4, 7], [6, 7], [4, 8], [7, 9], [8, 9], [5, 3]];

const floor = new Set();
const key = (i, j) => `${i},${j}`;
const carve = (i, j) => { if (i > 0 && j > 0 && i < COLS - 1 && j < ROWS - 1) floor.add(key(i, j)); };
for (const r of ROOMS) for (let i = r.x; i < r.x + r.w; i++) for (let j = r.y; j < r.y + r.h; j++) carve(i, j);
const centre = (r) => ({ i: Math.floor(r.x + r.w / 2), j: Math.floor(r.y + r.h / 2) });
for (const [a, b] of LINKS) {
  const from = centre(ROOMS[a]);
  const to = centre(ROOMS[b]);
  // An L-shaped corridor two tiles wide, horizontal leg first.
  const step = (i, j) => { carve(i, j); carve(i, j + 1); carve(i + 1, j); carve(i + 1, j + 1); };
  for (let i = Math.min(from.i, to.i); i <= Math.max(from.i, to.i); i++) step(i, from.j);
  for (let j = Math.min(from.j, to.j); j <= Math.max(from.j, to.j); j++) step(to.i, j);
}

// Walls: solid tiles that touch the carved space.
const walls = [];
for (let i = 0; i < COLS; i++) {
  for (let j = 0; j < ROWS; j++) {
    if (floor.has(key(i, j))) continue;
    let touches = false;
    for (let di = -1; di <= 1 && !touches; di++) for (let dj = -1; dj <= 1; dj++) if (floor.has(key(i + di, j + dj))) { touches = true; break; }
    if (touches) walls.push({ i, j });
  }
}

const objects = [];
let nextId = 1;
function add(prefab, x, y, width, height, properties) {
  const o = { id: nextId++, prefab, x: Math.round(x), y: Math.round(y) };
  if (width !== undefined) { o.width = Math.round(width); o.height = Math.round(height); }
  if (properties) o.properties = properties;
  objects.push(o);
  return o;
}
const at = (i, j) => ({ x: (i + 0.5) * TILE, y: (j + 0.5) * TILE });

/** The wall block sheets: 64x64 frames, full blocks on the even columns of row 0. */
const WALL_FRAMES = [0, 2, 4, 6];
for (const { i, j } of walls) {
  const p = at(i, j);
  // Catacomb blocks for the deeper rooms, brick for the rest.
  const deep = i > 26 && j < 26;
  add(deep ? 'wallDark' : 'wall', p.x, p.y, TILE, TILE, { frame: pick(WALL_FRAMES), seed: Math.floor(rand() * 1e6) });
}

// Torches: on wall blocks whose south or east neighbour is floor, every few.
let torchCount = 0;
for (const { i, j } of walls) {
  const south = floor.has(key(i, j + 1));
  const east = floor.has(key(i + 1, j));
  if (!south && !east) continue;
  if (rand() > 0.22) continue;
  const p = at(i, j);
  add('torch', p.x, p.y, 16, 16, { face: south ? 'south' : 'east' });
  torchCount++;
}

// Embers to gather: a few per room, off the walls.
const roomFloor = (r) => {
  const tiles = [];
  for (let i = r.x + 1; i < r.x + r.w - 1; i++) for (let j = r.y + 1; j < r.y + r.h - 1; j++) tiles.push(at(i, j));
  return tiles;
};
let embers = 0;
for (const r of ROOMS.slice(1, -1)) {
  const tiles = roomFloor(r);
  for (let n = 0; n < 2; n++) {
    const p = pick(tiles);
    add('ember', p.x + range(-10, 10), p.y + range(-10, 10), 28, 28);
    embers++;
  }
}

// The keep's dead: skeletons in the hall and vault, goblins in the barracks and well.
const spawnIn = (room, prefab, count) => {
  const tiles = roomFloor(room);
  for (let n = 0; n < count; n++) { const p = pick(tiles); add(prefab, p.x, p.y, 30, 30); }
};
spawnIn(ROOMS[1], 'skeleton', 2);
spawnIn(ROOMS[4], 'skeleton', 3);
spawnIn(ROOMS[3], 'goblin', 3);
spawnIn(ROOMS[2], 'goblin', 2);
spawnIn(ROOMS[5], 'skeleton', 3);
spawnIn(ROOMS[6], 'goblin', 4);
spawnIn(ROOMS[7], 'skeleton', 2);
spawnIn(ROOMS[8], 'skeleton', 3);
spawnIn(ROOMS[8], 'goblin', 2);

// Start and stair.
const start = at(centre(ROOMS[0]).i, centre(ROOMS[0]).j);
const stair = at(centre(ROOMS[ROOMS.length - 1]).i, centre(ROOMS[ROOMS.length - 1]).j);
add('stair', stair.x, stair.y, TILE * 1.5, TILE * 1.5, { visible: true, triggers: 'levelComplete', active: true });
add('player', start.x, start.y, 28, 28, { spriteSize: 200, spriteOffsetY: -56 });

// Flare's row order: W, NW, N, NE, E, SE, S, SW.
const FLARE_ROWS = ['left', 'up_left', 'up', 'up_right', 'right', 'down_right', 'down', 'down_left'];
function heroAnimations() {
  const columns = {
    idle: { from: 0, count: 4, fps: 5 }, run: { from: 4, count: 8, fps: 14 },
    swing: { from: 12, count: 4, fps: 14, loop: false }, hit: { from: 18, count: 2, fps: 8, loop: false },
    die: { from: 20, count: 4, fps: 8, loop: false }, cast: { from: 24, count: 4, fps: 10, loop: false }
  };
  return directional(columns);
}
/** The creature sheets: 8 columns per facing row — stance ×2, run ×2, attack ×2, hit, death. */
function creatureAnimations() {
  return directional({
    idle: { from: 0, count: 2, fps: 2 }, run: { from: 2, count: 2, fps: 6 },
    swing: { from: 4, count: 2, fps: 6, loop: false }, hit: { from: 6, count: 1, fps: 1 }, die: { from: 7, count: 1, fps: 1, loop: false }
  });
}
function directional(columns) {
  const animations = {};
  FLARE_ROWS.forEach((direction, row) => {
    for (const [name, { from, count, fps, loop }] of Object.entries(columns)) {
      const frames = Array.from({ length: count }, (_, k) => [from + k, row]);
      animations[`${name}_${direction}`] = loop === false ? { frames, fps, loop } : { frames, fps };
    }
  });
  animations.idle = animations.idle_down;
  animations.run = animations.run_down;
  return animations;
}

const scene = {
  version: 1, name: 'keep', type: 'level', gameType: 'isometric',
  world: { width: W, height: H, gravity: { x: 0, y: 0 }, sort: 'depth', projection: 'isometric' },
  assets: {
    spritesheets: {
      floor: { url: 'textures/tiles/floor-crypt.png', frameWidth: 64, frameHeight: 32 },
      wall: { url: 'textures/tiles/wall-brick.png', frameWidth: 64, frameHeight: 64 },
      wallDark: { url: 'textures/tiles/wall-catacombs.png', frameWidth: 64, frameHeight: 64 },
      torch: {
        url: 'textures/tiles/torch.png', frameWidth: 32, frameHeight: 48,
        animations: { burn: { frames: [[0, 0], [1, 0], [2, 0], [3, 0]], fps: 8 } }
      },
      knight: { url: 'textures/characters/knight.png', frameWidth: 128, frameHeight: 128, animations: heroAnimations() },
      skeleton: { url: 'textures/characters/skeleton.png', frameWidth: 128, frameHeight: 128, animations: creatureAnimations() },
      goblin: { url: 'textures/characters/goblin.png', frameWidth: 128, frameHeight: 128, animations: creatureAnimations() }
    }
  },
  // A 64x32 diamond drawn at twice its size covers one 64-unit ground tile.
  tileLayers: [{
    name: 'floor', spritesheet: 'floor', tileX: 0, tileY: 0, zIndex: -1, scale: 2,
    // Floor under the carved space and under the blocks that frame it.
    cells: [...floor].map(k => k.split(',').map(Number)).concat(walls.map(w => [w.i, w.j]))
  }],
  prefabs: {
    player: { actor: 'ObliquePlayer', spritesheet: 'knight', defaultAnimation: 'idle_down', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } },
    wall: { actor: 'Wall', spritesheet: 'wall', physics: { bodyType: 'static', friction: 0.2 } },
    wallDark: { actor: 'Wall', spritesheet: 'wallDark', physics: { bodyType: 'static', friction: 0.2 } },
    torch: { actor: 'Torch', spritesheet: 'torch', defaultAnimation: 'burn', physics: { bodyType: 'static', isSensor: true } },
    ember: { actor: 'Coin', physics: { bodyType: 'static', isSensor: true, shape: 'circle' } },
    skeleton: { actor: 'Ghost', spritesheet: 'skeleton', defaultAnimation: 'idle_down', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25 } },
    goblin: { actor: 'Ghost', spritesheet: 'goblin', defaultAnimation: 'idle_down', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25 } },
    stair: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'keep', type: 'objects', objects }]
};
const out = fileURLToPath(new URL('../src/iso/scenes/keep.json', import.meta.url));
writeFileSync(out, JSON.stringify(scene, null, 2) + '\n');
console.log(`keep: ${objects.length} objects (${walls.length} walls, ${torchCount} torches, ${embers} embers, ${floor.size} floor tiles) → ${out}`);
