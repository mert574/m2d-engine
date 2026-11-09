/**
 * Lays out the lot: `node scripts/buildLotScene.mjs`.
 *
 * The yard at the centre of a 15 x 15 grid of walled lots, built as a
 * tech demo: every district shows one thing the renderer does, and the
 * whole is still the thousands of placed things the resident instances,
 * GPU culling, levels of detail and streaming exist for. Around the yard:
 *
 *   - north, the **orchard**: every tree species in rows at three sizes,
 *     so the levels of detail and the alpha-cut foliage read side by side;
 *   - west, the **lighting lab**: a grid of pillars under four coloured
 *     lamps and two white floodlights — overlapping shadow cubes and spot
 *     shadow maps, coloured shadows crossing;
 *   - north-east, the **rock garden**: the photoscans' normal and
 *     occlusion maps up close — boulders in a ring, a moss set, logs;
 *   - north-west, the **meadow**: a field of grass, dandelions and shrubs,
 *     hundreds of alpha-cut instances for the price of a draw;
 *   - south-east, the **depot**: barrels in blocks, crates stacked,
 *     pipes, fences and tanks in rows — ambient occlusion in the gaps;
 *   - south-west, the **car park**: ranks of covered cars under lamps;
 *   - east, the **boulevard**: an asphalt road running to the edge, with
 *     the material gallery along its first two lots — vertex colours,
 *     morph targets, a metallic-roughness sphere matrix, mirror spheres,
 *     neon tubes — then parked cars and pole lines into the fog;
 *   - south, the **avenue**: a lamp-lined road to the south wall, lamps
 *     every thirteen metres handing their shadow cubes along as you walk,
 *     trees receding through the cascades into the distance.
 *
 * Beyond the ring, the quadrants are districts — forest to the north-west,
 * orchards to the north-east, industrial blocks to the south-west, meadows
 * and picnic grounds to the south-east — laid out on regular patterns with
 * a little seeded jitter, so a view down any line of lots reads as a
 * place rather than a scatter. The centre lot is the yard's own objects,
 * with bodies; everything else is `props`: presentation only, laid out as
 * `[x, y, z, yaw, scale]` tuples and drawn from the GPU without a body or
 * an entity. The models are Poly Haven photoscans compiled by
 * `scripts/compileModel.mjs` (see THIRD_PARTY_NOTICES.md); the walls,
 * roads and plinths stay primitive shapes. The output is committed; the
 * game loads only the JSON.
 *
 * Units are metres, y up, as the yard's. Poly Haven models stand on their
 * origin unless noted in SIZES — the pipes and the tyre have theirs at
 * mid height — so a prop's y is the ground it stands on: the yard's
 * floor, at 0, under every lot. Anything a fox should not walk through
 * has a collider: walls and most props as their bounds, trees as a trunk.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const yard = JSON.parse(readFileSync(`${here}../src/yard/scenes/yard.json`, 'utf8'));

/** Lots per side, and the size of one. The yard is 24 m across inside its walls. */
const SIDE = 15;
const LOT = 26;
const HALF = (SIDE * LOT) / 2;
const MID = (SIDE - 1) / 2;

let seed = 7112026;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const range = (a, b) => a + rand() * (b - a);
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
const r = (v) => Math.round(v * 100) / 100;
const TURN = Math.PI * 2;
const Q = Math.PI / 2;

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

/**
 * What the layouts need to know of each scan, from its LOD0 bounds:
 * footprint along x and z, height, and where the origin sits in y
 * (`lift` is what to add to stand it on the ground). A `set` is several
 * things in one file — fence panels, poles, a row of saplings — whose
 * length along x says how far apart to lay them.
 */
const SIZES = {
  Barrel_01: { x: 0.56, z: 0.56, h: 0.87 }, barrel_03: { x: 0.64, z: 0.64, h: 0.93 },
  wooden_crate_01: { x: 0.82, z: 0.41, h: 0.34 }, cardboard_box_01: { x: 0.38, z: 0.52, h: 0.34 },
  plastic_crate_03: { x: 0.48, z: 0.26, h: 0.27 }, propane_tank: { x: 0.34, z: 0.34, h: 0.55 },
  old_tyre: { x: 0.6, z: 0.16, h: 0.6, lift: 0.3 }, modular_industrial_pipes_01: { x: 1.4, z: 0.31, h: 1.95, lift: 1.0 },
  concrete_road_barrier: { x: 1.54, z: 0.63, h: 0.82 }, covered_car: { x: 1.8, z: 4.4, h: 1.41 },
  modular_chainlink_fence: { set: 8.1, z: 2.1 }, modular_electricity_poles: { set: 13.1 }, fir_sapling_medium: { set: 14.8 },
  grass_medium_01: { set: 5.6 }, dandelion_01: { set: 4.2 }, rock_moss_set_01: { set: 8 }, shrub_02: { set: 6.5 },
  wooden_picnic_table: { x: 2.24, z: 3.0 }, street_lamp_01: { h: 3.87 }
};

const prefabs = {
  ...yard.prefabs,
  // One prefab per model, drawn with the file's own materials.
  ...Object.fromEntries(MODELS.map((id) => [id, { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { model: id } }])),
  // Roads and kerbs: Poly Haven's asphalt and concrete, fetched by
  // buildModels.mjs, mapped planar from the world so a strip of any
  // length tiles without stretching.
  road: { actor: 'Ground', mesh: { color: '#9a9a96', roughness: 0.95, texture: { url: 'textures/asphalt_03_diff_1k.jpg', size: 4 } } },
  kerb: { actor: 'Ground', mesh: { color: '#d8d4cc', roughness: 0.9, texture: { url: 'textures/concrete_floor_02_diff_1k.jpg', size: 1 } } },
  plinth: { actor: 'Ground', mesh: { shape: 'cylinder', color: '#cfcac0', roughness: 0.9, texture: { url: 'textures/concrete_floor_02_diff_1k.jpg', size: 1 } } },
  // A warm glow inside each street lamp's glass head. The visible shell
  // must not cast, or it would shadow its own light into darkness.
  lantern: {
    actor: 'Ground',
    mesh: { shape: 'sphere', color: '#ffd9a0', emissive: 10, roughness: 1, castShadow: false },
    // Sized to the lot: 26 m across, so a corner lamp's light still
    // reads at its middle and the two together carry the whole yard.
    light: { type: 'point', color: '#ffc473', intensity: 70, range: 24 }
  },
  // The lighting lab's coloured heads: shorter range, so each colour
  // owns its corner and the shadows cross in the middle.
  ...Object.fromEntries(Object.entries({ red: '#ff5a3c', green: '#5cff7a', blue: '#4c8dff', violet: '#c86bff' }).map(([name, color]) => [
    `lantern-${name}`, {
      actor: 'Ground',
      mesh: { shape: 'sphere', color, emissive: 10, roughness: 1, castShadow: false },
      light: { type: 'point', color, intensity: 60, range: 16 }
    }
  ])),
  // White floodlights on the lab's walls, each aimed into the court.
  'flood-south': {
    actor: 'Ground', physics: { bodyType: 'static', shape: 'box', isSensor: true },
    mesh: { color: '#f4f6ff', emissive: 6, roughness: 0.3, castShadow: false },
    light: { type: 'spot', color: '#f4f6ff', intensity: 220, range: 34, direction: { x: 0, y: -0.75, z: 1 }, innerCone: 0.45, outerCone: 0.8 }
  },
  'flood-east': {
    actor: 'Ground', physics: { bodyType: 'static', shape: 'box', isSensor: true },
    mesh: { color: '#f4f6ff', emissive: 6, roughness: 0.3, castShadow: false },
    light: { type: 'spot', color: '#f4f6ff', intensity: 220, range: 34, direction: { x: 1, y: -0.75, z: 0 }, innerCone: 0.45, outerCone: 0.8 }
  },
  // The gallery's sphere matrix: a dielectric row and a gold row, each
  // across six roughnesses, so the model's two axes read at a glance.
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap((i) => [
    [`pbr-d${i}`, { actor: 'Ground', mesh: { shape: 'sphere', color: '#dcd4c6', metallic: 0, roughness: 0.04 + i * 0.19 } }],
    [`pbr-m${i}`, { actor: 'Ground', mesh: { shape: 'sphere', color: '#e2b25e', metallic: 1, roughness: 0.04 + i * 0.19 } }]
  ]))
};

/** What each model collides as: its bounds, a trunk, or nothing for what a fox walks through. */
const TRUNK = { shape: 'cylinder', width: 0.7, height: 4 };
const COLLIDERS = {
  jacaranda_tree: TRUNK, island_tree_02: TRUNK, tree_small_02: { shape: 'cylinder', width: 0.4, height: 3 },
  searsia_lucida: { shape: 'cylinder', width: 0.4, height: 2 }, fir_sapling_medium: 'none',
  dead_tree_trunk_02: 'bounds',
  grass_medium_01: 'none', fern_02: 'none', shrub_02: 'none', nettle_plant: 'none', dandelion_01: 'none',
  boulder_01: 'bounds', rock_moss_set_01: 'none', namaqualand_boulder_02: 'bounds',
  street_lamp_01: { shape: 'cylinder', width: 0.3, height: 3.9 }, modular_electricity_poles: 'none',
  lantern: 'none', 'lantern-red': 'none', 'lantern-green': 'none', 'lantern-blue': 'none', 'lantern-violet': 'none',
  road: 'none', kerb: 'none',
  modular_fort_01: 'bounds', wall: 'bounds'
};

/** Placed objects — entities with bodies — the exhibits add beside the yard's own. */
const objects = [];

/** The props: one entry per prefab (and size, for shapes), accumulating instances. */
const props = new Map();
const place = (key, prefab, size, x, y, z, yaw = 0, scale = 1) => {
  let prop = props.get(key);
  if (!prop) props.set(key, prop = { id: `props-${key}`, prefab, ...size, collider: COLLIDERS[prefab] ?? 'bounds', instances: [] });
  prop.instances.push([r(x), r(y), r(z), r(yaw), r(scale)]);
};
/** A scan standing on the ground at (x, z), lifted where its origin is not at its feet. */
const model = (id, x, z, yaw = 0, scale = 1, y = 0) => place(id, id, {}, x, y + (SIZES[id]?.lift ?? 0) * scale, z, yaw, scale);
const LAMP_HEAD = 3.32;
/** A street lamp with a glowing head of the given colour prefab. */
const lamp = (x, z, yaw = range(0, TURN), head = 'lantern') => {
  model('street_lamp_01', x, z, yaw);
  place(head, head, { width: 0.22, height: 0.22, depth: 0.22 }, x, LAMP_HEAD, z);
};
const wall = (x, z, yaw = 0, length = LOT - 2) => place('wall', 'wall', { width: length, height: 2.5, depth: 0.6 }, x, 1.25, z, yaw);
/** A straight asphalt strip with a kerb each side, `along` 'x' or 'z', centred at (x, z). */
const road = (x, z, along, length = LOT, width = 8) => {
  const size = along === 'x' ? { width: length, height: 0.06, depth: width } : { width, height: 0.06, depth: length };
  place('road', 'road', size, x, 0.03, z);
  const kerb = along === 'x' ? { width: length, height: 0.14, depth: 0.3 } : { width: 0.3, height: 0.14, depth: length };
  for (const side of [-1, 1]) {
    const o = side * (width / 2 + 0.15);
    place('kerb', 'kerb', kerb, x + (along === 'z' ? o : 0), 0.07, z + (along === 'x' ? o : 0));
  }
};
/** `count` of a model in a line from (x, z) along `along`, `pitch` apart. */
const row = (id, x, z, along, count, pitch, yaw = 0, scale = 1, y = 0) => {
  for (let i = 0; i < count; i++) {
    const o = (i - (count - 1) / 2) * pitch;
    model(id, x + (along === 'x' ? o : 0), z + (along === 'z' ? o : 0), yaw, scale, y);
  }
};
/** Ground cover scattered within `radius` of (x, z). */
const cover = (x, z, radius, count) => {
  for (let k = 0; k < count; k++) {
    const a = range(0, TURN);
    const d = range(radius * 0.25, radius);
    model(pick(COVER), x + Math.cos(a) * d, z + Math.sin(a) * d, range(0, TURN), range(0.7, 1.3));
  }
};

const TREES = ['jacaranda_tree', 'island_tree_02', 'tree_small_02', 'searsia_lucida', 'fir_sapling_medium'];
const COVER = ['grass_medium_01', 'grass_medium_01', 'fern_02', 'nettle_plant', 'dandelion_01'];

// === The exhibits around the yard ===

/** The orchard: every species at three sizes, the big jacaranda scaled to the lot. */
function orchard(cx, cz) {
  const species = ['island_tree_02', 'tree_small_02', 'searsia_lucida', 'jacaranda_tree'];
  species.forEach((id, i) => {
    const x = cx - 9 + i * 6;
    [0.75, 1, 1.25].forEach((scale, k) => {
      const base = id === 'jacaranda_tree' ? 0.42 : 1;
      model(id, x, cz - 7 + k * 7, (i * 1.7 + k) % TURN, scale * base);
    });
    row('grass_medium_01', x + 3, cz, 'z', 3, 7, Q, 1);
  });
  // A row of fir saplings along the back wall: one file, many trees.
  model('fir_sapling_medium', cx - 4.5, cz - 11, 0, 0.8);
}

/** The lighting lab: a pillar grid under four coloured lamps and two white floodlights. */
function lightingLab(cx, cz) {
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      place('pillar', 'pillar', { width: 0.7, height: 4 }, cx - 6 + i * 4, 2, cz - 6 + k * 4);
    }
  }
  const heads = ['lantern-red', 'lantern-green', 'lantern-blue', 'lantern-violet'];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => lamp(cx + sx * 9.5, cz + sz * 9.5, Q * i, heads[i]));
  // The floodlights sit on the north and west walls, aimed into the court.
  objects.push(
    { id: 'lab-flood-south', prefab: 'flood-south', x: r(cx), y: 3.2, z: r(cz - LOT / 2 + 1.6), width: 0.6, height: 0.3, depth: 0.3 },
    { id: 'lab-flood-east', prefab: 'flood-east', x: r(cx - LOT / 2 + 1.6), y: 3.2, z: r(cz), width: 0.3, height: 0.3, depth: 0.6 }
  );
  // Something to throw shadows that are not columns: barrels and a crate stack mid-court.
  row('Barrel_01', cx - 2, cz + 2, 'x', 3, 0.7);
  stack('wooden_crate_01', cx + 2, cz - 2, 3, Q);
}

/** The rock garden: the scans up close, in a ring with ferns at their feet. */
function rockGarden(cx, cz) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TURN;
    model(i % 2 ? 'boulder_01' : 'namaqualand_boulder_02', cx + Math.cos(a) * 7, cz + Math.sin(a) * 7, a + Q, range(0.9, 1.3));
    const d = 9;
    for (let k = 0; k < 3; k++) {
      const b = a + range(-0.25, 0.25);
      model(pick(['fern_02', 'nettle_plant']), cx + Math.cos(b) * (d + k * 0.8), cz + Math.sin(b) * (d + k * 0.8), range(0, TURN));
    }
  }
  model('rock_moss_set_01', cx, cz, 0.4, 1.1);
  model('dead_tree_trunk_02', cx - 2, cz + 11, 0.2);
  model('dead_tree_trunk_02', cx + 9, cz - 9, Q + 0.3, 0.9);
  model('wooden_picnic_table', cx + 9, cz + 8, 0.3);
  row('shrub_02', cx - 9, cz - 9, 'x', 2, 6.5, 0, 0.8);
}

/** The meadow: a field of cover on a jittered grid, with somewhere to sit. */
function meadow(cx, cz) {
  for (let i = 0; i < 7; i++) {
    for (let k = 0; k < 7; k++) {
      const x = cx - 9 + i * 3 + range(-0.8, 0.8);
      const z = cz - 9 + k * 3 + range(-0.8, 0.8);
      model((i + k) % 3 ? 'grass_medium_01' : 'dandelion_01', x, z, range(0, TURN), range(0.8, 1.2));
    }
  }
  row('shrub_02', cx, cz - 11, 'x', 3, 7, 0, 0.9);
  model('wooden_picnic_table', cx - 5, cz + 3, 0.15);
  model('wooden_picnic_table', cx + 5, cz + 3, -0.1);
  model('searsia_lucida', cx + 8, cz - 6, 1.1, 1.1);
  model('tree_small_02', cx - 8, cz - 5, 2.4, 1.0);
}

/** A pyramid of `levels` courses of a crate, each course one shorter, along x. */
function stack(id, x, z, levels, yaw = 0) {
  const s = SIZES[id];
  const along = yaw ? s.z : s.x;
  for (let level = 0; level < levels; level++) {
    const count = levels - level;
    for (let i = 0; i < count; i++) {
      model(id, x + (i - (count - 1) / 2) * (along + 0.02), z, yaw, 1, level * s.h);
    }
  }
}

/** The depot: everything industrial, in blocks and rows. */
function depot(cx, cz) {
  // Pipes along the north wall, upright on their mid-height origin.
  row('modular_industrial_pipes_01', cx - 2, cz - LOT / 2 + 2.4, 'x', 9, 1.45);
  // Barrel blocks.
  for (let i = 0; i < 4; i++) row('Barrel_01', cx - 9, cz - 6 + i * 0.72, 'x', 3, 0.7);
  for (let i = 0; i < 3; i++) row('barrel_03', cx - 4, cz - 6 + i * 0.8, 'x', 3, 0.78);
  // Crate pyramids and box piles.
  stack('wooden_crate_01', cx + 2, cz - 6, 4);
  stack('wooden_crate_01', cx + 2, cz - 4.8, 3);
  stack('cardboard_box_01', cx + 7, cz - 6, 3, Q);
  row('plastic_crate_03', cx + 7, cz - 4, 'x', 5, 0.52);
  row('plastic_crate_03', cx + 7, cz - 4, 'x', 5, 0.52, 0, 1, 0.27);
  // Tanks and trucks by the east fence; the fence runs north to south.
  row('propane_tank', cx + 9, cz + 1, 'z', 6, 0.42);
  row('hand_truck', cx + 6, cz + 2, 'x', 3, 1.0, Math.PI);
  row('modular_chainlink_fence', cx + 11.2, cz + 4.5, 'z', 2, 8.1, Q);
  // Tyres standing in a row, and cars behind barriers.
  row('old_tyre', cx - 8, cz + 1, 'x', 8, 0.66);
  row('covered_car', cx - 6, cz + 7, 'x', 3, 3.2);
  row('concrete_road_barrier', cx - 6, cz + 10.5, 'x', 7, 1.6);
  for (const [sx, sz] of [[-1, -1], [1, 1]]) lamp(cx + sx * (LOT / 2 - 3), cz + sz * (LOT / 2 - 3));
  model('utility_box_01', cx + 10, cz - 8, Q);
}

/** The car park: ranks of covered cars with barriers at the ends. */
function carPark(cx, cz) {
  for (let rank = 0; rank < 3; rank++) {
    const z = cz - 7 + rank * 7;
    row('covered_car', cx - 1, z, 'x', 5, 2.9, (rank % 2) * Math.PI);
    model('concrete_road_barrier', cx - 9, z, Q);
    model('concrete_road_barrier', cx + 7, z, Q);
  }
  for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1]]) lamp(cx + sx * (LOT / 2 - 3), cz + sz * (LOT / 2 - 3));
  model('fire_hydrant', cx + 10, cz - 9, Q);
  model('utility_box_01', cx + 10, cz + 9, Q);
  row('grass_medium_01', cx, cz - 11, 'x', 3, 6, 0, 0.9);
}

/** A boulevard lot: the road east-west, lamps alternating, and whatever `fill` adds. */
function boulevard(cx, cz, fill) {
  road(cx, cz, 'x');
  lamp(cx - 6.5, cz - 5.5, Q);
  lamp(cx + 6.5, cz + 5.5, -Q);
  fill(cx, cz);
}

/** The first boulevard lot: the hand-built feature models in rows beside the road, neon overhead. */
function gallery(cx, cz) {
  // Vertex colours across the spheres on the north verge, morph targets
  // in the blobs on the south, each row at rising scale.
  [1, 2, 3].forEach((scale, i) => {
    const x = cx - 7 + i * 7;
    objects.push(
      { id: `show-wheel-${i}`, prefab: 'wheel', x: r(x), y: r(0.55 * scale + 0.1), z: r(cz - 8),
        width: r(0.9 * scale), height: r(0.9 * scale), depth: r(0.9 * scale), overrides: { mesh: { scale } } },
      { id: `show-breather-${i}`, prefab: 'breather', x: r(x), y: r(0.45 * scale + 0.1), z: r(cz + 8),
        width: r(0.7 * scale), height: r(0.7 * scale), depth: r(0.7 * scale), overrides: { mesh: { scale } } }
    );
  });
  // Three neon tubes over the road, each a coloured spot shadow.
  [['#ff2d95', -4], ['#2dd4ff', 0], ['#ffb02d', 4]].forEach(([color, dz], i) => {
    objects.push({
      id: `show-neon-${i}`, prefab: 'neon', x: r(cx), y: 7, z: r(cz + dz), width: 16, height: 0.16, depth: 0.16,
      ...(i && { overrides: { mesh: { color }, light: { color } } })
    });
  });
  // Mirror spheres on the verges, to roll: the sky in them is the one overhead.
  objects.push(
    { id: 'show-mirror-1', prefab: 'mirror', x: r(cx + 10), y: 0.9, z: r(cz - 7), width: 1.8, height: 1.8 },
    { id: 'show-mirror-2', prefab: 'mirror', x: r(cx + 10), y: 0.7, z: r(cz + 7), width: 1.4, height: 1.4 }
  );
}

/** The second boulevard lot: the metallic-roughness matrix on plinths either side of the road. */
function sphereMatrix(cx, cz) {
  for (let i = 0; i < 6; i++) {
    const x = cx - 8.75 + i * 3.5;
    for (const [side, kind] of [[-1, 'd'], [1, 'm']]) {
      const z = cz + side * 7;
      place('plinth', 'plinth', { width: 1.0, height: 0.7 }, x, 0.35, z);
      const key = `pbr-${kind}${i}`;
      place(key, key, { width: 1.2, height: 1.2, depth: 1.2 }, x, 1.3, z);
    }
  }
  row('grass_medium_01', cx, cz - 11, 'x', 4, 6, 0, 0.9);
  row('grass_medium_01', cx, cz + 11, 'x', 4, 6, 0, 0.9);
}

/** A boulevard lot further out: cars parked along the south kerb, poles along the north. */
function parking(cx, cz) {
  row('covered_car', cx, cz + 6.8, 'x', 4, 5.6, Q);
  model('modular_electricity_poles', cx + 0.8, cz - 8.5, 0);
  row('grass_medium_01', cx, cz - 11, 'x', 3, 7, 0, 0.9);
  if (chance(0.5)) model('fire_hydrant', cx - 10, cz + 5.5, Q);
}

/** An avenue lot: the road north-south, lamps alternating, trees on the verges. */
function avenue(cx, cz, i) {
  road(cx, cz, 'z');
  lamp(cx - 5.5, cz - 6.5, Q);
  lamp(cx + 5.5, cz + 6.5, -Q);
  const tree = i % 2 ? 'island_tree_02' : 'tree_small_02';
  model(tree, cx - 9, cz, range(0, TURN), 1.1);
  model(tree, cx + 9, cz, range(0, TURN), 1.1);
  cover(cx - 9, cz, 3, 4);
  cover(cx + 9, cz, 3, 4);
  if (i % 3 === 1) model('fire_hydrant', cx + 5.2, cz - 2, -Q);
  if (i % 3 === 2) model('utility_box_01', cx - 5.4, cz + 2, Q);
  if (i % 2) row('concrete_road_barrier', cx - 4.9, cz, 'z', 3, 1.6, Q);
}

// === The districts ===

/** North-west: forest. Trees on a seven-metre grid, jittered, with cover at their feet. */
function forest(cx, cz) {
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      const x = cx - 7 + i * 7 + range(-1.5, 1.5);
      const z = cz - 7 + k * 7 + range(-1.5, 1.5);
      const big = i === 1 && k === 1 && chance(0.5);
      const id = big ? 'jacaranda_tree' : pick(['island_tree_02', 'tree_small_02', 'tree_small_02', 'searsia_lucida']);
      model(id, x, z, range(0, TURN), big ? range(0.45, 0.6) : range(0.8, 1.2));
      cover(x, z, 3, 4);
    }
  }
  if (chance(0.6)) model(pick(['boulder_01', 'namaqualand_boulder_02']), cx + range(-9, 9), cz + range(-9, 9), range(0, TURN), range(0.7, 1.3));
  if (chance(0.3)) model('dead_tree_trunk_02', cx + range(-8, 8), cz + range(-8, 8), range(0, TURN));
}

/** North-east: orchards, one species per lot in straight rows, sizes rising row by row. */
function orchardDistrict(cx, cz, lot) {
  const id = ['island_tree_02', 'tree_small_02', 'searsia_lucida', 'fir_sapling_medium'][lot % 4];
  if (id === 'fir_sapling_medium') {
    for (let k = 0; k < 3; k++) model(id, cx - 4.5, cz - 7 + k * 7, 0, 0.7 + k * 0.15);
  } else {
    for (let k = 0; k < 4; k++) row(id, cx, cz - 7.5 + k * 5, 'x', 5, 4.6, (lot * 0.7) % TURN, 0.8 + k * 0.13);
  }
  for (let k = 0; k < 3; k++) row('grass_medium_01', cx, cz - 5 + k * 5, 'x', 3, 7, 0, 0.9);
  if (lot % 3 === 0) model('wooden_picnic_table', cx - 9, cz + 10, Q);
}

/** South-west: industrial blocks, two or three modules per lot by its index. */
function industrial(cx, cz, lot) {
  const modules = [
    () => row('modular_industrial_pipes_01', cx - 2, cz - LOT / 2 + 2.4, 'x', 8, 1.45),
    () => { for (let i = 0; i < 3; i++) row(pick(['Barrel_01', 'barrel_03']), cx - 8, cz - 5 + i * 0.75, 'x', 4, 0.72); },
    () => { stack('wooden_crate_01', cx + 3, cz - 5, 3); stack('cardboard_box_01', cx + 7, cz - 5, 3, Q); },
    () => { row('covered_car', cx - 4, cz + 6, 'x', 3, 3.1); row('concrete_road_barrier', cx - 4, cz + 9.5, 'x', 6, 1.6); },
    () => row('modular_chainlink_fence', cx + 11.2, cz + 2, 'z', 2, 8.1, Q),
    () => { row('propane_tank', cx + 8, cz + 2, 'z', 5, 0.42); row('old_tyre', cx + 4, cz + 2, 'x', 5, 0.66); },
    () => model('modular_electricity_poles', cx + 0.8, cz + 10, 0)
  ];
  modules[lot % modules.length]();
  modules[(lot + 2) % modules.length]();
  modules[(lot + 4) % modules.length]();
  if (lot % 2) model('utility_box_01', cx - 10, cz + range(-6, 6), Q);
}

/** South-east: meadows and picnic grounds. */
function meadowDistrict(cx, cz, lot) {
  for (let i = 0; i < 5; i++) {
    for (let k = 0; k < 5; k++) {
      model((i + k + lot) % 4 ? 'grass_medium_01' : 'dandelion_01', cx - 8 + i * 4 + range(-1, 1), cz - 8 + k * 4 + range(-1, 1), range(0, TURN), range(0.8, 1.2));
    }
  }
  if (lot % 2) model('wooden_picnic_table', cx + range(-4, 4), cz + range(-4, 4), range(0, TURN));
  if (lot % 3 === 0) model(pick(TREES.slice(1, 4)), cx + range(-8, 8), cz + range(-8, 8), range(0, TURN), range(0.9, 1.2));
  if (lot % 4 === 1) model('boulder_01', cx + range(-8, 8), cz + range(-8, 8), range(0, TURN));
  if (lot % 5 === 2) model('fire_hydrant', cx - 10, cz + range(-6, 6), Q);
}

// === The grid ===

let lotIndex = 0;
for (let row_ = 0; row_ < SIDE; row_++) {
  for (let col = 0; col < SIDE; col++) {
    const cx = -HALF + LOT / 2 + col * LOT;
    const cz = -HALF + LOT / 2 + row_ * LOT;
    const dr = row_ - MID;
    const dc = col - MID;
    const onAvenue = dc === 0 && dr > 0;
    const onBoulevard = dr === 0 && dc > 0;
    // Walls on the north and west so lots read as a grid of yards, except
    // where a road runs through; the outer ring closes the other edges.
    if (!(dr === 0 && dc === 0)) {
      if (!onAvenue) wall(cx, cz - LOT / 2 + 1);
      if (!onBoulevard) wall(cx - LOT / 2 + 1, cz, Q);
    }
    if (dr === 0 && dc === 0) {
      // The yard: its own objects, plus street lamps at two corners in
      // place of its floating lamp balls, which are filtered out below.
      for (const [sx, sz] of [[-1, -1], [1, 1]]) lamp(cx + sx * (LOT / 2 - 3), cz + sz * (LOT / 2 - 3));
      continue;
    }
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) {
      if (dr === -1 && dc === 0) orchard(cx, cz);
      else if (dr === 0 && dc === -1) lightingLab(cx, cz);
      else if (dr === -1 && dc === 1) rockGarden(cx, cz);
      else if (dr === -1 && dc === -1) meadow(cx, cz);
      else if (dr === 1 && dc === 1) depot(cx, cz);
      else if (dr === 1 && dc === -1) carPark(cx, cz);
      else if (dr === 0 && dc === 1) boulevard(cx, cz, gallery);
      else if (dr === 1 && dc === 0) avenue(cx, cz, 0);
      continue;
    }
    if (onBoulevard) { boulevard(cx, cz, dc === 2 ? sphereMatrix : parking); continue; }
    if (onAvenue) { avenue(cx, cz, dr); continue; }
    // The other lots keep two corner lamps and take their district's layout.
    for (const [sx, sz] of [[-1, -1], [1, 1]]) lamp(cx + sx * (LOT / 2 - 3), cz + sz * (LOT / 2 - 3));
    const lot = lotIndex++;
    if (dr < 0 && dc <= 0) forest(cx, cz);
    else if (dr < 0) orchardDistrict(cx, cz, lot);
    else if (dr > 0 && dc < 0) industrial(cx, cz, lot);
    else if (dr > 0) meadowDistrict(cx, cz, lot);
    else if (dc < 0) forest(cx, cz); // row 7 west of the lab: forest continues to the edge
  }
}

// The outer ring: walls closing the east and south edges of the grid, and
// the fort — a 70 m scan of a stone wall — standing beyond the north edge.
for (let i = 0; i < SIDE; i++) {
  const c = -HALF + LOT / 2 + i * LOT;
  wall(c, HALF - 1);
  wall(HALF - 1, c, Q);
}
model('modular_fort_01', 0, -HALF - 30, Q);

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
      // The yard's ground stretched under the whole lot; the rest of the
      // yard as it is, minus its floating lamp balls — the lot lights
      // from its street lamps' heads instead.
      ...yard.layers[0].objects
        .filter((o) => o.prefab !== 'lamp')
        .map((o) => (o.id === 'floor'
          ? { ...o, width: SIDE * LOT + 60, depth: SIDE * LOT + 60 }
          : o)),
      ...objects
    ],
    props: [...props.values()]
  }]
};

const out = `${here}../src/yard/scenes/lot.json`;
writeFileSync(out, JSON.stringify(scene));
console.log(`Wrote ${out}: ${SIDE * SIDE - 1} lots, ${total} prop instances in ${props.size} props, ${objects.length} exhibit objects`);
