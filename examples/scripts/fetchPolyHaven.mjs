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
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

const api = async (path) => {
  const response = await fetch(`https://api.polyhaven.com${path}`);
  if (!response.ok) throw new Error(`Poly Haven API ${path}: ${response.status}`);
  return response.json();
};

const md5 = (buffer) => createHash('md5').update(buffer).digest('hex');

async function download(url, to, expectedMd5) {
  if (existsSync(to) && md5(readFileSync(to)) === expectedMd5) return false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (md5(bytes) === expectedMd5) {
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, bytes);
      return true;
    }
    if (attempt === 3) throw new Error(`${url}: checksum mismatch after ${attempt} attempts`);
  }
}

export async function fetchAsset(id, resolution) {
  const files = await api(`/files/${id}`);
  const entry = files.gltf?.[resolution]?.gltf;
  if (!entry) throw new Error(`${id}: no glTF at ${resolution} (have ${Object.keys(files.gltf ?? {}).join(', ')})`);
  const dir = resolve(SOURCE_DIR, id);
  let fetched = 0;
  let bytes = entry.size;
  if (await download(entry.url, resolve(dir, `${id}.gltf`), entry.md5)) fetched++;
  for (const [relative, file] of Object.entries(entry.include)) {
    bytes += file.size;
    if (await download(file.url, resolve(dir, relative), file.md5)) fetched++;
  }
  // Alpha and opacity maps as PNG, for the compiler to fold into the colour.
  for (const [key, byResolution] of Object.entries(files)) {
    // `wire_alpha`, `Alpha`, `wire_opacity`: the API's keys vary in case and prefix.
    if (!/(^|_)(alpha|opacity)$/i.test(key)) continue;
    const png = byResolution[resolution]?.png ?? Object.values(byResolution)[0]?.png;
    if (!png) continue;
    bytes += png.size;
    if (await download(png.url, resolve(dir, 'textures', `${id}_${key.toLowerCase()}_${resolution}.png`), png.md5)) fetched++;
  }
  const info = await api(`/info/${id}`);
  writeFileSync(resolve(dir, 'info.json'), JSON.stringify({ id, resolution, name: info.name, authors: info.authors, categories: info.categories, tags: info.tags }, null, 2));
  return { fetched, bytes, name: info.name, authors: Object.keys(info.authors ?? {}) };
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
