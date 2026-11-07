/**
 * Lays out the lot: `node scripts/buildLotScene.mjs`.
 *
 * The yard at the centre of a grid of lots, each a walled square with its
 * own trees, ground cover, rocks and props — thousands of placed things,
 * which is what the renderer's resident instances, GPU culling and levels
 * of detail exist for. The centre lot is the yard's own objects, with
 * bodies, so the fox has something to walk into; every other lot is
 * `props`: presentation only, laid out as `[x, y, z, yaw, scale]` tuples
 * and drawn from the GPU without a body or an entity. The models are Poly
 * Haven photoscans compiled by `scripts/compileModel.mjs` (see
 * THIRD_PARTY_NOTICES.md); the walls and slabs stay primitive shapes. The
 * output is committed; the game loads only the JSON.
 *
 * Units are metres, y up, as the yard's. Poly Haven models stand on their
 * origin, so a prop's y is the ground it stands on — the yard's floor, at
 * 0, under every lot. Anything a fox should not walk through has a
 * collider: walls and most props as their bounds, trees as a trunk.
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
const pick = (list) => list[Math.floor(rand() * list.length)];
const r = (v) => Math.round(v * 100) / 100;
const TURN = Math.PI * 2;

/** The compiled Poly Haven models, by the key a prefab names. */
const MODELS = [
  'jacaranda_tree', 'island_tree_02', 'tree_small_02', 'searsia_lucida', 'fir_sapling_medium', 'dead_tree_trunk_02',
  'grass_medium_01', 'fern_02', 'shrub_02', 'nettle_plant', 'dandelion_01',
  'boulder_01', 'rock_moss_set_01', 'namaqualand_boulder_02',
  'Barrel_01', 'barrel_03', 'wooden_crate_01', 'cardboard_box_01', 'plastic_crate_03',
  'street_lamp_01', 'covered_car', 'modular_industrial_pipes_01', 'wooden_picnic_table',
  'concrete_road_barrier', 'modular_chainlink_fence',
  'hand_truck', 'propane_tank', 'old_tyre', 'utility_box_01', 'fire_hydrant',
  'modular_electricity_poles', 'modular_fort_01'
];
const models = Object.fromEntries(MODELS.map((id) => [id, { url: `models/ph/${id}.glb` }]));

const prefabs = {
  ...yard.prefabs,
  // The lots' walls stay the yard's shape. One prefab per model, drawn
  // with the file's own materials.
  ...Object.fromEntries(MODELS.map((id) => [id, { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { model: id } }]))
};

/** What each model collides as: its bounds, a trunk, or nothing for what a fox walks through. */
const TRUNK = { shape: 'cylinder', width: 0.7, height: 4 };
const COLLIDERS = {
  jacaranda_tree: TRUNK, island_tree_02: TRUNK, tree_small_02: { shape: 'cylinder', width: 0.4, height: 3 },
  searsia_lucida: { shape: 'cylinder', width: 0.4, height: 2 }, fir_sapling_medium: { shape: 'cylinder', width: 0.5, height: 4 },
  dead_tree_trunk_02: 'bounds',
  grass_medium_01: 'none', fern_02: 'none', shrub_02: 'none', nettle_plant: 'none', dandelion_01: 'none',
  boulder_01: 'bounds', rock_moss_set_01: 'none', namaqualand_boulder_02: 'bounds',
  street_lamp_01: { shape: 'cylinder', width: 0.3, height: 3.9 }, modular_electricity_poles: { shape: 'cylinder', width: 0.4, height: 7 },
  modular_fort_01: 'bounds', wall: 'bounds'
};

/** The props: one entry per prefab (and size, for shapes), accumulating instances. */
const props = new Map();
const place = (key, prefab, size, x, y, z, yaw = 0, scale = 1) => {
  let prop = props.get(key);
  if (!prop) props.set(key, prop = { id: `props-${key}`, prefab, ...size, collider: COLLIDERS[prefab] ?? 'bounds', instances: [] });
  prop.instances.push([r(x), r(y), r(z), r(yaw), r(scale)]);
};
const model = (id, x, y, z, yaw = 0, scale = 1) => place(id, id, {}, x, y, z, yaw, scale);

const TREES = ['jacaranda_tree', 'island_tree_02', 'tree_small_02', 'searsia_lucida', 'fir_sapling_medium'];
const COVER = ['grass_medium_01', 'grass_medium_01', 'grass_medium_01', 'fern_02', 'shrub_02', 'nettle_plant', 'dandelion_01'];
const ROCKS = ['boulder_01', 'rock_moss_set_01', 'namaqualand_boulder_02'];
const CLUTTER = ['Barrel_01', 'barrel_03', 'wooden_crate_01', 'cardboard_box_01', 'plastic_crate_03', 'hand_truck', 'propane_tank', 'old_tyre'];

for (let row = 0; row < SIDE; row++) {
  for (let col = 0; col < SIDE; col++) {
    const cx = -HALF + LOT / 2 + col * LOT;
    const cz = -HALF + LOT / 2 + row * LOT;
    const centre = row === (SIDE - 1) / 2 && col === (SIDE - 1) / 2;
    if (centre) continue;
    const top = 0;

    // Walls on the north and west so lots read as a grid of yards; the
    // outer ring closes the east and south edges. A wall's y is its centre.
    place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, cx, 1.25, cz - LOT / 2 + 1);
    place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, cx - LOT / 2 + 1, 1.25, cz, Math.PI / 2);

    // Street lamps at two corners, a utility box or a hydrant by the wall.
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      model('street_lamp_01', cx + sx * (LOT / 2 - 3), top, cz + sz * (LOT / 2 - 3), range(0, TURN));
    }
    if (chance(0.5)) model(pick(['utility_box_01', 'fire_hydrant']), cx - LOT / 2 + 2.2, top, cz + range(-6, 6), Math.PI / 2);

    // Trees along the south side, varying in size and turn, with ground
    // cover around their feet and a few rocks.
    const trees = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < trees; i++) {
      const x = cx - LOT / 2 + 3 + (i + 0.5) * ((LOT - 6) / trees) + range(-1.5, 1.5);
      const z = cz + LOT / 2 - 4 + range(-1.5, 1.5);
      model(pick(TREES), x, top, z, range(0, TURN), range(0.7, 1.1));
      const tufts = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < tufts; k++) {
        const a = range(0, TURN);
        const d = range(0.8, 3);
        model(pick(COVER), x + Math.cos(a) * d, top, z + Math.sin(a) * d, range(0, TURN), range(0.7, 1.3));
      }
    }
    if (chance(0.6)) model(pick(ROCKS), cx + range(-9, 9), top, cz + range(2, 8), range(0, TURN), range(0.6, 1.4));
    if (chance(0.25)) model('dead_tree_trunk_02', cx + range(-8, 8), top, cz + range(-2, 6), range(0, TURN));

    // What the lot holds: a car, a picnic table, pipes, fences, and clutter.
    if (chance(0.45)) model('covered_car', cx + range(-6, 6), top, cz + range(-6, 0), range(0, TURN));
    if (chance(0.35)) model('wooden_picnic_table', cx + range(-8, 8), top, cz + range(-8, 4), range(0, TURN));
    if (chance(0.3)) model('modular_industrial_pipes_01', cx + range(-8, 8), top, cz - LOT / 2 + 2.5, 0);
    if (chance(0.4)) {
      const x = cx + range(-6, 6);
      const z = cz + range(-8, -2);
      for (let k = 0; k < 3; k++) model('concrete_road_barrier', x + k * 2.2, top, z, 0);
    }
    if (chance(0.35)) model('modular_chainlink_fence', cx + range(-6, 6), top, cz + range(-4, 4), pick([0, Math.PI / 2]));
    if (chance(0.2)) model('modular_electricity_poles', cx + LOT / 2 - 2.5, top, cz + range(-8, 8), 0);
    const clutter = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < clutter; i++) {
      model(pick(CLUTTER), cx + range(-9, 9), top, cz + range(-9, 6), range(0, TURN));
    }
  }
}

// The outer ring: walls closing the east and south edges of the grid, and
// the fort — a 70 m scan of a stone wall — standing beyond the north edge.
for (let i = 0; i < SIDE; i++) {
  const c = -HALF + LOT / 2 + i * LOT;
  place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, c, 1.25, HALF - 1);
  place('wall', 'wall', { width: LOT - 2, height: 2.5, depth: 0.6 }, HALF - 1, 1.25, c, Math.PI / 2);
}
model('modular_fort_01', 0, 0, -HALF - 30, Math.PI / 2);

const total = [...props.values()].reduce((n, p) => n + p.instances.length, 0);

const scene = {
  version: yard.version,
  type: 'level',
  name: 'lot',
  title: 'The Lot',
  world: yard.world,
  assets: { ...yard.assets, models: { ...yard.assets.models, ...models } },
  prefabs,
  layers: [{
    name: 'main',
    objects: [
      // The yard's ground stretched under the whole lot; the rest of the yard as it is.
      ...yard.layers[0].objects.map((o) => (o.id === 'floor'
        ? { ...o, width: SIDE * LOT + 60, depth: SIDE * LOT + 60 }
        : o))
    ],
    props: [...props.values()]
  }]
};

const out = `${here}../src/yard/scenes/lot.json`;
writeFileSync(out, JSON.stringify(scene));
console.log(`Wrote ${out}: ${SIDE * SIDE - 1} lots, ${total} prop instances in ${props.size} props`);
