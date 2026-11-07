/**
 * Lays out the lot: `node scripts/buildLotScene.mjs`.
 *
 * The yard at the centre of a grid of lots, each a walled square with its
 * own trucks, crates, barrels, lamp posts and trees — thousands of placed
 * things, which is what the renderer's resident instances, GPU culling
 * and (to come) level of detail exist for. The centre lot is the yard's
 * own objects, with bodies, so the fox has something to walk into; every
 * other lot is `props`: presentation only, laid out as `[x, y, z, yaw,
 * scale]` tuples and drawn from the GPU without a body or an entity. The
 * output is committed; the game loads only the JSON.
 *
 * Units are metres, y up, as the yard's.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const yard = JSON.parse(readFileSync(`${here}../src/yard/scenes/yard.json`, 'utf8'));

/** Lots per side, and the size of one. The yard is 24 m across inside its walls. */
const SIDE = 15;
const LOT = 26;
const HALF = (SIDE * LOT) / 2;

let seed = 7112026;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const range = (a, b) => a + rand() * (b - a);
const chance = (p) => rand() < p;
const r = (v) => Math.round(v * 100) / 100;

const prefabs = {
  ...yard.prefabs,
  // Scenery versions of the yard's shapes: the same look. A prop reads no
  // body or light from its prefab, so the physics blocks here only say
  // what shape the mesh takes.
  post: { actor: 'Ground', physics: { bodyType: 'static', shape: 'cylinder' }, mesh: { color: '#4a4f57', roughness: 0.6, metallic: 0.6 } },
  bulb: { actor: 'Ground', physics: { bodyType: 'static', shape: 'sphere' }, mesh: { color: '#ffd58a', emissive: 3, roughness: 1 } },
  trunk: { actor: 'Ground', physics: { bodyType: 'static', shape: 'cylinder' }, mesh: { color: '#5a4030', roughness: 0.9 } },
  canopy: { actor: 'Ground', physics: { bodyType: 'static', shape: 'sphere' }, mesh: { color: '#3f6b2f', roughness: 0.95 } },
  slab: { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { color: '#7a746a', roughness: 0.9 } }
};

/** The props: one entry per prefab and size, accumulating instances. */
const props = new Map();
const place = (key, prefab, size, x, y, z, yaw = 0, scale = 1) => {
  let prop = props.get(key);
  if (!prop) props.set(key, prop = { id: `props-${key}`, prefab, ...size, instances: [] });
  prop.instances.push([r(x), r(y), r(z), r(yaw), r(scale)]);
};

for (let row = 0; row < SIDE; row++) {
  for (let col = 0; col < SIDE; col++) {
    const cx = -HALF + LOT / 2 + col * LOT;
    const cz = -HALF + LOT / 2 + row * LOT;
    const centre = row === (SIDE - 1) / 2 && col === (SIDE - 1) / 2;
    if (centre) continue;

    // A slab, and walls on the north and west so lots read as a grid of
    // yards; the outer ring closes the east and south edges.
    place('slab', 'slab', { width: LOT - 2, height: 0.3, depth: LOT - 2 }, cx, 0.15, cz);
    place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, cx, 1.25 + 0.3, cz - LOT / 2 + 1);
    place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, cx - LOT / 2 + 1, 1.25 + 0.3, cz, Math.PI / 2);

    // Lamp posts at two corners.
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      const x = cx + sx * (LOT / 2 - 3);
      const z = cz + sz * (LOT / 2 - 3);
      place('post', 'post', { width: 0.25, height: 5 }, x, 2.8, z);
      place('bulb', 'bulb', { width: 0.5, height: 0.5 }, x, 5.5, z);
    }

    // Trees along one side, varying in size and turn.
    const trees = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < trees; i++) {
      const x = cx - LOT / 2 + 3 + (i + 0.5) * ((LOT - 6) / trees) + range(-1, 1);
      const z = cz + LOT / 2 - 3.5 + range(-1, 1);
      const s = range(0.7, 1.4);
      place('trunk', 'trunk', { width: 0.5, height: 3 }, x, 0.3 + 1.5 * s, z, 0, s);
      place('canopy', 'canopy', { width: 3.2, height: 3.2 }, x, 0.3 + 3.6 * s, z, range(0, Math.PI), s);
    }

    // What the lot holds: a truck or two, crates in stacks, barrels, a few spheres.
    if (chance(0.7)) place('truck', 'truck', { width: 2.8, height: 2.6, depth: 4.9 }, cx + range(-6, 6), 0.3 + 1.3, cz + range(-5, 2), range(0, Math.PI * 2));
    if (chance(0.3)) place('truck', 'truck', { width: 2.8, height: 2.6, depth: 4.9 }, cx + range(-8, 8), 0.3 + 1.3, cz + range(-8, -4), range(0, Math.PI * 2));
    const stacks = 2 + Math.floor(rand() * 5);
    for (let i = 0; i < stacks; i++) {
      const x = cx + range(-9, 9);
      const z = cz + range(-9, 6);
      const yaw = range(0, Math.PI);
      const high = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < high; k++) place('crate', 'crate', { width: 1, height: 1, depth: 1 }, x + range(-0.05, 0.05), 0.3 + 0.5 + k, z + range(-0.05, 0.05), yaw + range(-0.1, 0.1));
    }
    const barrels = Math.floor(rand() * 4);
    for (let i = 0; i < barrels; i++) place('barrel', 'barrel', { width: 0.8, height: 1.2 }, cx + range(-9, 9), 0.3 + 0.6, cz + range(-9, 6), range(0, Math.PI));
    if (chance(0.4)) place('steel', 'steel', { width: 1.2, height: 1.2 }, cx + range(-9, 9), 0.3 + 0.6, cz + range(-9, 6));
    if (chance(0.3)) place('copper', 'copper', { width: 0.9, height: 0.9 }, cx + range(-9, 9), 0.3 + 0.45, cz + range(-9, 6));
  }
}

// The outer ring: walls closing the east and south edges of the grid.
for (let i = 0; i < SIDE; i++) {
  const c = -HALF + LOT / 2 + i * LOT;
  place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, c, 1.55, HALF - 1);
  place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, HALF - 1, 1.55, c, Math.PI / 2);
}

const total = [...props.values()].reduce((n, p) => n + p.instances.length, 0);

const scene = {
  version: yard.version,
  type: 'level',
  name: 'lot',
  title: 'The Lot',
  world: yard.world,
  assets: yard.assets,
  prefabs,
  layers: [{
    name: 'main',
    objects: [
      // The yard's ground stretched under the whole lot; the rest of the yard as it is.
      ...yard.layers[0].objects.map((o) => (o.id === 'floor'
        ? { ...o, width: SIDE * LOT + 20, depth: SIDE * LOT + 20 }
        : o))
    ],
    props: [...props.values()]
  }]
};

const out = `${here}../src/yard/scenes/lot.json`;
writeFileSync(out, JSON.stringify(scene));
console.log(`Wrote ${out}: ${SIDE * SIDE - 1} lots, ${total} prop instances in ${props.size} props`);
