/**
 * Lays out the lot: `node scripts/buildLotScene.mjs --force`.
 *
 * The lot is a corner of a small town on a late afternoon, where Main
 * Road (east to west) crosses Station Road (north to south). It is built
 * as a place: every quarter of the crossing has a purpose, every building
 * faces the street it belongs to, and the props stand where someone left
 * them. The thousands of placed things that the resident instances, GPU
 * culling, levels of detail and streaming exist for are the woodland, the
 * meadow and the planting; the engine's lights, emissives, reflections
 * and physics each have a reason to be in the shot. T turns it to dusk,
 * when the windows and the street lamps carry the light.
 *
 *   - **The corner shops** (south-east): a grocer on the corner with the
 *     milk truck at the kerb and its crates on the pavement, a shuttered
 *     shop, and a café with tables out front. Behind them, the car park.
 *   - **The terrace** (south-west): seven houses facing Main Road over
 *     front gardens, each back garden somebody's — a vegetable plot, a
 *     patio, an overgrown one, a gnome garden — down to a back lane and
 *     the meadow beyond.
 *   - **The works depot** (north-west): a warehouse with roller doors and
 *     a loading dock, an office by the gate, an open-fronted workshop,
 *     stock in barriered bays, the fleet under covers, behind brick on
 *     the roads and chain-link at the back.
 *   - **The park** (north-east): a hedge with gates, a jacaranda avenue
 *     up to a cobbled plaza with a statue and a coffee cart, a picnic
 *     ground, a rock garden.
 *   - **The allotments** (east, behind the shops): fenced plots of fruit
 *     trees between gravel tracks, with a shed.
 *   - **Woodland** fills the north, scattered by noise so it clusters and
 *     thins, with a dirt track to a ruined fort; **meadow** is the south.
 *
 * Nothing is scattered onto a road, a path, a pad, a garden or a
 * compound: every surface declares itself and the scatter asks before it
 * places. The buildings are primitive shells — boxes mapped with Poly
 * Haven textures, a gable as a box turned 45 degrees about its ridge with
 * its lower half inside the house — dressed with scanned shutters, lamps
 * and furniture. Most of the lot is `props`: presentation laid out as
 * `[x, y, z, yaw, scale]` tuples, drawn from the GPU without an entity;
 * the roofs (which turn on two axes) and the things the fox can shove
 * (crates, barrels, the ball, the gazing globe) are objects. Models are
 * Poly Haven scans compiled by `scripts/compileModel.mjs`, pieces of the
 * modular kits cut by `PIECES` in `fetchPolyHaven.mjs` (see
 * THIRD_PARTY_NOTICES.md). The output is committed; the game loads the JSON.
 *
 * Units are metres, y up, x east and z south, as the yard's; the crossing
 * is the origin. A model stands on its origin unless SIZES says otherwise
 * (`lift`). A wall-mounted scan (a lamp, a shutter, a hose) faces its +z
 * out of the wall, so `facing` turns it to the street. Anything a fox
 * should not walk through has a collider: walls, buildings, fences and
 * most props as their bounds, trees as a trunk.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeScene } from 'm2d-editor-core';
import { seedTarget } from './seedScene.mjs';

// A seed: writes the scene only when it is not there; see seedScene.mjs.
const out = seedTarget(new URL('../src/yard/scenes/lot.json', import.meta.url));

const here = fileURLToPath(new URL('.', import.meta.url));
const yard = JSON.parse(readFileSync(`${here}../src/yard/scenes/yard.json`, 'utf8'));

// === Numbers ===

let seed = 11112026;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const range = (a, b) => a + rand() * (b - a);
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
const r = (v) => Math.round(v * 100) / 100;
const TURN = Math.PI * 2;
const Q = Math.PI / 2;

/** Smooth value noise in 0..1 over a unit grid, `layer` picking an independent field. */
const hash = (ix, iz, layer) => {
  let h = Math.imul(ix ^ Math.imul(iz, 0x27d4eb2d) ^ Math.imul(layer + 1, 0x165667b1), 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const lattice = (x, z, layer) => {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, layer), b = hash(ix + 1, iz, layer), c = hash(ix, iz + 1, layer), d = hash(ix + 1, iz + 1, layer);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
};
/** Two octaves: broad clumps with ragged edges, as a wood thins and thickens. */
const noise = (x, z, layer = 0) => 0.65 * lattice(x, z, layer) + 0.35 * lattice(x * 2.7 + 11, z * 2.7 + 7, layer + 10);

/** The yaw that turns a shape's x axis along the direction from a to b (yaw turns +x towards -z). */
const yawAlong = (ax, az, bx, bz) => Math.atan2(-(bz - az), bx - ax);
/** The yaw that turns a model's front (its +z) from (x, z) towards (tx, tz): a bench facing a path. */
const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
/** A point `t` of the way from a to b, offset `side` metres to its right (looking from a to b, right is +z when heading +x). */
const along = (ax, az, bx, bz, t, side = 0) => {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;
  return [ax + dx * t + nx * side, az + dz * t + nz * side];
};
/** A quaternion [x, y, z, w]: `yaw` about +y, after `pitch` about the shape's own x axis. */
const quat = (yaw, pitch = 0) => {
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2);
  return [cy * sx, sy * cx, -sy * sx, cy * cx].map((v) => Math.round(v * 1e6) / 1e6);
};

// === The models ===

/** The compiled Poly Haven models and kit pieces, by the key a prefab names. */
const MODELS = [
  // Trees.
  'jacaranda_tree', 'island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02', 'searsia_lucida',
  'fir_sapling', 'pine_tree', 'pine_tree_b', 'dead_tree_trunk', 'dead_tree_trunk_02', 'tree_stump_01',
  // Ground cover.
  'grass_medium_01', 'grass_medium_02', 'fern_02', 'shrub_02', 'shrub_large', 'shrub_01', 'shrub_03', 'nettle_plant',
  'dandelion_01', 'flower_gazania', 'moss_01', 'weed_plant_02', 'periwinkle_plant', 'dry_branches_medium_01',
  // Rocks.
  'boulder_01', 'rock_moss_set_01', 'namaqualand_boulder_02',
  // The depot's stock and gear.
  'Barrel_01', 'barrel_03', 'wooden_crate_01', 'wooden_crate_02', 'cardboard_box_01', 'plastic_crate_03',
  'modular_industrial_pipes_01', 'propane_tank', 'old_tyre', 'hand_truck', 'industrial_storage_cart', 'covered_car',
  'concrete_road_barrier', 'tool_cart', 'portable_generator', 'wooden_ladder',
  // Street, shop and park furniture.
  'street_lamp_01', 'power_pole', 'fire_hydrant', 'utility_box_01', 'water_manhole_cover', 'trash_can',
  'street_bench', 'painted_wooden_bench', 'planter_box_01', 'planter_box_02', 'wooden_picnic_table',
  'outdoor_table_chair_set_01', 'plastic_monobloc_chair_01', 'stone_fire_pit', 'garden_gnome', 'CoffeeCart_01',
  'potted_plant_01', 'potted_plant_02', 'compost_bags',
  // On walls: shutters, lamps, a hose.
  'shop_shutter_door', 'shop_shutter_window', 'industrial_wall_lamp', 'security_light', 'street_lamp_02',
  'garden_hose_wall_mounted_01',
  // Fences, gates and the fort.
  'fence_panel', 'fence_post', 'fence_gate', 'large_iron_gate', 'fort_tower', 'fort_wall', 'fort_corner', 'fort_gate'
];
const models = Object.fromEntries(MODELS.map((id) => [id, { url: `models/ph/${id}.glb` }]));
// The park's statue is the project library's import, not one of the compiled set.
models.concrete_cat_statue = { url: 'library/models/concrete_cat_statue.glb' };

/**
 * What the layouts need to know of a scan, from its LOD0 bounds: its
 * footprint along x and z, its height, and where its origin sits in y
 * (`lift` is what to add to stand it on the ground). Most stand on their
 * origin; the pipes, the tyre, the fire pit and the stump have theirs
 * at mid height. A kit piece is recentred by the compiler and stands on
 * its origin.
 */
const SIZES = {
  Barrel_01: { x: 0.56, z: 0.56, h: 0.87 }, barrel_03: { x: 0.64, z: 0.64, h: 0.93 },
  wooden_crate_01: { x: 0.82, z: 0.41, h: 0.34 }, wooden_crate_02: { x: 0.53, z: 1.17, h: 0.45 },
  cardboard_box_01: { x: 0.38, z: 0.52, h: 0.34 }, plastic_crate_03: { x: 0.48, z: 0.26, h: 0.27 },
  propane_tank: { x: 0.34, z: 0.34, h: 0.55 }, old_tyre: { x: 0.6, z: 0.16, h: 0.6, lift: 0.3 },
  modular_industrial_pipes_01: { x: 1.4, z: 0.31, h: 1.95, lift: 1.0 },
  concrete_road_barrier: { x: 1.54, z: 0.63, h: 0.82 }, covered_car: { x: 1.8, z: 4.4, h: 1.41 },
  stone_fire_pit: { x: 1.45, z: 1.43, h: 0.39, lift: 0.19 }, tree_stump_01: { x: 1.43, z: 1.59, h: 0.57, lift: 0.19 },
  fence_panel: { x: 1.91, z: 0.04, h: 2.43 }, fence_post: { x: 0.14, z: 0.14, h: 2.52 }, fence_gate: { x: 1.91, z: 0.14, h: 2.52 },
  large_iron_gate: { x: 2.95, z: 0.1, h: 2.93 }, street_bench: { x: 2.45, z: 0.74, h: 0.95 }, trash_can: { x: 0.62, z: 0.56, h: 0.91 },
  painted_wooden_bench: { x: 1.16, z: 0.5, h: 0.89 }, planter_box_01: { x: 0.91, z: 0.41, h: 0.42 },
  wooden_picnic_table: { x: 2.24, z: 3.0, h: 0.75 }, street_lamp_01: { h: 3.87 }, power_pole: { h: 6.0 },
  fort_tower: { x: 15.8, z: 15.8, h: 13.5 }, fort_wall: { x: 4.17, z: 14.56, h: 8.53 },
  fort_corner: { x: 5.84, z: 5.84, h: 8.53 }, fort_gate: { x: 2.67, z: 7.41, h: 8.61 },
  shop_shutter_door: { x: 1.08, z: 0.3, h: 2.4 }, shop_shutter_window: { x: 2.1, z: 0.3, h: 1.85 },
  // Wall-mounted, with the origin at the fixing: the lamps hang about it.
  industrial_wall_lamp: { x: 0.28, z: 0.14, h: 0.42 }, security_light: { x: 0.32, z: 0.42, h: 0.53 },
  street_lamp_02: { x: 0.38, z: 0.81, h: 1.67 }, garden_hose_wall_mounted_01: { x: 0.46, z: 0.25, h: 0.56 },
  CoffeeCart_01: { x: 2.17, z: 1.08, h: 1.72 }, tool_cart: { x: 1.28, z: 0.75, h: 0.96 },
  portable_generator: { x: 0.81, z: 0.56, h: 0.58 }, compost_bags: { x: 1.82, z: 0.93, h: 0.7 }
};

// === Prefabs ===

/**
 * A primitive surface: a box mapped planar with a Poly Haven texture,
 * `size` metres per tile — its colour, normal and occlusion-roughness-metal
 * maps. The map decides how rough and how metallic the surface is, so the
 * mesh's own roughness and metallic stay at 1 and scale it by nothing;
 * `roughness` is kept for the call sites' record and the editor's
 * fallback, and is what a surface without its maps draws with.
 */
const surface = (color, maps, size, roughness = 0.95, shape = undefined) => ({
  actor: 'Ground', mesh: { ...(shape && { shape }), color, ...(maps.arm ? { roughness: 1, metallic: 1 } : { roughness }), texture: { ...maps, size } }
});
/** The same, as a static body: what a roof object (rather than a prop) needs. */
const solid = (color, url, size, roughness = 0.9) => ({ ...surface(color, url, size, roughness), physics: { bodyType: 'static', friction: 0.6 } });
/** A plain painted part: a window frame, a door, a sign. */
const paint = (color, roughness = 0.6, extra = {}) => ({ actor: 'Ground', mesh: { color, roughness, ...extra } });
/** A fetched texture's three maps, as `mesh.texture` names them. */
const tex = (id) => ({ url: `textures/${id}_diff_1k.jpg`, normal: `textures/${id}_nor_gl_1k.jpg`, arm: `textures/${id}_arm_1k.jpg` });

/**
 * The sculpture terrace's materials, by what each shows. Metals: full
 * metal, the roughness from a mirror to a rough casting. Dielectrics:
 * a lacquer (clearcoat) over a matte base, glass by opacity with a high
 * reflectance, plastics and rubber by roughness and reflectance alone,
 * and lights by an emissive colour of their own, which bloom catches.
 */
const GALLERY = {
  chrome: { color: '#f2f2f2', metallic: 1, roughness: 0.04 },
  brushed_steel: { color: '#c8cacc', metallic: 1, roughness: 0.4 },
  gold: { color: '#ffd27a', metallic: 1, roughness: 0.15 },
  copper: { color: '#e0906a', metallic: 1, roughness: 0.25 },
  bronze: { color: '#8a6a3a', metallic: 1, roughness: 0.6 },
  cast_iron: { color: '#3a3a3c', metallic: 1, roughness: 0.85 },
  anodised_blue: { color: '#4a78c8', metallic: 1, roughness: 0.3 },
  titanium: { color: '#8c8a86', metallic: 1, roughness: 0.5 },
  car_paint_red: { color: '#a0101a', metallic: 0, roughness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 },
  pearl_lacquer: { color: '#f4f2ec', metallic: 0, roughness: 0.7, clearcoat: 1, clearcoatRoughness: 0.1 },
  varnished_wood: { color: '#7a4a24', metallic: 0, roughness: 0.75, clearcoat: 0.8, clearcoatRoughness: 0.25 },
  clear_glass: { color: '#eef6ff', metallic: 0, roughness: 0.02, opacity: 0.15, specular: 1.5 },
  tinted_glass: { color: '#2a6ac0', metallic: 0, roughness: 0.04, opacity: 0.4, specular: 1.3 },
  frosted_glass: { color: '#d8ecf4', metallic: 0, roughness: 0.5, opacity: 0.6 },
  glossy_plastic: { color: '#2a8a4a', metallic: 0, roughness: 0.12 },
  matte_clay: { color: '#c8744a', metallic: 0, roughness: 0.95, specular: 0.5 },
  rubber: { color: '#141414', metallic: 0, roughness: 0.9, specular: 0.6 },
  neon_pink: { color: '#ff2a9a', emissiveColor: '#ff2a9a', emissive: 6, roughness: 0.4 },
  neon_cyan: { color: '#30e0ff', emissiveColor: '#30e0ff', emissive: 6, roughness: 0.4 },
  lamp_amber: { color: '#ffb040', emissiveColor: '#ffb040', emissive: 3, roughness: 0.6 }
};

const prefabs = {
  ...yard.prefabs,
  // The yard's ground under the whole lot: lawn instead of the dev grid.
  ground: { ...yard.prefabs.ground, mesh: { color: '#eef2e4', roughness: 1, metallic: 1, texture: { ...tex('leafy_grass'), size: 3 } } },
  // The yard's crates, which the fox can shove: planks rather than flat orange.
  crate: { ...yard.prefabs.crate, mesh: { color: '#d8b890', roughness: 1, metallic: 1, texture: { ...tex('brown_planks_09'), size: 1 } } },
  // Barrels on the depot's apron, in the depot's blue.
  barrel: { ...yard.prefabs.barrel, mesh: { color: '#2f5f9e', metallic: 0.3, roughness: 0.45 } },
  // One prefab per model, drawn with the file's own materials.
  ...Object.fromEntries(Object.keys(models).map((id) => [id, { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { model: id } }])),
  // Ground surfaces. A strip of any length tiles without stretching
  // because the texture is mapped from the world, not the shape.
  road: surface('#9a9a96', tex('asphalt_03'), 4),
  kerb: surface('#d8d4cc', tex('concrete_floor_02'), 1, 0.9),
  paving: surface('#eeece8', tex('concrete_pavement_03'), 2, 0.9),
  concrete: surface('#dcd8d0', tex('concrete_floor_02'), 2, 0.9),
  gravel: surface('#c9c2b6', tex('gravel_floor_02'), 2.5),
  litter: surface('#ece8e0', tex('forest_leaves_03'), 3),
  dirt: surface('#d6cdc0', tex('dirt_floor'), 3),
  herringbone: surface('#f2ece4', tex('herringbone_pavement'), 2, 0.85),
  plaza: surface('#f4f0ea', tex('cobblestone_floor_04'), 2.5, 0.9, 'cylinder'),
  plinth: surface('#cfcac0', tex('concrete_floor_02'), 1, 0.9, 'cylinder'),
  // Building shells and the walls along the roads.
  wall: surface('#f2ece4', tex('brick_wall_006'), 2, 0.85),
  brick_factory: surface('#f4ece2', tex('factory_brick'), 2.4, 0.85),
  brick_red: surface('#f4eae4', tex('red_brick_03'), 1.8, 0.85),
  stucco_cream: surface('#f6e9cc', tex('white_stucco'), 3, 0.9),
  stucco_blue: surface('#d2e0ea', tex('white_stucco'), 3, 0.9),
  stucco_sage: surface('#d8e0c6', tex('white_stucco'), 3, 0.9),
  stucco_pink: surface('#f2d6cc', tex('white_stucco'), 3, 0.9),
  stucco_white: surface('#f4f2ec', tex('white_stucco'), 3, 0.9),
  plaster_yellow: surface('#fff4dc', tex('yellow_plaster'), 3, 0.9),
  cladding: surface('#e6e6e2', tex('exterior_wall_cladding'), 2.5, 0.8),
  corrugated: surface('#d6dadc', tex('corrugated_iron_02'), 2, 0.6),
  shutter: surface('#c8d2dc', tex('painted_metal_shutter'), 2.5, 0.55),
  // Shipping containers: corrugated steel in the colours they come in.
  container_red: surface('#c87060', tex('corrugated_iron_02'), 2, 0.55),
  container_blue: surface('#7894bc', tex('corrugated_iron_02'), 2, 0.55),
  container_green: surface('#86a284', tex('corrugated_iron_02'), 2, 0.55),
  coping: surface('#d8d4cc', tex('concrete_floor_02'), 1, 0.9),
  timber: surface('#c8b090', tex('brown_planks_09'), 1.5, 0.85),
  // Roofs: objects, since a pitch turns them on two axes.
  roof_clay: solid('#f0d8c8', tex('clay_roof_tiles'), 2, 0.8),
  roof_grey: solid('#e4e6e8', tex('grey_roof_tiles'), 2, 0.8),
  gable_brick_red: solid('#f4eae4', tex('red_brick_03'), 1.8, 0.85),
  gable_stucco_cream: solid('#f6e9cc', tex('white_stucco'), 3),
  gable_stucco_blue: solid('#d2e0ea', tex('white_stucco'), 3),
  gable_stucco_sage: solid('#d8e0c6', tex('white_stucco'), 3),
  gable_stucco_pink: solid('#f2d6cc', tex('white_stucco'), 3),
  gable_stucco_white: solid('#f4f2ec', tex('white_stucco'), 3),
  gable_plaster_yellow: solid('#fff4dc', tex('yellow_plaster'), 3),
  gable_corrugated: solid('#d6dadc', tex('corrugated_iron_02'), 2, 0.6),
  // Windows: a painted frame, and glass that is either dark and glossy,
  // taking the sky, or warm with a room lit behind it. Lit glass is
  // metallic so the colour tints its reflection rather than lighting it
  // like paint: a cream pane is matte cream in daylight otherwise.
  frame: paint('#eeeae2', 0.55),
  frame_dark: paint('#2a2e30', 0.5),
  glass: paint('#1a222c', 0.05, { metallic: 0 }),
  glass_lit: paint('#ffc07a', 0.2, { metallic: 1, emissive: 0.4 }),
  shop_glass: paint('#c89a68', 0.16, { metallic: 1, emissive: 0.6 }),
  door_red: paint('#8e2a26', 0.45), door_blue: paint('#264a72', 0.45), door_green: paint('#2c5a44', 0.45),
  door_black: paint('#1e2022', 0.4), door_yellow: paint('#d8a83a', 0.45), door_wood: surface('#b08860', tex('brown_planks_09'), 1, 0.7),
  sign_green: paint('#1f3d33', 0.5), sign_navy: paint('#25304e', 0.5), sign_maroon: paint('#5e2026', 0.5),
  awning: paint('#2f5d47', 0.9), awning_red: paint('#8a3030', 0.9),
  // The sculpture terrace: one material a plinth, so the engine's surfaces
  // can be read side by side. Metals along one row from mirror to cast
  // iron; lacquers, glass, plastics and lights along the other.
  ...Object.fromEntries(Object.entries(GALLERY).map(([name, mesh]) => [`sculpture_${name}`, { actor: 'Ground', mesh: { shape: 'sphere', ...mesh } }])),
  glass_pane: { actor: 'Ground', mesh: { color: '#6aa8d8', metallic: 0, roughness: 0.03, opacity: 0.3, specular: 1.4 } },
  frame_steel: { actor: 'Ground', mesh: { color: '#8a8e94', metallic: 1, roughness: 0.35 } },
  // A warm glow inside each street lamp's glass head. The visible shell
  // must not cast, or it would shadow its own light into darkness.
  lantern: {
    actor: 'Ground',
    mesh: { shape: 'sphere', color: '#ffd9a0', emissive: 10, roughness: 1, castShadow: false },
    light: { type: 'point', color: '#ffc473', intensity: 70, range: 24 }
  },
  // Smaller lights: a lantern by a front door, a lamp over a roller door,
  // and the spill from a lit shop window onto its pavement.
  door_glow: {
    actor: 'Ground',
    mesh: { shape: 'sphere', color: '#ffd9a0', emissive: 8, roughness: 1, castShadow: false },
    light: { type: 'point', color: '#ffc880', intensity: 14, range: 9 }
  },
  bay_glow: {
    actor: 'Ground',
    mesh: { shape: 'sphere', color: '#fff2dc', emissive: 8, roughness: 1, castShadow: false },
    light: { type: 'point', color: '#ffe8c8', intensity: 60, range: 18 }
  },
  window_spill: {
    actor: 'Ground',
    // A prop draws its mesh whatever `visible` says, so the carrier is a speck.
    mesh: { shape: 'sphere', color: '#000000', roughness: 1, castShadow: false },
    light: { type: 'point', color: '#ffd8a0', intensity: 14, range: 8 }
  }
};

/** What each model collides as: its bounds, a trunk, or nothing for what a fox walks through. */
const TRUNK = { shape: 'cylinder', width: 0.6, height: 4 };
const COLLIDERS = {
  jacaranda_tree: { shape: 'cylinder', width: 1.6, height: 6 }, island_tree_01: TRUNK, island_tree_02: TRUNK, island_tree_03: TRUNK,
  tree_small_02: { shape: 'cylinder', width: 0.4, height: 3 }, searsia_lucida: { shape: 'cylinder', width: 0.4, height: 2 },
  fir_sapling: { shape: 'cylinder', width: 0.4, height: 4 }, pine_tree: { shape: 'cylinder', width: 0.9, height: 8 }, pine_tree_b: { shape: 'cylinder', width: 0.7, height: 6 },
  grass_medium_01: 'none', grass_medium_02: 'none', fern_02: 'none', shrub_02: 'none', shrub_01: 'none', shrub_03: 'none',
  nettle_plant: 'none', dandelion_01: 'none', flower_gazania: 'none', moss_01: 'none', weed_plant_02: 'none', periwinkle_plant: 'none',
  dry_branches_medium_01: 'none', rock_moss_set_01: 'none', water_manhole_cover: 'none', garden_gnome: 'none',
  street_lamp_01: { shape: 'cylinder', width: 0.3, height: 3.9 }, power_pole: { shape: 'cylinder', width: 0.3, height: 6 },
  // On walls, and the walls already stop the fox.
  shop_shutter_door: 'none', shop_shutter_window: 'none', industrial_wall_lamp: 'none', security_light: 'none',
  street_lamp_02: 'none', garden_hose_wall_mounted_01: 'none',
  lantern: 'none', door_glow: 'none', bay_glow: 'none', window_spill: 'none',
  road: 'none', kerb: 'none', paving: 'none', concrete: 'none', gravel: 'none', litter: 'none', dirt: 'none', plaza: 'none', herringbone: 'none',
  frame: 'none', frame_dark: 'none', glass: 'none', glass_lit: 'none', shop_glass: 'none', sign_green: 'none', sign_navy: 'none', sign_maroon: 'none',
  door_red: 'none', door_blue: 'none', door_green: 'none', door_black: 'none', door_yellow: 'none', door_wood: 'none', shutter: 'none'
};

// === Placement ===

/** Placed objects — entities with bodies: the roofs, and what the fox can push about. */
const objects = [];
let objectCount = 0;
const object = (prefab, x, y, z, size, rotation) => objects.push({
  id: `${prefab}-${++objectCount}`, prefab, x: r(x), y: r(y), z: r(z),
  ...(size && { width: r(size.width), height: r(size.height), ...(size.depth !== undefined && { depth: r(size.depth) }) }),
  ...(rotation && { rotation })
});

/** The props: one entry per prefab and size, accumulating instances. */
const props = new Map();
const place = (prefab, size, x, y, z, yaw = 0, scale = 1) => {
  const key = size ? `${prefab}-${size.width}x${size.height}x${size.depth ?? size.width}` : prefab;
  let prop = props.get(key);
  if (!prop) props.set(key, prop = { id: `props-${key}`.replace(/\./g, '_'), prefab, ...size, collider: COLLIDERS[prefab] ?? 'bounds', instances: [] });
  prop.instances.push([r(x), r(y), r(z), r(yaw), r(scale)]);
};
/** A scan standing on the ground at (x, z), lifted where its origin is not at its feet. */
const model = (id, x, z, yaw = 0, scale = 1, y = 0) => place(id, null, x, y + (SIZES[id]?.lift ?? 0) * scale, z, yaw, scale);
/** A box of a prefab, `w` along x, `h` tall and `d` along z before `yaw`, standing with its base at `y`. */
const box = (prefab, x, y, z, w, h, d, yaw = 0) => place(prefab, { width: r(w), height: r(h), depth: r(d) }, x, y + h / 2, z, yaw);
/** A box of a surface prefab, its top `top` metres above the ground. */
const slab = (prefab, x, z, w, d, top, yaw = 0, thickness = Math.max(0.02, top)) => {
  place(prefab, { width: r(w), height: r(thickness), depth: r(d) }, x, top - thickness / 2, z, yaw);
};
/** A rectangle of surface between two corners, whichever way round they are given. */
const patch = (prefab, x0, z0, x1, z1, top) => slab(prefab, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), top);
/** A strip of surface `w` wide from a to b. */
const strip = (prefab, ax, az, bx, bz, w, top) => {
  slab(prefab, (ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az), w, top, yawAlong(ax, az, bx, bz));
};
const LAMP_HEAD = 3.32;
/** A street lamp with a glowing head. */
const lamp = (x, z, yaw = range(0, TURN)) => {
  model('street_lamp_01', x, z, yaw);
  place('lantern', { width: 0.22, height: 0.22, depth: 0.22 }, x, LAMP_HEAD, z);
};
/** A brick wall from a to b, `h` tall, standing on the ground. */
const wall = (ax, az, bx, bz, h = 2.2, prefab = 'wall', t = 0.45) => {
  const len = Math.hypot(bx - ax, bz - az);
  place(prefab, { width: r(len), height: h, depth: t }, (ax + bx) / 2, h / 2, (az + bz) / 2, yawAlong(ax, az, bx, bz));
  // A concrete coping along the top keeps a brick wall from ending in raw brick.
  place('coping', { width: r(len + 0.04), height: 0.08, depth: r(t + 0.08) }, (ax + bx) / 2, h + 0.04, (az + bz) / 2, yawAlong(ax, az, bx, bz));
};
/**
 * Chain-link from a to b: a post every two metres with a panel between,
 * and, where `gate` names a distance along the run, a gate in place of
 * that panel. `gaps` are [from, to] distances left open for an entrance.
 */
const fence = (ax, az, bx, bz, { gaps = [], gate = null } = {}) => {
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = yawAlong(ax, az, bx, bz);
  const open = (d) => gaps.some(([from, to]) => d > from && d < to);
  const bays = Math.round(len / 2);
  const pitch = len / bays;
  for (let i = 0; i <= bays; i++) {
    const d = i * pitch;
    if (open(d - 0.01) && open(d + 0.01)) continue;
    const [x, z] = along(ax, az, bx, bz, d / len);
    model('fence_post', x, z, yaw);
  }
  for (let i = 0; i < bays; i++) {
    const d = (i + 0.5) * pitch;
    if (open(d)) continue;
    const [x, z] = along(ax, az, bx, bz, d / len);
    model(gate !== null && Math.abs(d - gate) < pitch / 2 ? 'fence_gate' : 'fence_panel', x, z, yaw, pitch / 2.05);
  }
};
/** A close-boarded garden fence from a to b, posts and boards, `h` tall, with `gaps` [from, to] open. */
const boards = (ax, az, bx, bz, h = 1.7, gaps = []) => {
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = yawAlong(ax, az, bx, bz);
  const cuts = [0, ...gaps.flat(), len];
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const [from, to] = [cuts[i], cuts[i + 1]];
    if (to - from < 0.1) continue;
    const [x, z] = along(ax, az, bx, bz, (from + to) / 2 / len);
    place('timber', { width: r(to - from), height: h, depth: 0.06 }, x, h / 2, z, yaw);
    for (let d = from; d <= to + 0.01; d += Math.max(0.5, (to - from) / Math.max(1, Math.round((to - from) / 2.4)))) {
      const [px, pz] = along(ax, az, bx, bz, Math.min(d, to) / len);
      place('timber', { width: 0.1, height: r(h + 0.08), depth: 0.1 }, px, (h + 0.08) / 2, pz, yaw);
    }
  }
};
/** `count` of a model in a line from (x, z) along `dir`, `pitch` apart. */
const row = (id, x, z, dir, count, pitch, yaw = 0, scale = 1, y = 0) => {
  for (let i = 0; i < count; i++) {
    const o = (i - (count - 1) / 2) * pitch;
    model(id, x + (dir === 'x' ? o : 0), z + (dir === 'z' ? o : 0), yaw, scale, y);
  }
};
/** A pyramid of `levels` courses of a crate, each course one shorter, along x (or z when turned). */
const stack = (id, x, z, levels, yaw = 0) => {
  const s = SIZES[id];
  const step = yaw ? s.z : s.x;
  for (let level = 0; level < levels; level++) {
    const count = levels - level;
    for (let i = 0; i < count; i++) {
      const o = (i - (count - 1) / 2) * (step + 0.02);
      model(id, x + (yaw ? 0 : o), z + (yaw ? o : 0), yaw, 1, level * s.h);
    }
  }
};
/** A block of `cols` by `rows` of a thing, `pitch` apart, with a little drift so it is not a lattice. */
const block = (id, x, z, cols, rows, pitch, yawJitter = 0.3) => {
  for (let i = 0; i < cols; i++) {
    for (let k = 0; k < rows; k++) {
      model(id, x + (i - (cols - 1) / 2) * pitch + range(-0.02, 0.02), z + (k - (rows - 1) / 2) * pitch + range(-0.02, 0.02), range(-yawJitter, yawJitter));
    }
  }
};

// === Buildings ===

/**
 * A building: a shell `w` by `d` and `h` to the eaves, centred on (x, z)
 * and turned by `yaw`, so that its front — the face windows and doors go
 * on first — is its local +z. Returns a frame that maps local
 * coordinates to the world and places things on its faces.
 *
 * `roof` is `'gable'` (ridge along the local x, at 45 degrees: a box d/√2
 * square turned about the ridge, its lower half inside the shell and its
 * upper half the gable, with tiled slabs on both slopes), or `'flat'`
 * (a parapet and a coping), or `'none'`.
 */
function building({ x, z, w, d, h, yaw = 0, walls, roof = 'gable', roofTiles = 'roof_clay', chimney = null }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  box(walls, x, 0, z, w, h, d, yaw);
  if (roof === 'gable') {
    const side = d / Math.SQRT2;
    object(`gable_${walls}`, x, h, z, { width: w, height: side, depth: side }, quat(yaw, Math.PI / 4));
    const slope = side + 0.45;
    for (const sign of [-1, 1]) {
      // Each slope's centre, a tile's thickness out from the gable's face.
      const out = 0.09;
      const [cx, cz] = at(0, sign * (d / 4 + out / Math.SQRT2));
      object(roofTiles, cx, h + d / 4 + out / Math.SQRT2, cz, { width: w + 0.4, height: 0.14, depth: slope }, quat(yaw, sign * Math.PI / 4));
    }
    if (chimney !== null) {
      const [cx, cz] = at(chimney * (w / 2 - 0.7), 0);
      // Chimneys are brick whatever the house is rendered in.
      box('brick_red', cx, h, cz, 0.7, d / 2 + 1.1, 1.1, yaw);
      box('coping', cx, h + d / 2 + 1.1, cz, 0.82, 0.12, 1.22, yaw);
    }
  } else if (roof === 'flat') {
    box('coping', x, h, z, w + 0.2, 0.5, d + 0.2, yaw);
  }
  /** A point on a face: `face` 1 for the front (+z), -1 the back, along it by `u`, `out` proud of the wall. */
  const onFace = (face, u, out = 0) => at(face * u, face * (d / 2 + out));
  const faceYaw = (face) => yaw + (face > 0 ? 0 : Math.PI);
  /** On a gable end: `end` 1 for local +x. */
  const onEnd = (end, u, out = 0) => at(end * (w / 2 + out), -end * u);
  const endYaw = (end) => yaw + end * Q;
  return {
    at, onFace, faceYaw, onEnd, endYaw, w, d, h,
    /** A sash window: frame, sill and glass, lit or not. */
    window(face, u, y, { lit = chance(0.3), ww = 1.1, wh = 1.4, end = false } = {}) {
      const [fx, fz] = end ? onEnd(face, u, 0.03) : onFace(face, u, 0.03);
      const [gx, gz] = end ? onEnd(face, u, 0.07) : onFace(face, u, 0.07);
      const [sx, sz] = end ? onEnd(face, u, 0.1) : onFace(face, u, 0.1);
      const fy = end ? endYaw(face) : faceYaw(face);
      place('frame', { width: r(ww + 0.2), height: r(wh + 0.2), depth: 0.08 }, fx, y + wh / 2, fz, fy);
      place(lit ? 'glass_lit' : 'glass', { width: r(ww), height: r(wh), depth: 0.04 }, gx, y + wh / 2, gz, fy);
      place('coping', { width: r(ww + 0.4), height: 0.08, depth: 0.2 }, sx, y - 0.1, sz, fy);
    },
    /** A front door with a step, and a lantern beside it. */
    door(face, u, prefab, { lantern = true, dw = 1.0, dh = 2.15 } = {}) {
      const [dx, dz] = onFace(face, u, 0.05);
      const [fx, fz] = onFace(face, u, 0.02);
      place('frame', { width: r(dw + 0.24), height: r(dh + 0.12), depth: 0.08 }, fx, dh / 2 + 0.06, fz, faceYaw(face));
      place(prefab, { width: dw, height: dh, depth: 0.06 }, dx, dh / 2, dz, faceYaw(face));
      const [sx, sz] = onFace(face, u, 0.25);
      place('coping', { width: r(dw + 0.5), height: 0.12, depth: 0.5 }, sx, 0.06, sz, faceYaw(face));
      if (lantern) {
        const [lx, lz] = onFace(face, u + dw / 2 + 0.45, 0);
        place('street_lamp_02', null, lx, 1.95, lz, faceYaw(face), 0.55);
        const [gx, gz] = onFace(face, u + dw / 2 + 0.45, 0.36);
        place('door_glow', { width: 0.1, height: 0.1, depth: 0.1 }, gx, 1.9, gz);
      }
    }
  };
}

/** A terraced house's front and back: a door and a window below, windows above. */
function dressHouse(house, doorSide, doorPrefab) {
  const u = house.w / 2;
  house.door(1, doorSide * (u - 1.8), doorPrefab);
  house.window(1, -doorSide * (u - 2.4), 0.9, { ww: 1.6, wh: 1.5 });
  house.window(1, -doorSide * (u - 5.0), 0.9, { ww: 1.1, wh: 1.5 });
  for (const v of [-u + 2.1, 0, u - 2.1]) house.window(1, v, 3.7, { wh: 1.3 });
  for (const v of [-u + 2.6, u - 2.6]) house.window(-1, v, 0.9, { wh: 1.4 });
  for (const v of [-u + 2.1, u - 2.1]) house.window(-1, v, 3.7, { wh: 1.2 });
  // The back door.
  house.door(-1, doorSide * -0.4, 'door_wood', { lantern: false, dh: 2.05 });
}

// === The plan ===

/** Half the ground's extent: the roads run to the edge and into the fog. */
const EXTENT = 190;
const ROAD_W = 8;
const KERB_W = 0.3;
const PAVE_W = 2.6;
/** The town: within this distance of the crossing the roads have pavements and lamps. */
const TOWN = 104;
/** The heights surfaces reach above the ground: a kerb stands proud of both road and pavement. */
const TOP = { road: 0.04, pavement: 0.06, kerb: 0.1, pad: 0.04, patch: 0.02, litter: 0.015, path: 0.03 };
/** The edge of a road, a kerb and a pavement, measured from the centreline. */
const EDGE = ROAD_W / 2;
const KERB = EDGE + KERB_W / 2;
const PAVE = EDGE + KERB_W + PAVE_W / 2;
const PAVE_OUT = EDGE + KERB_W + PAVE_W;
/** Where the plots begin, beyond the pavement: the wall, hedge and shopfront line. */
const LINE = PAVE_OUT + 0.6;

/** The quarters, as rectangles nothing is scattered into. */
const DEPOT = { x0: -98, z0: -82, x1: -LINE, z1: -LINE };
const PARK = { x0: LINE, z0: -96, x1: 98, z1: -LINE };
const TERRACE = { x0: -98, z0: LINE, x1: -LINE, z1: 44 };
const SHOPS = { x0: LINE, z0: LINE, x1: 50, z1: 26 };
const CARPARK = { x0: LINE, z0: 28, x1: 64, z1: 62 };
const ALLOTMENTS = { x0: 72, z0: 16, x1: 128, z1: 72 };
const FORT = { x: -104, z: -158 };

/** Where the scatter may not go: rectangles with a margin, and strips (roads, tracks, paths) with a width. */
const blockedRects = [];
const blockedStrips = [];
const keepOut = (rect, margin = 1.5) => blockedRects.push({ x0: rect.x0 - margin, z0: rect.z0 - margin, x1: rect.x1 + margin, z1: rect.z1 + margin });
const blockStrip = (ax, az, bx, bz, w) => blockedStrips.push({ ax, az, bx, bz, w });
const distToStrip = (x, z, s) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
};
const blocked = (x, z) => blockedRects.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)
  || blockedStrips.some((s) => distToStrip(x, z, s) < s.w / 2);
for (const quarter of [DEPOT, PARK, TERRACE, SHOPS, CARPARK, ALLOTMENTS]) keepOut(quarter);

// === The roads ===

/**
 * A road from a to b with kerbs, and pavements where it runs through the
 * town. `breaks` are distances along it where kerb and pavement stop and
 * start again (the crossing, a vehicle entrance, a track leaving the
 * road): `{ from, to, side }`, with `side` -1 or 1 for one side only
 * (looking from a to b, 1 is the right).
 */
function road(ax, az, bx, bz, { pavedFrom = -Infinity, pavedTo = Infinity, breaks = [] } = {}) {
  strip('road', ax, az, bx, bz, ROAD_W, TOP.road);
  blockStrip(ax, az, bx, bz, ROAD_W + 2 * KERB_W + 2 * PAVE_W + 4);
  const len = Math.hypot(bx - ax, bz - az);
  // One side's kerb and pavement, as runs between the breaks on that side.
  const runs = (side, from, to) => {
    const mine = breaks.filter((b) => b.side === undefined || b.side === side);
    const cuts = [from, ...mine.flatMap((b) => [b.from, b.to]).filter((d) => d > from && d < to), to];
    const result = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const open = mine.some((b) => cuts[i] >= b.from && cuts[i + 1] <= b.to);
      if (!open) result.push([cuts[i], cuts[i + 1]]);
    }
    return result;
  };
  for (const side of [-1, 1]) {
    for (const [from, to] of runs(side, 0, len)) {
      const [kx0, kz0] = along(ax, az, bx, bz, from / len, side * KERB);
      const [kx1, kz1] = along(ax, az, bx, bz, to / len, side * KERB);
      strip('kerb', kx0, kz0, kx1, kz1, KERB_W, TOP.kerb);
    }
    for (const [from, to] of runs(side, Math.max(0, pavedFrom), Math.min(len, pavedTo))) {
      const [px0, pz0] = along(ax, az, bx, bz, from / len, side * PAVE);
      const [px1, pz1] = along(ax, az, bx, bz, to / len, side * PAVE);
      strip('paving', px0, pz0, px1, pz1, PAVE_W, TOP.pavement);
    }
  }
}

// The depot's vehicle gate on Main Road, the car park's entrance on
// Station Road, the back lane behind the terrace, and the woodland track.
const DEPOT_GATE = { x0: -61, x1: -54.5 };
const CARPARK_ENTRY = { z0: 32, z1: 40 };
const LANE_Z = 42;
const WOOD_TRACK_Z = -112;

// Main Road, west to east (side 1 is the south).
const MAIN_FROM = -EXTENT - 10;
const alongMain = (x) => x - MAIN_FROM;
road(MAIN_FROM, 0, EXTENT + 10, 0, {
  pavedFrom: alongMain(-TOWN), pavedTo: alongMain(TOWN),
  breaks: [
    { from: alongMain(-PAVE_OUT), to: alongMain(PAVE_OUT) },
    { from: alongMain(DEPOT_GATE.x0), to: alongMain(DEPOT_GATE.x1), side: -1 }
  ]
});
// Station Road, north to south (side 1 is the west).
const STATION_FROM = -EXTENT - 10;
const alongStation = (z) => z - STATION_FROM;
road(0, STATION_FROM, 0, EXTENT + 10, {
  pavedFrom: alongStation(-TOWN), pavedTo: alongStation(TOWN),
  breaks: [
    { from: alongStation(-PAVE_OUT), to: alongStation(PAVE_OUT) },
    { from: alongStation(CARPARK_ENTRY.z0), to: alongStation(CARPARK_ENTRY.z1), side: -1 },
    { from: alongStation(LANE_Z - 2), to: alongStation(LANE_Z + 2), side: 1 },
    { from: alongStation(WOOD_TRACK_Z - 1.6), to: alongStation(WOOD_TRACK_Z + 1.6), side: 1 }
  ]
});
// The crossing itself: asphalt where the two roads' kerbs stopped, and the pavements' corners paved through.
patch('road', -EDGE, -EDGE, EDGE, EDGE, TOP.road);
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  patch('paving', sx * (EDGE + KERB_W), sz * (EDGE + KERB_W), sx * PAVE_OUT, sz * PAVE_OUT, TOP.pavement);
}
// The entrances, flush with the road over the pavement line.
patch('concrete', DEPOT_GATE.x0, -LINE, DEPOT_GATE.x1, -EDGE, TOP.road);
patch('road', EDGE, CARPARK_ENTRY.z0, CARPARK.x0 + 0.5, CARPARK_ENTRY.z1, TOP.road);

// Street lamps through the town, alternating sides, with the kerb between
// them and the road. None at the crossing or in an entrance.
const LAMP_PITCH = 26;
const inEntrance = (x, z) => (Math.abs(x) < PAVE_OUT + 3 && Math.abs(z) < PAVE_OUT + 3)
  || (z < 0 && x > DEPOT_GATE.x0 - 2 && x < DEPOT_GATE.x1 + 2)
  || (x > 0 && z > CARPARK_ENTRY.z0 - 2 && z < CARPARK_ENTRY.z1 + 2)
  || (x < 0 && Math.abs(z - LANE_Z) < 4);
for (let i = 0; i * LAMP_PITCH / 2 < TOWN * 2 - 6; i++) {
  const d = -TOWN + 5 + i * LAMP_PITCH / 2;
  const side = i % 2 ? 1 : -1;
  const at = EDGE + KERB_W + 0.55;
  if (!inEntrance(d, side * at)) lamp(d, side * at, facing(d, side * at, d, 0) + Q);
  if (!inEntrance(side * at, d)) lamp(side * at, d, facing(side * at, d, 0, d) + Q);
}
// Manholes down the lanes, now and then.
for (let x = -TOWN + 17; x < TOWN; x += 37) if (Math.abs(x) > 9) model('water_manhole_cover', x, -1.8, range(0, TURN));
for (let z = -TOWN + 9; z < TOWN; z += 43) if (Math.abs(z) > 9) model('water_manhole_cover', 1.8, z, range(0, TURN));
// Hydrants and utility boxes where the services need them.
model('fire_hydrant', PAVE_OUT - 0.6, -PAVE_OUT + 0.6, Q);
model('fire_hydrant', -40, PAVE_OUT - 0.5, Math.PI);
model('fire_hydrant', -PAVE_OUT + 0.5, -46, -Q);
model('utility_box_01', -PAVE_OUT + 0.6, PAVE_OUT - 0.6, facing(0, 0, 1, -1));
model('utility_box_01', 60, PAVE_OUT - 0.55, Math.PI);
// Out of town: power lines on the verges, jacarandas along Main Road, both ways into the fog.
for (let x = TOWN + 4; x < EXTENT; x += 30) { model('power_pole', x, PAVE_OUT + 1, 0); model('power_pole', -x, PAVE_OUT + 1, 0); }
for (let z = TOWN + 4; z < EXTENT; z += 30) { model('power_pole', -PAVE_OUT - 1, z, Q); model('power_pole', -PAVE_OUT - 1, -z, Q); }
for (let x = TOWN + 10; x < EXTENT - 4; x += 15) {
  model('jacaranda_tree', x, -EDGE - 5.5, range(0, TURN), range(0.42, 0.5));
  model('jacaranda_tree', -x, -EDGE - 5.5, range(0, TURN), range(0.42, 0.5));
}
// Parked along the kerbs: two by the park, one by the terrace, nose to tail.
model('covered_car', 72, -EDGE + 1.1, Q + 0.02); model('covered_car', 78.5, -EDGE + 1.1, Q - 0.01);
model('covered_car', -70, EDGE - 1.1, -Q + 0.02);

// === The corner shops ===

// The forecourt in front of the row, herringbone from the pavement to the
// shopfronts, and the service strip behind them.
const SHOP_FRONT = LINE + 1.6;
patch('herringbone', SHOPS.x0 - 0.6, PAVE_OUT, SHOPS.x1, SHOP_FRONT, TOP.pavement);
patch('concrete', SHOPS.x0, SHOP_FRONT + 11, SHOPS.x1, SHOPS.z1, TOP.patch);
const shop = (x0, x1, walls, roofTiles) => building({ x: (x0 + x1) / 2, z: SHOP_FRONT + 5.5, w: x1 - x0, d: 11, h: 7, yaw: Math.PI, walls, roofTiles });
/** A shopfront: the glass and its frame, a sign above, a door at one end, an awning over it all. */
const shopfront = (b, { lit, sign, door, awning, shutters = false }) => {
  const width = b.w - 3.2;
  const [gx, gz] = b.onFace(1, 0.8, 0.06);
  if (shutters) {
    for (const u of [-width / 2 + 1.6, -width / 2 + 3.9, width / 2 - 2.4].slice(0, width > 8 ? 3 : 2)) model('shop_shutter_window', ...b.onFace(1, u, 0.15), b.faceYaw(1), 1, 0.55);
    model('shop_shutter_door', ...b.onFace(1, b.w / 2 - 1.1, 0.15), b.faceYaw(1));
  } else {
    // A dark frame, the glass on a stall riser, and the door at the east end.
    const [px, pz] = b.onFace(1, 0.8, 0.1);
    place('frame_dark', { width: r(width + 0.2), height: 2.6, depth: 0.1 }, gx, 0.45 + 1.3, gz, b.faceYaw(1));
    place(lit ? 'shop_glass' : 'glass', { width: r(width), height: 2.3, depth: 0.05 }, px, 0.6 + 1.15, pz, b.faceYaw(1));
    place('frame_dark', { width: r(width), height: 0.45, depth: 0.16 }, gx, 0.22, gz, b.faceYaw(1));
    // Mullions: a shopfront is bays of glass, not one sheet.
    const bays = Math.round(width / 2.2);
    for (let k = 1; k < bays; k++) {
      const [mx, mz] = b.onFace(1, 0.8 - width / 2 + (k * width) / bays, 0.13);
      place('frame_dark', { width: 0.1, height: 2.3, depth: 0.08 }, mx, 0.6 + 1.15, mz, b.faceYaw(1));
    }
    // And a transom across them, below the fanlights.
    const [tx, tz] = b.onFace(1, 0.8, 0.13);
    place('frame_dark', { width: r(width), height: 0.1, depth: 0.08 }, tx, 2.3, tz, b.faceYaw(1));
    b.door(1, -b.w / 2 + 1.1, door, { lantern: false, dw: 1.1, dh: 2.3 });
    // The window's light falling on the forecourt.
    const [lx, lz] = b.onFace(1, 0.8, 2.2);
    if (lit) place('window_spill', { width: 0.01, height: 0.01, depth: 0.01 }, lx, 0.7, lz);
  }
  const [sx, sz] = b.onFace(1, 0, 0.1);
  place(sign, { width: r(b.w - 0.6), height: 0.85, depth: 0.12 }, sx, 3.45, sz, b.faceYaw(1));
  if (awning) {
    const [ax, az] = b.onFace(1, 0.8, 0.8);
    place(awning, { width: r(width + 0.4), height: 0.08, depth: 1.6 }, ax, 2.92, az, b.faceYaw(1));
  }
  for (const u of [-b.w / 2 + 2.2, -b.w / 2 + 5, b.w / 2 - 5, b.w / 2 - 2.2]) b.window(1, u, 4.4, { wh: 1.4 });
  for (const u of [-b.w / 2 + 2.4, b.w / 2 - 2.4]) { b.window(-1, u, 4.4, { wh: 1.3 }); b.window(-1, u, 1, { wh: 1.2, lit: false }); }
};
// The grocer on the corner: lit, an awning, and a side window on Station Road.
const grocer = shop(SHOPS.x0, 21.5, 'plaster_yellow', 'roof_grey');
shopfront(grocer, { lit: true, sign: 'sign_green', door: 'door_green', awning: 'awning' });
grocer.window(-1, 1.5, 4.4, { end: true }); grocer.window(-1, -1.5, 4.4, { end: true, lit: true }); grocer.window(-1, 0, 1, { end: true, ww: 2.2, wh: 1.5 });
// Crates out by the door, potted bay trees either side of it.
model('potted_plant_01', 10.0, SHOP_FRONT - 0.7, 0.3); model('potted_plant_01', 19.0, SHOP_FRONT - 0.7, 1.9);
stack('plastic_crate_03', 14, SHOP_FRONT - 0.5, 3);
row('wooden_crate_01', 17.8, SHOP_FRONT - 0.5, 'x', 2, 0.86, 0, 1, 0);
// The shop between, shuttered for the afternoon.
const shut = shop(21.5, 34, 'brick_red', 'roof_clay');
shopfront(shut, { lit: false, sign: 'sign_navy', door: 'door_black', awning: null, shutters: true });
// The café, with tables out on the forecourt and a menu-board's worth of pot plants.
const cafe = shop(34, SHOPS.x1, 'stucco_white', 'roof_grey');
shopfront(cafe, { lit: true, sign: 'sign_maroon', door: 'door_red', awning: 'awning_red' });
model('outdoor_table_chair_set_01', 38.4, PAVE_OUT + 1.3, 0.2); model('outdoor_table_chair_set_01', 43.6, PAVE_OUT + 1.4, -0.3);
for (const [x, yaw] of [[36.6, 1.4], [40.2, -1.9], [45.6, 1.2]]) model('plastic_monobloc_chair_01', x, PAVE_OUT + 1.2, yaw);
model('potted_plant_02', 35, SHOP_FRONT - 0.6, 0.7); model('potted_plant_02', 49.2, SHOP_FRONT - 0.6, 2.2);
model('trash_can', 47.6, PAVE_OUT + 0.6, 0.2);
// The milk truck, delivering: pulled in at the kerb outside the grocer with
// its crates stacked on the pavement by its tail. The crates are the
// yard's; the fox can knock them down.
object('truck', 15.2, 1.3, EDGE - 1.7, { width: 2.8, height: 2.6, depth: 4.9 }, quat(Q));
for (const [x, y, z] of [[10.2, 0.56, 5.0], [11.25, 0.56, 5.05], [10.7, 1.62, 5.0], [10.5, 0.56, 6.1], [9.9, 2.66, 5.05]]) {
  object('crate', x, y, z, { width: 1, height: 1, depth: 1 });
}
// Behind the row: bins and a back door each, and the wall of the car park.
for (const [b, x] of [[grocer, 12], [shut, 27], [cafe, 40]]) {
  model('trash_can', x, SHOP_FRONT + 11.8, Math.PI); model('trash_can', x + 0.75, SHOP_FRONT + 11.8, Math.PI + 0.1);
  model('industrial_wall_lamp', x + 2.4, SHOP_FRONT + 11.02, 0, 1, 2.6);
  // On a back face turned by pi, a face offset is a world offset in x.
  b.door(-1, x + 3.6 - b.at(0, 0)[0], 'door_wood', { lantern: false });
}
model('cardboard_box_01', 29, SHOP_FRONT + 12, 0.3); stack('cardboard_box_01', 30.2, SHOP_FRONT + 12.2, 2);

// === The car park, behind the shops ===

patch('road', CARPARK.x0, CARPARK.z0, CARPARK.x1, CARPARK.z1, TOP.pad);
strip('kerb', CARPARK.x0, CARPARK.z0, CARPARK.x1, CARPARK.z0, KERB_W, TOP.kerb);
strip('kerb', CARPARK.x0, CARPARK.z1, CARPARK.x1, CARPARK.z1, KERB_W, TOP.kerb);
strip('kerb', CARPARK.x1, CARPARK.z0, CARPARK.x1, CARPARK.z1, KERB_W, TOP.kerb);
strip('kerb', CARPARK.x0, CARPARK.z0, CARPARK.x0, CARPARK_ENTRY.z0, KERB_W, TOP.kerb);
strip('kerb', CARPARK.x0, CARPARK_ENTRY.z1, CARPARK.x0, CARPARK.z1, KERB_W, TOP.kerb);
// A walkway from the car park to the shops' back doors.
patch('paving', 24, SHOPS.z1, 27, CARPARK.z0, TOP.pavement);
// Two rows of bays nose to the kerb, a lane between; islands with a tree and a lamp break the rows.
const BAY = 3.0;
for (const [rowZ, nose] of [[CARPARK.z0 + 3.6, Math.PI], [CARPARK.z1 - 3.6, 0]]) {
  for (let i = 0; i < 17; i++) {
    const x = CARPARK.x0 + 6 + i * BAY;
    if (i === 5 || i === 11) {
      slab('concrete', x, rowZ, 2.2, 6, TOP.kerb);
      model('tree_small_02', x, rowZ + (nose ? -1 : 1), range(0, TURN), 1.4);
      lamp(x, rowZ + (nose ? 1.6 : -1.6));
      continue;
    }
    if (chance(0.6)) model('covered_car', x, rowZ, nose + range(-0.04, 0.04));
  }
}
row('concrete_road_barrier', CARPARK.x1 - 1.2, 45, 'z', 4, 1.7, Q);
model('trash_can', CARPARK.x0 + 1.4, CARPARK_ENTRY.z1 + 1.2, Math.PI);
lamp(CARPARK.x1 - 1.5, CARPARK.z0 + 1.5); lamp(CARPARK.x1 - 1.5, CARPARK.z1 - 1.5);
// A low wall along the car park's south side, where the meadow starts.
wall(CARPARK.x0, CARPARK.z1 + 0.6, CARPARK.x1 + 0.6, CARPARK.z1 + 0.6, 0.9);
// Between the café and the allotments, a verge with a bench under two trees, on the pavement's edge.
model('island_tree_03', 56, 12, 0.8, 1.9); model('island_tree_03', 66, 11.5, 2.4, 1.7);
model('painted_wooden_bench', 61, LINE + 0.3, Math.PI); model('trash_can', 62.6, LINE + 0.2, 0.3);
for (let x = 52; x < 70; x += 1.6) if (chance(0.7)) model(pick(['grass_medium_02', 'dandelion_01', 'shrub_03']), x + range(-0.4, 0.4), 18 + range(-3, 3), range(0, TURN));
keepOut({ x0: 50, z0: LINE, x1: ALLOTMENTS.x0, z1: CARPARK.z0 });

// === The terrace ===

// Seven houses facing Main Road over front gardens, their backs over long
// gardens to the lane. Each has its own colour and its own garden.
const HOUSE_W = 11;
const HOUSE_D = 9;
const FRONT_WALL = LINE + 0.25;
const HOUSE_FRONT = LINE + 4;
const HOUSE_BACK = HOUSE_FRONT + HOUSE_D;
const GARDEN_END = LANE_Z - 2;
const HOUSES = [
  { walls: 'stucco_cream', roof: 'roof_clay', door: 'door_blue' },
  { walls: 'brick_red', roof: 'roof_grey', door: 'door_black' },
  { walls: 'stucco_blue', roof: 'roof_grey', door: 'door_yellow' },
  { walls: 'brick_red', roof: 'roof_clay', door: 'door_green' },
  { walls: 'stucco_sage', roof: 'roof_clay', door: 'door_red' },
  { walls: 'stucco_pink', roof: 'roof_grey', door: 'door_blue' },
  { walls: 'brick_red', roof: 'roof_clay', door: 'door_red' }
];
const TERRACE_X0 = TERRACE.x0 + 2;
// The front wall along the pavement, broken for each garden path.
// A house is turned by pi, so a door `doorSide * (w/2 - 1.8)` along its front stands at that much west of its centre.
const doorSideOf = (i) => (i % 2 ? -1 : 1);
const doorX = (i) => TERRACE_X0 + i * HOUSE_W + HOUSE_W / 2 - doorSideOf(i) * (HOUSE_W / 2 - 1.8);
{
  const gaps = HOUSES.map((_, i) => doorX(i));
  let from = TERRACE_X0;
  for (const g of gaps) { wall(from, FRONT_WALL, g - 0.65, FRONT_WALL, 0.75, 'brick_red', 0.3); from = g + 0.65; }
  wall(from, FRONT_WALL, TERRACE_X0 + HOUSES.length * HOUSE_W, FRONT_WALL, 0.75, 'brick_red', 0.3);
}
HOUSES.forEach((spec, i) => {
  const x = TERRACE_X0 + i * HOUSE_W + HOUSE_W / 2;
  const house = building({ x, z: (HOUSE_FRONT + HOUSE_BACK) / 2, w: HOUSE_W, d: HOUSE_D, h: 6.2, yaw: Math.PI, walls: spec.walls, roofTiles: spec.roof, chimney: i % 2 ? 1 : -1 });
  // Doors pair up across each party wall, as a terrace's do.
  const doorSide = doorSideOf(i);
  dressHouse(house, doorSide, spec.door);
  // The garden path from the gate to the door.
  const dx = doorX(i);
  patch('paving', dx - 0.6, FRONT_WALL, dx + 0.6, HOUSE_FRONT, TOP.path);
  // The front garden: something different by each door.
  const front = (HOUSE_FRONT + FRONT_WALL) / 2;
  const other = x + (x - dx) * 0.8;
  if (i === 0) { row('planter_box_01', other, front, 'x', 2, 1.0, Math.PI); model('potted_plant_02', dx + 1.1, HOUSE_FRONT - 0.5, 0.4); }
  if (i === 1) { model('trash_can', dx + 1.2, HOUSE_FRONT - 0.6, 0.2); model('trash_can', dx + 2, HOUSE_FRONT - 0.6, -0.1); model('shrub_01', other, front, range(0, TURN)); }
  if (i === 2) {
    // The gazing globe on its pedestal: the yard's steel ball, mirroring the street.
    place('plinth', { width: 0.5, height: 0.8, depth: 0.5 }, other, 0.4, front);
    object('steel', other, 1.36, front, { width: 1.1, height: 1.1 });
    for (let k = 0; k < 6; k++) model('flower_gazania', other + range(-2, 2), front + range(-1.2, 1.2), range(0, TURN));
  }
  if (i === 3) { model('shrub_large', other - 1.5, front, 0.4); model('shrub_large', other + 0.2, front + 0.3, 2.2); model('potted_plant_01', dx - 1.2, HOUSE_FRONT - 0.5, 1.2); }
  if (i === 4) { model('painted_wooden_bench', other, HOUSE_FRONT - 0.5, 0); model('potted_plant_02', other + 1.4, HOUSE_FRONT - 0.5, 0.2); model('potted_plant_02', other - 1.4, HOUSE_FRONT - 0.5, 2.9); }
  if (i === 5) { for (let k = 0; k < 8; k++) model(pick(['periwinkle_plant', 'flower_gazania', 'shrub_03']), other + range(-2.5, 2.5), front + range(-1, 1), range(0, TURN)); model('garden_gnome', dx + 1, front, 2.8); }
  if (i === 6) { model('trash_can', dx - 1.2, HOUSE_FRONT - 0.6, 0.1); model('planter_box_02', other, HOUSE_FRONT - 0.4, Math.PI); }
  // The back garden: a lawn between fences, a patio by the back door,
  // a tree at the far end, and whatever the house does with it.
  const west = x - HOUSE_W / 2, east = x + HOUSE_W / 2;
  patch('paving', x - 2.8, HOUSE_BACK, x + 2.8, HOUSE_BACK + 2.4, TOP.path);
  model('garden_hose_wall_mounted_01', x + doorSide * 2.6, HOUSE_BACK + 0.01, 0, 1, 1.0);
  model(pick(['searsia_lucida', 'tree_small_02', 'island_tree_03']), x + range(-3, 3), GARDEN_END - 3, range(0, TURN), range(1.1, 1.4));
  const mid = (HOUSE_BACK + GARDEN_END) / 2;
  if (i === 0) {
    // The vegetable plot: planters in rows, compost, a ladder by the shed wall.
    for (let k = 0; k < 3; k++) row('planter_box_01', x, mid - 3 + k * 2.4, 'x', 3, 1.3, 0);
    model('compost_bags', west + 1.4, mid + 5, Q); model('wooden_ladder', east - 0.6, mid + 2, -Q);
    model('Barrel_01', east - 0.8, HOUSE_BACK + 3.6, 0.2);
  }
  if (i === 1) { model('wooden_picnic_table', x, mid, Q + 0.1); model('shrub_02', west + 1.2, mid + 4, 0.3); model('shrub_02', east - 1.2, mid - 3, 1.1); }
  if (i === 2) {
    // Gone to seed.
    for (let k = 0; k < 40; k++) model(pick(['grass_medium_01', 'grass_medium_02', 'nettle_plant', 'weed_plant_02', 'dandelion_01']), x + range(-5, 5), HOUSE_BACK + 3 + range(0, 20), range(0, TURN), range(0.9, 1.3));
    model('old_tyre', x - 2, mid + 2, 0.6); model('dry_branches_medium_01', x + 2.5, mid + 4, 1.2);
  }
  if (i === 3) { patch('herringbone', x - 4.5, HOUSE_BACK + 2.4, x + 4.5, HOUSE_BACK + 6, TOP.path); model('outdoor_table_chair_set_01', x, HOUSE_BACK + 4.2, 0.3); model('potted_plant_01', west + 1, HOUSE_BACK + 3, 0); model('potted_plant_02', east - 1, HOUSE_BACK + 3, 0); }
  if (i === 4) {
    for (let k = 0; k < 5; k++) model('garden_gnome', x + range(-4, 4), mid + range(-4, 4), range(0, TURN));
    for (let k = 0; k < 14; k++) model(pick(['flower_gazania', 'flower_gazania', 'shrub_03', 'periwinkle_plant']), west + 0.9, HOUSE_BACK + 3 + k * 1.4, range(0, TURN));
    model('painted_wooden_bench', east - 0.6, mid, -Q);
  }
  if (i === 5) {
    // Children's: the yard's red ball on the lawn, chairs pulled out.
    object('ball', x - 1.5, 0.36, mid + 1, { width: 0.7, height: 0.7 });
    model('plastic_monobloc_chair_01', x + 1.5, HOUSE_BACK + 3.4, 2.6); model('plastic_monobloc_chair_01', x + 2.6, HOUSE_BACK + 3.8, -2.2);
  }
  if (i === 6) { model('tool_cart', west + 1.2, mid - 2, Q); model('portable_generator', west + 1.1, mid, 0.4); stack('wooden_crate_02', east - 1.2, mid + 3, 2, Q); model('Barrel_01', east - 1, mid - 3, 0.6); }
  // Lawn tufts along the fences, where a mower does not reach.
  for (let z = HOUSE_BACK + 3; z < GARDEN_END - 1; z += 2.2) if (chance(0.5)) model('grass_medium_02', east - 0.4, z + range(-0.5, 0.5), range(0, TURN), 0.8);
});
// Fences between the gardens and along the lane, a gate in each back fence.
const TERRACE_X1 = TERRACE_X0 + HOUSES.length * HOUSE_W;
for (let i = 0; i <= HOUSES.length; i++) boards(TERRACE_X0 + i * HOUSE_W, HOUSE_BACK, TERRACE_X0 + i * HOUSE_W, GARDEN_END);
boards(TERRACE_X0, GARDEN_END, TERRACE_X1, GARDEN_END, 1.7, HOUSES.map((_, i) => [i * HOUSE_W + 2, i * HOUSE_W + 3.1]));
// The corner beyond the last house: a scrap of green with a tree, a bench and a lamp, and a path to the lane.
model('island_tree_01', (TERRACE_X1 + TERRACE.x1) / 2, 24, 1.3, 1.8);
model('painted_wooden_bench', (TERRACE_X1 + TERRACE.x1) / 2, FRONT_WALL + 1.6, Math.PI);
patch('paving', TERRACE_X1 + 0.8, LINE, TERRACE_X1 + 2.4, LANE_Z, TOP.path);
// The back lane, to Station Road.
strip('dirt', TERRACE.x0, LANE_Z, -EDGE, LANE_Z, 3.6, TOP.path);
blockStrip(TERRACE.x0 - 20, LANE_Z, -EDGE, LANE_Z, 7);
model('utility_box_01', TERRACE_X1 + 3.4, LANE_Z - 2.6, 0.1);
lamp(-30, LANE_Z - 2.3); lamp(-70, LANE_Z - 2.3);

// === The works depot ===

// Gravel over the compound, a concrete apron before the warehouse and a
// concrete lane from the gate to it.
patch('gravel', DEPOT.x0, DEPOT.z0, DEPOT.x1, DEPOT.z1, TOP.patch);
const WAREHOUSE = { x0: -94, z0: -80, x1: -44, z1: -54 };
const APRON = { z0: WAREHOUSE.z1, z1: -40 };
patch('concrete', WAREHOUSE.x0, APRON.z0, WAREHOUSE.x1 + 18, APRON.z1, 0.03);
patch('concrete', DEPOT_GATE.x0 - 0.5, APRON.z1, DEPOT_GATE.x1 + 0.5, DEPOT.z1, 0.03);
// Brick along the roads, chain-link at the back; the gate stands open.
wall(DEPOT.x0, DEPOT.z1, DEPOT_GATE.x0, DEPOT.z1);
wall(DEPOT_GATE.x1, DEPOT.z1, -23.2, DEPOT.z1);
wall(-20.8, DEPOT.z1, DEPOT.x1, DEPOT.z1);
wall(DEPOT.x1, DEPOT.z0, DEPOT.x1, DEPOT.z1);
fence(DEPOT.x0, DEPOT.z0, DEPOT.x0, DEPOT.z1);
fence(DEPOT.x0, DEPOT.z0, DEPOT.x1, DEPOT.z0, { gate: 76 });
// Brick piers either side of the vehicle gate, a lamp on each.
for (const px of [DEPOT_GATE.x0 - 0.35, DEPOT_GATE.x1 + 0.35]) { box('wall', px, 0, DEPOT.z1, 0.7, 2.8, 0.7); box('coping', px, 2.8, DEPOT.z1, 0.82, 0.1, 0.82); }
const gateLeaf = (hingeX, hingeZ, yaw) => model('large_iron_gate', hingeX + Math.cos(yaw) * 1.475, hingeZ - Math.sin(yaw) * 1.475, yaw);
gateLeaf(DEPOT_GATE.x0, DEPOT.z1 - 0.2, Q * 0.82);
gateLeaf(DEPOT_GATE.x1, DEPOT.z1 - 0.2, Math.PI - Q * 0.82);

// The warehouse: brick under a flat roof, three roller doors onto the
// apron with a lamp over each, a loading dock at the middle one, and a
// high strip of windows.
const wh = building({ x: (WAREHOUSE.x0 + WAREHOUSE.x1) / 2, z: (WAREHOUSE.z0 + WAREHOUSE.z1) / 2, w: WAREHOUSE.x1 - WAREHOUSE.x0, d: WAREHOUSE.z1 - WAREHOUSE.z0, h: 9, walls: 'brick_factory', roof: 'flat' });
const BAYS = [-16, 0, 16];
for (const u of BAYS) {
  const [sx, sz] = wh.onFace(1, u, 0.06);
  place('shutter', { width: 4.6, height: 5.2, depth: 0.1 }, sx, 2.6, sz);
  const [hx, hz] = wh.onFace(1, u, 0.15);
  place('coping', { width: 5.2, height: 0.3, depth: 0.3 }, hx, 5.35, hz);
  const [lx, lz] = wh.onFace(1, u, 0);
  model('industrial_wall_lamp', lx, lz, 0, 1.4, 6.2);
  place('bay_glow', { width: 0.14, height: 0.14, depth: 0.14 }, lx, 6.05, lz + 0.22);
}
for (let u = -22; u <= 22; u += 4) if (!BAYS.some((b) => Math.abs(u - b) < 3)) wh.window(1, u, 6.6, { ww: 2.2, wh: 1.1, lit: false });
for (let u = -10; u <= 10; u += 4) wh.window(1, u, 6.6, { end: true, ww: 2.2, wh: 1.1, lit: false });
wh.door(1, -22.4, 'door_black', { lantern: false });
for (const u of [-24.6, 24.6]) model('security_light', ...wh.onFace(1, u, 0), 0, 1, 8.2);
// The dock: a concrete platform before the middle door, steps at its side, the yard's crates and a hand truck on it.
box('concrete', wh.at(0, 0)[0], 0, WAREHOUSE.z1 + 2.6, 8, 1.1, 5.2);
for (let k = 0; k < 3; k++) box('concrete', wh.at(0, 0)[0] + 4 + 0.5 + k * 0.6, 0, WAREHOUSE.z1 + 3.8, 0.6, 1.1 - (k + 1) * 0.3, 2.4);
model('hand_truck', wh.at(0, 0)[0] - 2.5, WAREHOUSE.z1 + 1.6, 0.4, 1, 1.1);
for (const [dx, y, dz] of [[1.2, 1.6, 1.2], [2.3, 1.6, 1.3], [1.7, 2.6, 1.25], [1.6, 1.6, 2.4]]) object('crate', wh.at(0, 0)[0] + dx, y, WAREHOUSE.z1 + dz, { width: 1, height: 1, depth: 1 });
// The yard's barrels before the west door, three standing and one on top.
for (const [x, y, z] of [[-78.8, 0.6, -50.6], [-77.9, 0.6, -50.8], [-78.35, 0.6, -49.9], [-78.4, 1.8, -50.4]]) object('barrel', x, y, z, { width: 0.8, height: 1.2 });
model('industrial_storage_cart', -86, -51, 0.1); model('industrial_storage_cart', -84.4, -51.2, -0.05);
// The east door's forklift lane: pallets of plastic crates waiting to go in.
for (let k = 0; k < 3; k++) {
  const x = -62 + k * 1.6;
  row('plastic_crate_03', x, -50.2, 'z', 3, 0.3, Q);
  row('plastic_crate_03', x, -50.2, 'z', 3, 0.3, Q, 1, 0.27);
}

// The workshop: corrugated iron on three sides, open to the apron, tools inside under a lamp.
const SHED = { x0: -40, z0: -80, x1: -26, z1: -66 };
for (const [ax, az, bx, bz] of [[SHED.x0, SHED.z0, SHED.x0, SHED.z1], [SHED.x1, SHED.z0, SHED.x1, SHED.z1], [SHED.x0, SHED.z0, SHED.x1, SHED.z0]]) wall(ax, az, bx, bz, 4.4, 'corrugated', 0.18);
box('corrugated', (SHED.x0 + SHED.x1) / 2, 4.4, (SHED.z0 + SHED.z1) / 2, SHED.x1 - SHED.x0 + 0.8, 0.14, SHED.z1 - SHED.z0 + 1);
patch('concrete', SHED.x0, SHED.z0, SHED.x1, SHED.z1 + 1, 0.04);
model('tool_cart', -37.5, -78.6, 0); model('portable_generator', -35.6, -78.8, 0.1);
model('wooden_ladder', SHED.x1 - 0.5, -75, -Q); model('wooden_ladder', SHED.x1 - 0.5, -73.8, -Q - 0.1);
stack('wooden_crate_02', -31, -78.6, 2, Q); model('hand_truck', -28.6, -78.6, 0.2);
model('old_tyre', -38.8, -70.5, 0.4); model('old_tyre', -38.6, -71.2, 0.2);
model('industrial_wall_lamp', -33, SHED.z0 + 0.1, 0, 1, 3.4);
place('bay_glow', { width: 0.14, height: 0.14, depth: 0.14 }, -33, 3.25, SHED.z0 + 0.32);
// The propane cage beside it.
fence(-22, -80, -16, -80); fence(-22, -80, -22, -74); fence(-22, -74, -16, -74, { gate: 3 }); fence(-16, -80, -16, -74);
block('propane_tank', -19, -77, 4, 4, 0.5, 0.6);

// The office by the pedestrian gate: boarded, two floors, flat roof, facing Main Road.
const office = building({ x: -22, z: -18, w: 18, d: 10, h: 6.6, walls: 'cladding', roof: 'flat' });
office.door(1, 0, 'door_blue', { dw: 1.4 });
for (const u of [-6.5, -3.5, 3.5, 6.5]) office.window(1, u, 1.0, { ww: 1.8, wh: 1.4, lit: chance(0.5) });
for (const u of [-6.5, -3.5, 0, 3.5, 6.5]) office.window(1, u, 4.0, { ww: 1.8, wh: 1.4, lit: chance(0.5) });
for (const u of [-2.5, 2.5]) { office.window(1, u, 1.0, { end: true, ww: 1.8 }); office.window(1, u, 4.0, { end: true, ww: 1.8 }); }
patch('paving', -23, -13, -21, DEPOT.z1, TOP.path);
patch('concrete', -31, -13, -13, -11, TOP.path);
model('trash_can', -24.2, -12.4, 0.1); model('potted_plant_02', -20.2, -12.4, 0.5);
model('street_bench', -27.5, -12.2, Math.PI);
model('utility_box_01', -13.6, -14, -Q);
// Containers between the gate lane and the office: two side by side with a
// third across them, and one set down on its own, doors to the lane.
const CONTAINER = { w: 12.2, h: 2.6, d: 2.44 };
box('container_blue', -44, 0, -34.3, CONTAINER.w, CONTAINER.h, CONTAINER.d);
box('container_red', -44, 0, -31.7, CONTAINER.w, CONTAINER.h, CONTAINER.d);
box('container_green', -43.6, CONTAINER.h, -33, CONTAINER.w, CONTAINER.h, CONTAINER.d, 0.04);
box('container_red', -41, 0, -22.5, CONTAINER.w, CONTAINER.h, CONTAINER.d, -0.12);
// The door end of each, to the west: a dark steel frame.
for (const [x, z, yaw] of [[-44, -34.3, 0], [-44, -31.7, 0], [-41, -22.5, -0.12]]) {
  const half = CONTAINER.w / 2 + 0.03;
  place('frame_dark', { width: 0.06, height: 2.5, depth: 2.36 }, x - half * Math.cos(yaw), 1.25, z + half * Math.sin(yaw), yaw);
}
lamp(-36, -28);
// The fleet under covers, nose to the road wall east of the gate.
row('covered_car', -44, DEPOT.z1 - 2.9, 'x', 4, 3.1, 0);
// Stock in bays along the west fence, a row of barriers between each.
const BAY_X = [-96, -80];
const bayLines = [-50, -42, -34, -26, -18, -10];
for (const z of bayLines) row('concrete_road_barrier', (BAY_X[0] + BAY_X[1]) / 2 + 1, z, 'x', 9, 1.62, 0);
row('modular_industrial_pipes_01', -88, -47.4, 'x', 10, 1.45);
row('modular_industrial_pipes_01', -88, -44.8, 'x', 10, 1.45);
block('Barrel_01', -90, -38, 7, 4, 0.7); block('barrel_03', -83, -38, 4, 4, 0.78);
for (let k = 0; k < 4; k++) stack('wooden_crate_01', -93 + k * 4, -30, 4 - (k % 2));
stack('cardboard_box_01', -84, -30, 3, Q);
for (let k = 0; k < 4; k++) {
  const x = -93 + k * 3;
  row('plastic_crate_03', x, -22, 'x', 5, 0.52); row('plastic_crate_03', x, -22, 'x', 5, 0.52, 0, 1, 0.27);
  if (k % 2) row('plastic_crate_03', x, -22, 'x', 4, 0.52, 0, 1, 0.54);
}
row('old_tyre', -90, -14.6, 'x', 12, 0.64); row('old_tyre', -90, -13.9, 'x', 9, 0.66, 0.1); block('barrel_03', -82.5, -14, 3, 3, 0.78);
// Lamps down the lane and at the apron's corners, a security light on the office.
lamp(DEPOT_GATE.x0 - 1.6, -20); lamp(DEPOT_GATE.x0 - 1.6, -34); lamp(-40, -42); lamp(-94.5, -42);
model('security_light', ...office.onEnd(-1, 2, 0), office.endYaw(-1), 1, 5.8);
// Weeds find the fence lines.
for (let x = DEPOT.x0 + 2; x < DEPOT.x1 - 2; x += 3.6) if (chance(0.5) && !(x > SHED.x0 && x < -16)) model(pick(['weed_plant_02', 'grass_medium_02', 'nettle_plant']), x, DEPOT.z0 + 0.7, range(0, TURN));
for (let z = DEPOT.z0 + 3; z < DEPOT.z1 - 2; z += 3.4) if (chance(0.5)) model(pick(['weed_plant_02', 'grass_medium_02']), DEPOT.x0 + 0.8, z, range(0, TURN));

// === The park ===

const PLAZA = { x: 52, z: -50, radius: 9 };
const GATE_SW = [LINE + 1.5, -LINE - 1.5];
const GATE_S = [PLAZA.x, -LINE];
const GATE_W = [LINE, PLAZA.z];
const GATE_N = [PLAZA.x, PARK.z0];
const PICNIC = [84, -50];
const PATH_W = 2.8;
/** A paved path from a to b, kept clear of the scatter. */
const path = (a, b, prefab = 'paving') => { strip(prefab, ...a, ...b, PATH_W, TOP.path); blockStrip(...a, ...b, PATH_W + 3); };
path(GATE_SW, [PLAZA.x, PLAZA.z]);
path(GATE_S, [PLAZA.x, PLAZA.z]);
path(GATE_W, [PLAZA.x, PLAZA.z]);
path(GATE_N, [PLAZA.x, PLAZA.z]);
path([PLAZA.x, PLAZA.z], PICNIC, 'dirt');
place('plaza', { width: PLAZA.radius * 2, height: 0.05, depth: PLAZA.radius * 2 }, PLAZA.x, 0.025, PLAZA.z);
// The plaza: the statue on its plinth, benches facing it on the diagonals,
// planters behind them, the coffee cart and its chairs, lamps, bins.
place('plinth', { width: 1.8, height: 0.9, depth: 1.8 }, PLAZA.x, 0.45, PLAZA.z);
model('concrete_cat_statue', PLAZA.x, PLAZA.z, Math.PI * 0.75, 3.6, 0.9);
for (const a of [Q / 2 + Q, Q / 2 + 2 * Q, Q / 2 + 3 * Q]) {
  const [bx, bz] = [PLAZA.x + Math.cos(a) * 6.2, PLAZA.z + Math.sin(a) * 6.2];
  model('street_bench', bx, bz, facing(bx, bz, PLAZA.x, PLAZA.z));
  const [px, pz] = [PLAZA.x + Math.cos(a) * 8.2, PLAZA.z + Math.sin(a) * 8.2];
  model('planter_box_02', px, pz, facing(px, pz, PLAZA.x, PLAZA.z));
}
{
  // The coffee cart in the north-east quarter, facing in, with its custom round it.
  const a = Q / 2, [cx, cz] = [PLAZA.x + Math.cos(a) * 6.4, PLAZA.z - Math.sin(a) * 6.4];
  model('CoffeeCart_01', cx, cz, facing(cx, cz, PLAZA.x, PLAZA.z) + Q);
  model('outdoor_table_chair_set_01', PLAZA.x + 2.6, PLAZA.z - 4.2, 0.4);
  model('plastic_monobloc_chair_01', cx - 2.6, cz + 0.8, 2.2); model('plastic_monobloc_chair_01', cx + 0.4, cz + 2.4, -2.8);
  model('trash_can', cx + 1.8, cz + 0.6, 0.4);
}
lamp(PLAZA.x + 6.6, PLAZA.z + 6.6); lamp(PLAZA.x - 6.6, PLAZA.z - 6.6);
model('trash_can', PLAZA.x - 7.6, PLAZA.z + 2.6, 3.4);
// Gazanias in beds round the plaza, broken for the paths.
for (let i = 0; i < 110; i++) {
  const a = rand() * TURN, d = PLAZA.radius + range(0.6, 2.6);
  const x = PLAZA.x + Math.cos(a) * d, z = PLAZA.z + Math.sin(a) * d;
  if (blocked(x, z)) continue;
  model('flower_gazania', x, z, range(0, TURN), range(0.8, 1.2));
}
// The jacaranda avenue: Main Road's gate to the plaza between two lines of them.
for (let z = -LINE - 6; z > PLAZA.z + PLAZA.radius + 3; z -= 8) {
  for (const side of [-1, 1]) model('jacaranda_tree', PLAZA.x + side * 5.2, z, range(0, TURN), range(0.44, 0.5));
}
// Trees along the diagonal from the corner gate, alternating sides; benches and lamps on the west path.
for (let t = 0.14; t < 0.8; t += 0.16) {
  const side = Math.round(t / 0.16) % 2 ? 1 : -1;
  const [x, z] = along(...GATE_SW, PLAZA.x, PLAZA.z, t, side * 4.5);
  model(pick(['island_tree_01', 'island_tree_02', 'island_tree_03']), x, z, range(0, TURN), range(1.6, 2.0));
}
for (const t of [0.25, 0.6]) {
  const [x, z] = along(...GATE_W, PLAZA.x, PLAZA.z, t, -2.4);
  model('painted_wooden_bench', x, z, facing(x, z, x, PLAZA.z));
  model('trash_can', x + 1.5, z, 0.2);
}
[[GATE_SW, 0.35, 3.2], [GATE_SW, 0.7, -3.2], [GATE_W, 0.42, 2.6], [GATE_N, 0.4, 3], [GATE_S, 0.55, -2.6]].forEach(([from, t, side]) => {
  lamp(...along(...from, PLAZA.x, PLAZA.z, t, side));
});
// The hedge along both roads, with gaps at the gates; brick piers at each gap.
const hedge = (ax, az, bx, bz, gaps) => {
  const len = Math.hypot(bx - ax, bz - az);
  for (let d = 0.7; d < len; d += 1.3) {
    const [x, z] = along(ax, az, bx, bz, d / len);
    if (gaps.some((g) => Math.hypot(x - g[0], z - g[1]) < 2.4)) continue;
    model('shrub_large', x, z, range(0, TURN), range(0.9, 1.1));
  }
};
hedge(PARK.x0 + 0.9, PARK.z1 - 0.9, PARK.x1, PARK.z1 - 0.9, [GATE_S, [PARK.x0 + 1.4, PARK.z1 - 1.4]]);
hedge(PARK.x0 + 0.9, PARK.z1 - 0.9, PARK.x0 + 0.9, PARK.z0, [GATE_W, [PARK.x0 + 1.4, PARK.z1 - 1.4]]);
for (const [gx, gz, run] of [[GATE_S[0], PARK.z1 - 0.9, 'x'], [PARK.x0 + 0.9, GATE_W[1], 'z']]) {
  for (const s of [-1, 1]) {
    const [px, pz] = run === 'x' ? [gx + s * 2.2, gz] : [gx, gz + s * 2.2];
    box('wall', px, 0, pz, 0.6, 1.4, 0.6); box('coping', px, 1.4, pz, 0.72, 0.08, 0.72);
  }
}
// The north edge: young firs in front of the woods, the gate out to the allotments' path and the wood.
for (let x = PARK.x0 + 4; x < PARK.x1 - 2; x += 6.2) if (Math.abs(x - GATE_N[0]) > 4) model('fir_sapling', x + range(-0.8, 0.8), PARK.z0 + 1.6, range(0, TURN), range(0.8, 1.05));
// The picnic ground under big trees: tables, the fire pit with stumps round it.
model('island_tree_01', 82, -60, 0.4, 2.1); model('island_tree_02', 90, -42, 2.2, 1.9); model('island_tree_01', 92, -58, 1.1, 1.8);
model('wooden_picnic_table', 80, -44, 0.2); model('wooden_picnic_table', 88, -48, 1.7); model('wooden_picnic_table', 84, -38, -0.3);
model('stone_fire_pit', 86, -62, 0);
for (let i = 0; i < 4; i++) model('tree_stump_01', 86 + Math.cos(Q / 2 + i * Q) * 2.1, -62 + Math.sin(Q / 2 + i * Q) * 2.1, range(0, TURN), 0.9);
model('trash_can', 78, -48, 2.6);
// The rock garden in the park's north-west corner, in the shade.
const ROCKS = [24, -80];
model('rock_moss_set_01', ...ROCKS, 0.4, 1.0);
model('boulder_01', ROCKS[0] - 5, ROCKS[1] + 3, 1.2, 1.2); model('namaqualand_boulder_02', ROCKS[0] + 5, ROCKS[1] - 3, 0.3, 1.1);
model('boulder_01', ROCKS[0] + 4, ROCKS[1] + 5, 2.5, 0.9);
model('dead_tree_trunk_02', ROCKS[0] - 2, ROCKS[1] - 7, 0.9, 0.9);
for (let i = 0; i < 14; i++) model('fern_02', ROCKS[0] + range(-7, 7), ROCKS[1] + range(-7, 7), range(0, TURN), range(0.8, 1.2));
for (let i = 0; i < 10; i++) model('moss_01', ROCKS[0] + range(-6, 6), ROCKS[1] + range(-6, 6), range(0, TURN), range(2, 3));
for (let i = 0; i < 6; i++) model('periwinkle_plant', ROCKS[0] + range(-8, 8), ROCKS[1] + range(-8, 8), range(0, TURN));
model('tree_small_02', ROCKS[0] - 7, ROCKS[1] - 4, 0.7, 1.5); model('tree_small_02', ROCKS[0] + 8, ROCKS[1] + 6, 2.9, 1.4); model('searsia_lucida', ROCKS[0] + 1, ROCKS[1] + 9, 1.4, 1.3);
model('garden_gnome', ROCKS[0] + 2.2, ROCKS[1] + 1.1, 2.4);
// Specimen trees on the lawn, where no path runs.
for (const [x, z, id, s] of [[28, -28, 'island_tree_02', 2.1], [34, -60, 'island_tree_03', 2.2], [76, -20, 'island_tree_01', 1.9], [94, -90, 'island_tree_02', 2.0]]) {
  if (!blocked(x, z)) model(id, x, z, range(0, TURN), s);
}

// === The sculpture terrace ===

// A herringbone terrace in the park's north-east, reached by a path from
// the plaza: twenty spheres on plinths in two rows, each one material,
// with a glass screen along the north edge, benches to sit and look, and
// lamps so the lacquers and glass have something to reflect at dusk.
const SCULPTURES = { x0: 60, z0: -92, x1: 92, z1: -70 };
patch('herringbone', SCULPTURES.x0, SCULPTURES.z0, SCULPTURES.x1, SCULPTURES.z1, TOP.pavement);
path([PLAZA.x + PLAZA.radius - 1, PLAZA.z - 3], [SCULPTURES.x0 + 4, SCULPTURES.z1 - 4]);
blockedRects.push({ x0: SCULPTURES.x0 - 1, z0: SCULPTURES.z0 - 1, x1: SCULPTURES.x1 + 1, z1: SCULPTURES.z1 + 1 });
{
  const names = Object.keys(GALLERY);
  const PITCH = (SCULPTURES.x1 - SCULPTURES.x0 - 6) / (names.length / 2 - 1);
  names.forEach((name, i) => {
    const row = i < names.length / 2 ? 0 : 1;
    const x = SCULPTURES.x0 + 3 + (i % (names.length / 2)) * PITCH;
    const z = row === 0 ? SCULPTURES.z0 + 6 : SCULPTURES.z1 - 6;
    place('plinth', { width: 0.9, height: 1.1, depth: 0.9 }, x, 0.55 + TOP.pavement, z);
    place(`sculpture_${name}`, { width: 1.3, height: 1.3, depth: 1.3 }, x, 1.1 + TOP.pavement + 0.65, z);
    // The lights carry light: a lamp in each glowing sphere's colour.
    if (GALLERY[name].emissiveColor) {
      objects.push({ id: `sculpture-light-${name}`, prefab: 'window_spill', x: r(x), y: 2.6, z: r(z), width: 0.01, height: 0.01, depth: 0.01,
        overrides: { light: { type: 'point', color: GALLERY[name].emissiveColor, intensity: 24, range: 9 } } });
    }
  });
  // The glass screen: three panes in a steel frame along the north edge, the woods seen through them.
  for (let k = 0; k < 3; k++) {
    const x = SCULPTURES.x0 + 8 + k * 8;
    box('frame_steel', x, TOP.pavement, SCULPTURES.z0 + 1.2, 6.2, 0.12, 0.16);
    box('frame_steel', x, 2.9 + TOP.pavement, SCULPTURES.z0 + 1.2, 6.2, 0.12, 0.16);
    for (const sx of [-1, 1]) box('frame_steel', x + sx * 3.05, TOP.pavement, SCULPTURES.z0 + 1.2, 0.12, 3.0, 0.16);
    box('glass_pane', x, 0.12 + TOP.pavement, SCULPTURES.z0 + 1.2, 6.0, 2.78, 0.04);
  }
  const mid = (SCULPTURES.z0 + SCULPTURES.z1) / 2;
  for (const x of [SCULPTURES.x0 + 8, SCULPTURES.x0 + 16, SCULPTURES.x0 + 24]) {
    model('street_bench', x, mid - 1.6, Math.PI); model('street_bench', x, mid + 1.6, 0);
  }
  model('trash_can', SCULPTURES.x0 + 2, SCULPTURES.z1 - 2, 0.3);
  lamp(SCULPTURES.x0 + 1.5, SCULPTURES.z0 + 1.5); lamp(SCULPTURES.x1 - 1.5, SCULPTURES.z0 + 1.5); lamp(SCULPTURES.x0 + 1.5, SCULPTURES.z1 - 1.5); lamp(SCULPTURES.x1 - 1.5, SCULPTURES.z1 - 1.5);
  for (const x of [SCULPTURES.x0 - 1.5, SCULPTURES.x1 + 1.5]) { model('planter_box_02', x, mid - 4, Q); model('planter_box_02', x, mid + 4, Q); }
}
// The lawn is mown: dandelions in it, longer grass only round the trees and the hedge's foot.
for (let i = 0; i < 420; i++) {
  const x = range(PARK.x0 + 3, PARK.x1 - 2), z = range(PARK.z0 + 4, PARK.z1 - 3);
  if (blocked(x, z) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 3 || Math.hypot(x - ROCKS[0], z - ROCKS[1]) < 10 || Math.hypot(x - PICNIC[0], z - PICNIC[1]) < 12) continue;
  if (noise(x / 14, z / 14, 7) > 0.58) model('dandelion_01', x, z, range(0, TURN), range(0.7, 1.0));
}
for (let x = PARK.x0 + 3; x < PARK.x1; x += 2.3) if (chance(0.6)) model('grass_medium_02', x, PARK.z1 - 2.2, range(0, TURN), 0.9);
// Street furniture on the pavements at the gates.
model('painted_wooden_bench', GATE_S[0] + 4.5, -PAVE - 0.4, 0); model('trash_can', GATE_S[0] + 6.2, -PAVE - 0.4, 0.2);
model('trash_can', PAVE + 0.4, GATE_W[1] - 3, 0.1);

// === The allotments ===

const TRACK_X = 100;
// The path to their gate from Main Road, through the verge.
patch('paving', TRACK_X - 1.3, PAVE_OUT, TRACK_X + 1.3, ALLOTMENTS.z0, TOP.path);
blockStrip(TRACK_X, PAVE_OUT, TRACK_X, ALLOTMENTS.z0, 5);
fence(ALLOTMENTS.x0, ALLOTMENTS.z0, ALLOTMENTS.x1, ALLOTMENTS.z0, { gaps: [[TRACK_X - 1.6 - ALLOTMENTS.x0, TRACK_X + 1.6 - ALLOTMENTS.x0]] });
gateLeaf(TRACK_X - 1.6, ALLOTMENTS.z0, -Q * 0.85);
fence(ALLOTMENTS.x0, ALLOTMENTS.z1, ALLOTMENTS.x1, ALLOTMENTS.z1);
fence(ALLOTMENTS.x0, ALLOTMENTS.z0, ALLOTMENTS.x0, ALLOTMENTS.z1);
fence(ALLOTMENTS.x1, ALLOTMENTS.z0, ALLOTMENTS.x1, ALLOTMENTS.z1);
// A gravel track up the middle, cross tracks between the plots.
strip('gravel', TRACK_X, ALLOTMENTS.z0, TRACK_X, ALLOTMENTS.z1 - 1, 3, TOP.path);
const CROSS = [30, 44, 58];
for (const z of CROSS) {
  strip('gravel', ALLOTMENTS.x0 + 1, z, TRACK_X - 1.5, z, 2.5, TOP.path);
  strip('gravel', TRACK_X + 1.5, z, ALLOTMENTS.x1 - 1, z, 2.5, TOP.path);
}
// The plots: fruit trees in rows, a water butt at a corner, planters and crates by the track.
const plotRows = [[ALLOTMENTS.z0 + 1.5, CROSS[0] - 1.3], [CROSS[0] + 1.3, CROSS[1] - 1.3], [CROSS[1] + 1.3, CROSS[2] - 1.3], [CROSS[2] + 1.3, ALLOTMENTS.z1 - 1.5]];
let plot = 0;
for (const [zNear, zFar] of plotRows) {
  for (const [xIn, xOut] of [[TRACK_X - 2, ALLOTMENTS.x0 + 1.5], [TRACK_X + 2, ALLOTMENTS.x1 - 1.5]]) {
    const kind = plot++ % 4;
    const x0 = Math.min(xIn, xOut), x1 = Math.max(xIn, xOut);
    const z0 = Math.min(zNear, zFar), z1 = Math.max(zNear, zFar);
    const edge = xIn + (xIn < xOut ? 0.9 : -0.9);
    if (kind === 3) {
      // A vegetable plot rather than an orchard: planter rows and compost.
      for (let z = z0 + 2; z < z1 - 1; z += 2.2) row('planter_box_01', (x0 + x1) / 2, z, 'x', Math.floor((x1 - x0 - 4) / 1.3), 1.3, 0);
      model('compost_bags', xOut + (xIn < xOut ? -1.2 : 1.2), (z0 + z1) / 2, Q);
    } else {
      const id = kind === 0 ? 'searsia_lucida' : kind === 1 ? 'tree_small_02' : 'island_tree_03';
      const pitch = kind === 1 ? 5.5 : 4.6;
      const rowPitch = kind === 0 ? 4.6 : 5.5;
      for (let z = z0 + rowPitch / 2 + 0.6; z < z1 - 1; z += rowPitch) {
        for (let x = x0 + pitch / 2 + 1; x < x1 - 1; x += pitch) {
          model(id, x + range(-0.3, 0.3), z + range(-0.3, 0.3), range(0, TURN), kind === 0 ? range(1.0, 1.25) : range(1.0, 1.3));
        }
      }
    }
    model('Barrel_01', edge, zNear + (zNear < zFar ? 1.2 : -1.2), range(0, TURN));
    if (plot % 2) stack('wooden_crate_01', edge + (xIn < xOut ? 1.2 : -1.2), zFar + (zNear < zFar ? -2 : 2), 2, Q);
    else model('plastic_monobloc_chair_01', edge + (xIn < xOut ? 1.1 : -1.1), zFar + (zNear < zFar ? -2.2 : 2.2), range(0, TURN));
    if (plot === 3 || plot === 6) model('garden_gnome', edge + (xIn < xOut ? 1.8 : -1.8), (z0 + z1) / 2 + 2, range(0, TURN));
  }
}
// The shed in the far corner: corrugated under a grey gable, a lamp by its door.
const allotShed = building({ x: ALLOTMENTS.x1 - 6, z: ALLOTMENTS.z1 - 5, w: 6, d: 4, h: 2.4, yaw: Math.PI, walls: 'corrugated', roofTiles: 'roof_grey' });
allotShed.door(1, 1.2, 'door_wood', { lantern: false, dh: 2.0 });
allotShed.window(1, -1.4, 1.0, { ww: 0.9, wh: 0.8, lit: false });
model('wooden_picnic_table', TRACK_X + 4.5, ALLOTMENTS.z0 + 4, 0.1);
model('trash_can', TRACK_X - 2.6, ALLOTMENTS.z0 + 2.2, 0.2);
// A pine windbreak along the south fence, outside it.
for (let x = ALLOTMENTS.x0 + 4; x < ALLOTMENTS.x1 - 2; x += 8) {
  model(chance(0.6) ? 'pine_tree' : 'pine_tree_b', x + range(-1, 1), ALLOTMENTS.z1 + 5 + range(-1.5, 1.5), range(0, TURN), range(0.75, 1.0));
}
blockedRects.push({ x0: ALLOTMENTS.x0, z0: ALLOTMENTS.z1, x1: ALLOTMENTS.x1, z1: ALLOTMENTS.z1 + 9 });

// === The fort and its track ===

// A ruined corner: the round tower, a thick wall running east to a corner,
// a wall and the gate wall running south from it, and a wall south from the tower.
model('fort_tower', FORT.x, FORT.z, 0.3);
model('fort_wall', FORT.x + 7.9 + 7.28, FORT.z, Q);
model('fort_corner', FORT.x + 7.9 + 14.56 + 2.92, FORT.z, 0);
model('fort_wall', FORT.x + 7.9 + 14.56 + 2.92, FORT.z + 2.92 + 7.28, 0);
model('fort_gate', FORT.x + 7.9 + 14.56 + 2.92, FORT.z + 2.92 + 14.56 + 3.7, 0);
model('fort_wall', FORT.x, FORT.z + 7.9 + 7.28, 0);
blockedRects.push({ x0: FORT.x - 10, z0: FORT.z - 10, x1: FORT.x + 32, z1: FORT.z + 32 });
// Rubble and growth at its feet.
for (let i = 0; i < 12; i++) model(pick(['boulder_01', 'namaqualand_boulder_02']), FORT.x + range(-6, 30), FORT.z + range(-6, 30), range(0, TURN), range(0.6, 1.1));
for (let i = 0; i < 30; i++) model(pick(['nettle_plant', 'fern_02', 'weed_plant_02', 'grass_medium_02']), FORT.x + range(-8, 32), FORT.z + range(-8, 32), range(0, TURN));
// The dirt track from Station Road through the woods to the fort's gate.
const TRACK = [[-EDGE, WOOD_TRACK_Z], [-30, -116], [-56, -126], [-72, -136], [-78, -138]];
for (let i = 0; i + 1 < TRACK.length; i++) {
  strip('dirt', ...TRACK[i], ...TRACK[i + 1], 3, TOP.path);
  blockStrip(...TRACK[i], ...TRACK[i + 1], 3 + 3);
}
model('dead_tree_trunk', -40, -122, 0.4); model('tree_stump_01', -62, -127, 1.1);
// And a track across the meadow from the back lane to a knoll with a dead tree.
const MEADOW_TRACK = [[TERRACE.x0, LANE_Z], [-118, 60], [-132, 92]];
for (let i = 0; i + 1 < MEADOW_TRACK.length; i++) {
  strip('dirt', ...MEADOW_TRACK[i], ...MEADOW_TRACK[i + 1], 2.6, TOP.path);
  blockStrip(...MEADOW_TRACK[i], ...MEADOW_TRACK[i + 1], 2.6 + 3);
}
model('dead_tree_trunk_02', -134, 96, 0.4); model('tree_stump_01', -129, 98, 1.1); model('boulder_01', -137, 93, 0.6, 1.2);

// === Woodland and meadow ===

/** Where the woods are: the north, either side of the depot and the park; thinner to the east. */
const WOODS = [
  { x0: -EXTENT, z0: -EXTENT, x1: EXTENT, z1: -100, dense: 1 },
  { x0: -EXTENT, z0: -100, x1: DEPOT.x0 - 4, z1: -PAVE_OUT - 6, dense: 1 },
  { x0: PARK.x1 + 4, z0: -100, x1: EXTENT, z1: -PAVE_OUT - 10, dense: 0.8 }
];
const inWoods = (x, z) => WOODS.find((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1);
const BROADLEAF = [
  ['island_tree_01', 1.6, 2.2], ['island_tree_02', 1.5, 2.0], ['island_tree_03', 1.6, 2.2], ['island_tree_03', 1.6, 2.2],
  ['tree_small_02', 1.3, 1.8], ['tree_small_02', 1.3, 1.8], ['searsia_lucida', 1.3, 1.7]
];
const CONIFER = [['pine_tree', 0.7, 1.0], ['pine_tree', 0.7, 1.0], ['pine_tree_b', 0.8, 1.1], ['fir_sapling', 0.9, 1.2]];
const tree = (species, x, z) => { const [id, a, b] = pick(species); model(id, x, z, range(0, TURN), range(a, b)); };

// Leaf litter under the dense woodland, as a quilt of ten-metre cells
// that tile seamlessly because the texture is mapped from the world.
const CELL = 10;
for (let x = -EXTENT + CELL / 2; x < EXTENT; x += CELL) {
  for (let z = -EXTENT + CELL / 2; z < EXTENT; z += CELL) {
    const w = inWoods(x, z);
    if (!w || blocked(x, z) || noise(x / 38, z / 38, 1) * w.dense < 0.5) continue;
    if (Math.abs(x) < PAVE_OUT + 8 || Math.abs(z) < PAVE_OUT + 8) continue;
    patch('litter', x - CELL / 2, z - CELL / 2, x + CELL / 2, z + CELL / 2, TOP.litter);
  }
}

const GRID = 5;
for (let gx = -EXTENT + 2; gx < EXTENT - 2; gx += GRID) {
  for (let gz = -EXTENT + 2; gz < EXTENT - 2; gz += GRID) {
    const x = gx + range(-2.2, 2.2), z = gz + range(-2.2, 2.2);
    if (blocked(x, z)) continue;
    const w = inWoods(x, z);
    if (w) {
      const n = noise(x / 38, z / 38, 1) * w.dense;
      const conifer = noise(x / 120, z / 120, 2) > 0.58;
      if (n > 0.38) {
        if (chance(0.85)) {
          if (chance(0.03)) model('jacaranda_tree', x, z, range(0, TURN), range(0.5, 0.65));
          else tree(conifer ? CONIFER : BROADLEAF, x, z);
        }
        // Under the canopy: ferns, moss, nettles, dead wood.
        const n2 = 1 + (chance(0.5) ? 1 : 0);
        for (let i = 0; i < n2; i++) {
          const id = pick(['fern_02', 'fern_02', 'nettle_plant', 'moss_01', 'grass_medium_02', 'dry_branches_medium_01', 'weed_plant_02']);
          model(id, x + range(-2.5, 2.5), z + range(-2.5, 2.5), range(0, TURN), id === 'moss_01' ? range(2, 3) : range(0.8, 1.3));
        }
        if (chance(0.02)) model('tree_stump_01', x + range(-2, 2), z + range(-2, 2), range(0, TURN));
        if (chance(0.012)) model('dead_tree_trunk', x + range(-2, 2), z + range(-2, 2), range(0, TURN));
        if (chance(0.008)) model('dead_tree_trunk_02', x + range(-2, 2), z + range(-2, 2), range(0, TURN));
        if (chance(0.02)) model(pick(['boulder_01', 'namaqualand_boulder_02']), x, z, range(0, TURN), range(0.8, 1.4));
        if (chance(0.004)) model('rock_moss_set_01', x, z, range(0, TURN), range(0.8, 1.1));
      } else if (n > 0.26) {
        // The wood's edge: grass, low shrubs, the odd young tree and flowers in the light.
        if (chance(0.14)) tree(conifer ? CONIFER : BROADLEAF, x, z);
        const id = pick(['grass_medium_01', 'grass_medium_02', 'grass_medium_02', 'shrub_03', 'dandelion_01', 'shrub_02', 'flower_gazania', 'shrub_large']);
        model(id, x, z, range(0, TURN), range(0.8, 1.2));
        if (chance(0.015)) model(pick(['boulder_01', 'namaqualand_boulder_02']), x, z, range(0, TURN), range(0.7, 1.2));
      } else if (chance(0.5)) {
        model(pick(['grass_medium_01', 'grass_medium_02', 'dandelion_01']), x, z, range(0, TURN), range(0.8, 1.2));
      }
      continue;
    }
    // Meadow: tall grass, dandelions, drifts of gazania, a lone tree now and then.
    const flowers = noise(x / 22, z / 22, 4);
    if (flowers > 0.64 && chance(0.6)) model('flower_gazania', x, z, range(0, TURN), range(0.8, 1.2));
    else if (chance(0.5)) model('grass_medium_01', x, z, range(0, TURN), range(0.9, 1.3));
    else if (chance(0.55)) model('grass_medium_02', x, z, range(0, TURN), range(0.9, 1.3));
    else if (chance(0.3)) model('dandelion_01', x, z, range(0, TURN), range(0.8, 1.2));
    else if (chance(0.25)) model(pick(['shrub_03', 'shrub_03', 'shrub_01', 'shrub_02', 'shrub_large']), x, z, range(0, TURN), range(0.8, 1.2));
    if (chance(0.012)) tree([['tree_small_02', 1.5, 1.9], ['island_tree_02', 1.6, 2.0], ['island_tree_01', 1.8, 2.2], ['searsia_lucida', 1.3, 1.6]], x, z);
    if (chance(0.006)) model(pick(['boulder_01', 'namaqualand_boulder_02']), x, z, range(0, TURN), range(0.7, 1.3));
    if (chance(0.003)) model(pick(['dead_tree_trunk', 'tree_stump_01']), x, z, range(0, TURN));
  }
}

// === The scene ===

const total = [...props.values()].reduce((n, p) => n + p.instances.length, 0);
const lights = [...props.values()].filter((p) => prefabs[p.prefab].light).reduce((n, p) => n + p.instances.length, 0);

/**
 * The world is the yard's, re-aimed: the fox starts on the pavement outside
 * the grocer, by the milk truck's crates, the camera behind it looking
 * east along the shops and down Main Road; the air is clearer than the yard's, since the lot
 * is seen across a hundred metres where the yard is seen across ten, and
 * there is a wind for the trees.
 */
const world = structuredClone(yard.world);
world.camera = { ...world.camera, yaw: -1.9, pitch: 0.2, distance: 8 };
for (const state of world.cycle.states) {
  const dusk = state.name === 'dusk';
  state.lighting.fog.density = dusk ? 0.0055 : 0.0032;
  // A breeze off the meadow in the afternoon, dropping toward evening;
  // the cycle blends it as it blends the fog.
  state.lighting.wind = { direction: { x: 0.8, z: -0.6 }, strength: dusk ? 0.25 : 0.6, gust: dusk ? 0.3 : 0.6 };
}
const hero = yard.layers[0].objects.find((o) => o.id === 'hero');
// The air: pollen and dust around wherever the camera is, catching the
// sun, and smoke from three of the terrace's chimneys, leaning downwind.
const chimneyTop = (i) => {
  const x = TERRACE_X0 + i * HOUSE_W + HOUSE_W / 2;
  // A house is turned by pi, so its local +x chimney end is to the west.
  const side = i % 2 ? 1 : -1;
  return { x: r(x - side * (HOUSE_W / 2 - 0.7)), y: r(6.2 + HOUSE_D / 2 + 1.2), z: r((HOUSE_FRONT + HOUSE_BACK) / 2) };
};
world.particles = [
  { kind: 'motes', count: 900, extent: { x: 18, y: 5, z: 18 }, radius: 0.022, color: '#fff2d0', opacity: 0.55, speed: 0.4 },
  ...[1, 4, 6].map((i) => ({ kind: 'smoke', count: 36, at: chimneyTop(i), extent: { x: 0.5, y: 3.5, z: 0.5 }, radius: 0.6, color: '#8f8a86', opacity: 0.32, speed: 0.5 }))
];

const scene = {
  version: yard.version,
  type: 'level',
  name: 'lot',
  title: 'The Lot',
  world,
  assets: { ...yard.assets, models: { ...yard.assets.models, ...models } },
  prefabs,
  layers: [{
    name: 'main',
    objects: [
      // The ground under the whole lot, and the fox on the grocer's pavement.
      { id: 'floor', prefab: 'ground', x: 0, y: -0.25, z: 0, width: EXTENT * 2 + 40, height: 0.5, depth: EXTENT * 2 + 40 },
      { ...hero, x: 7.2, y: 1, z: 5.2 },
      ...objects
    ],
    props: [...props.values()]
  }]
};

writeFileSync(out, writeScene(scene));
console.log(`Wrote ${out}: ${total} prop instances in ${props.size} props, ${lights} lights, ${objects.length} objects`);
