/**
 * Fetches source models from Poly Haven: `node scripts/fetchPolyHaven.mjs [ids...]`.
 *
 * Every model goes to `examples/assets-src/polyhaven/<id>/` as the `.gltf`
 * with its `.bin` and textures, at the resolution ASSETS names (Poly Haven
 * offers 1k to 8k; the compiler resizes what it keeps), each file checked
 * against the md5 the API publishes, plus the asset's info record for
 * the credits. The glTF's textures are JPEGs, which carry no alpha, so a
 * material that needs one (a leaf, a chain-link wire) is opaque as
 * exported; the `*_alpha` and `*_opacity` maps the API publishes as PNG
 * are fetched alongside, and the compiler folds them into the colour. The directory is ignored by git: it is the compiler's
 * input, and `scripts/compileModel.mjs` writes what the game loads.
 *
 * Poly Haven assets are CC0. The notice in THIRD_PARTY_NOTICES.md credits
 * them anyway, by id and author, as the engine credits everything.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as polyhaven from 'm2d-editor-host/pipeline/polyhaven.mjs';

export const SOURCE_DIR = resolve(import.meta.dirname, '..', 'assets-src', 'polyhaven');

/** The set the lot uses, with the texture resolution to fetch. */
export const ASSETS = {
  // Trees and shrubs: photoscans of millions of triangles, which the
  // compiler decimates into a chain of levels of detail.
  jacaranda_tree: '4k', island_tree_02: '4k', tree_small_02: '4k', searsia_lucida: '4k',
  fir_sapling_medium: '4k', dead_tree_trunk_02: '4k',
  // Ground cover.
  grass_medium_01: '2k', fern_02: '2k', shrub_02: '2k', nettle_plant: '2k', dandelion_01: '2k',
  // Rocks.
  boulder_01: '4k', rock_moss_set_01: '4k', namaqualand_boulder_02: '4k',
  // Props.
  Barrel_01: '4k', barrel_03: '4k', wooden_crate_01: '4k', cardboard_box_01: '4k', plastic_crate_03: '2k',
  street_lamp_01: '4k', covered_car: '4k', modular_industrial_pipes_01: '4k', wooden_picnic_table: '4k',
  concrete_road_barrier: '4k', modular_chainlink_fence: '4k',
  hand_truck: '2k', propane_tank: '2k', old_tyre: '2k', utility_box_01: '2k', fire_hydrant: '2k',
  modular_electricity_poles: '4k', modular_fort_01: '4k',
  // Added for the lot's rebuild as a place (Nov 2026): more trees and
  // cover so the woodland and the park are not four species on repeat,
  // and the street furniture, depot gear and garden things a scene needs
  // to read as somewhere people work and sit.
  island_tree_01: '4k', island_tree_03: '4k', pine_tree_01: '4k', dead_tree_trunk: '2k', tree_stump_01: '2k',
  shrub_01: '2k', shrub_03: '2k', grass_medium_02: '2k', flower_gazania: '2k', moss_01: '2k',
  weed_plant_02: '2k', periwinkle_plant: '2k', dry_branches_medium_01: '2k',
  large_iron_gate: '2k', metal_trash_can: '2k', modular_street_seating: '2k', painted_wooden_bench: '2k',
  water_manhole_cover: '1k', wooden_crate_02: '2k', industrial_storage_cart: '2k',
  planter_box_01: '2k', stone_fire_pit: '2k', outdoor_table_chair_set_01: '2k', garden_gnome: '1k',
  // What dresses the lot's buildings, which are primitive shells: roller
  // shutters on the warehouse and the shops, lamps on their walls, and
  // the things people leave at a door, in a yard or on an allotment.
  rollershutter_door: '2k', rollershutter_window_01: '2k', industrial_wall_lamp: '2k', security_light: '2k',
  street_lamp_02: '2k', potted_plant_01: '2k', potted_plant_02: '2k', CoffeeCart_01: '2k',
  plastic_monobloc_chair_01: '2k', portable_generator: '2k', wooden_ladder: '2k', compost_bags: '2k',
  planter_box_02: '2k', garden_hose_wall_mounted_01: '2k', tool_cart: '2k'
};

/**
 * Pieces cut from the modular kits above, by the model key the lot's
 * prefabs name. A kit (a fence, a set of poles, a fort) lays its parts
 * out side by side for display, so placing the whole file never gives a
 * straight fence or one pole; the compiler keeps only the root nodes
 * named here (`keep`, strings or regular expressions) and stands the
 * piece on its origin. Each compiles to `models/ph/<key>.glb` from the
 * `from` source, which `ASSETS` must list.
 */
export const PIECES = {
  // One 1.9 m panel of chain-link, a post to stand between two, and the gate with its frame.
  fence_panel: { from: 'modular_chainlink_fence', keep: ['modular_chainlink_fence_double'] },
  fence_post: { from: 'modular_chainlink_fence', keep: ['modular_chainlink_fence_post'] },
  fence_gate: { from: 'modular_chainlink_fence', keep: ['modular_chainlink_fence_door_frame', 'modular_chainlink_fence_door_gate', 'modular_chainlink_fence_door_latch'] },
  // The kit's third preset: a 6 m pole with its cap, fuse and cross-arm already on it.
  power_pole: { from: 'modular_electricity_poles', keep: [/^preset_03_/] },
  // One bench out of the seating system: single legs, seat, back, both arm rests.
  street_bench: { from: 'modular_street_seating', keep: ['legs_single', 'legs_double', 'crossbar', 'seat', 'seat_back', 'back_support_r', 'back_support_l', 'arm_rest_01', 'arm_rest_02', 'suspended_support_01'] },
  // The clean bin of the pair.
  trash_can: { from: 'metal_trash_can', keep: [/^metal_trash_can(_handle_left|_handle_right|_lid)?$/] },
  // Single plants out of the rows the scans ship as.
  fir_sapling: { from: 'fir_sapling_medium', keep: [/^fir_sapling_medium_a/] },
  pine_tree: { from: 'pine_tree_01', keep: [/^pine_tree_01_a/] },
  pine_tree_b: { from: 'pine_tree_01', keep: [/^pine_tree_01_b/] },
  shrub_large: { from: 'shrub_02', keep: ['shrub_02_a'] },
  // The fort kit's round tower, a thick wall, a corner and the gate wall: a ruin assembled from four parts.
  fort_tower: { from: 'modular_fort_01', keep: ['modular_fort_01_tower_round'] },
  fort_wall: { from: 'modular_fort_01', keep: ['modular_fort_01_wall_thick_straight_01'] },
  fort_corner: { from: 'modular_fort_01', keep: ['modular_fort_01_wall_thick_corner_01'] },
  fort_gate: { from: 'modular_fort_01', keep: ['modular_fort_01_wall_thin_gate_01'] },
  // The clean shutter of each clean-and-tagged pair.
  shop_shutter_door: { from: 'rollershutter_door', keep: ['rollershutter_door'] },
  shop_shutter_window: { from: 'rollershutter_window_01', keep: ['rollershutter_window_01'] }
};

/**
 * HDR environments the examples light with, by id and the resolution to
 * fetch. A panorama is one `.hdr` the engine decodes at load, so unlike
 * a model there is nothing to compile; it still arrives as a recipe
 * rather than as bytes in the repository.
 */
export const HDRIS = {
  kloofendal_43d_clear_puresky: '2k'
};

/** Where a fetched panorama lands, which is what a scene's `url` names. */
export const HDRI_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'environments');

/**
 * Textures the examples map onto primitive shapes (the lot's roads, kerbs,
 * walls and buildings), by id and resolution. Like a panorama, a texture
 * needs no compile step. Each comes as the three maps a shape's
 * `mesh.texture` reads (`TEXTURE_MAPS`): colour, normal, and occlusion-
 * roughness-metal; the rest Poly Haven offers (displacement, bump) draw
 * nothing here and are not fetched.
 */
export const TEXTURES = {
  asphalt_03: '1k',
  concrete_floor_02: '1k',
  // The lot's ground is not one dev grid: lawn under everything, leaf
  // litter under the woodland, gravel in the depot, paving on the
  // pavements and paths, a dirt track across the meadow, and brick for
  // the walls.
  leafy_grass: '1k',
  forest_leaves_03: '1k',
  gravel_floor_02: '1k',
  concrete_pavement_03: '1k',
  dirt_floor: '1k',
  brick_wall_006: '1k',
  // Planks for the yard's crates, which are shoved about and so stay primitive boxes.
  brown_planks_09: '1k',
  // The buildings' shells: the warehouse's brick and corrugated cladding,
  // the terrace's brick and render, the shop's plaster, the office's
  // boarding, tiled roofs; and the plaza's setts and the shop forecourt.
  factory_brick: '1k',
  corrugated_iron_02: '1k',
  red_brick_03: '1k',
  white_stucco: '1k',
  yellow_plaster: '1k',
  exterior_wall_cladding: '1k',
  clay_roof_tiles: '1k',
  grey_roof_tiles: '1k',
  cobblestone_floor_04: '1k',
  herringbone_pavement: '1k',
  // The warehouse's roller doors, too big for the shop shutter scans.
  painted_metal_shutter: '1k'
};

/** Where a fetched texture lands, beside the generated dev textures. */
export const TEXTURE_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'textures');

/** The file a texture's colour map is saved as, which a scene's `url` names. */
export const texturePath = (id, resolution, map = 'diff') => resolve(TEXTURE_DIR, `${id}_${map}_${resolution}.jpg`);

/**
 * The maps fetched for each texture, by the API's name and the file's
 * suffix: the colour, the normal map and the occlusion-roughness-metal
 * map a shape's `mesh.texture` reads as `url`, `normal` and `arm`.
 */
export const TEXTURE_MAPS = [['Diffuse', 'diff'], ['nor_gl', 'nor_gl'], ['arm', 'arm']];

/** One HDR panorama into `HDRI_DIR`; a 2k sky is about 5 MB and needs no compile step. */
export function fetchHDRI(id, resolution) {
  return polyhaven.fetchHDRI(id, resolution, resolve(HDRI_DIR, `${id}_${resolution}.hdr`));
}

/** One texture's colour map into `TEXTURE_DIR`, about a megabyte at 1k. */
export function fetchTexture(id, resolution, [map, suffix] = TEXTURE_MAPS[0]) {
  return polyhaven.fetchTexture(id, resolution, texturePath(id, resolution, suffix), map);
}

/** One model's source into `SOURCE_DIR/<id>/`, for `compileModel.mjs`. */
export async function fetchAsset(id, resolution) {
  const dir = resolve(SOURCE_DIR, id);
  mkdirSync(dir, { recursive: true });
  const result = await polyhaven.fetchModel(id, resolution, dir);
  return { fetched: result.fetched, bytes: result.bytes, name: result.name, authors: result.authors };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ASSETS);
  let total = 0;
  for (const id of ids) {
    const resolution = ASSETS[id] ?? '2k';
    const { fetched, bytes, name, authors } = await fetchAsset(id, resolution);
    total += bytes;
    console.log(`${id} (${name}, by ${authors.join(', ')}) at ${resolution}: ${(bytes / 1e6).toFixed(1)} MB, ${fetched} files fetched`);
  }
  console.log(`${ids.length} assets, ${(total / 1e9).toFixed(2)} GB in ${SOURCE_DIR}`);
}
