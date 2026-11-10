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
  modular_electricity_poles: '4k', modular_fort_01: '4k'
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
 * Textures the examples map onto primitive shapes (the lot's roads, kerbs
 * and plinths), by id and resolution. Like a panorama, a texture needs no
 * compile step. Only the colour map is fetched: a shape's `mesh.texture`
 * reads nothing else yet, and a fresh checkout should not pay for maps
 * nothing draws.
 */
export const TEXTURES = {
  asphalt_03: '1k',
  concrete_floor_02: '1k'
};

/** Where a fetched texture lands, beside the generated dev textures. */
export const TEXTURE_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'textures');

/** The file a texture's colour map is saved as, which a scene's `url` names. */
export const texturePath = (id, resolution) => resolve(TEXTURE_DIR, `${id}_diff_${resolution}.jpg`);

/** One HDR panorama into `HDRI_DIR`; a 2k sky is about 5 MB and needs no compile step. */
export function fetchHDRI(id, resolution) {
  return polyhaven.fetchHDRI(id, resolution, resolve(HDRI_DIR, `${id}_${resolution}.hdr`));
}

/** One texture's colour map into `TEXTURE_DIR`, about a megabyte at 1k. */
export function fetchTexture(id, resolution) {
  return polyhaven.fetchTexture(id, resolution, texturePath(id, resolution));
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
