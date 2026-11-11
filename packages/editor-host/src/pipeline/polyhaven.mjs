/**
 * Poly Haven, as a library source: search its catalogue, fetch an asset's
 * files, read its credit.
 *
 * Every file is checked against the md5 the API publishes, and a file
 * already on disk with that checksum is kept, so a fetch is also a
 * resume. Poly Haven assets are CC0; the engine credits them anyway, by
 * id and author, as it credits everything.
 *
 * In the host because the editor's library panel searches and imports
 * through it; the examples' build scripts fetch the lot's set with it.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const SOURCE = 'polyhaven';
export const LICENSE = 'CC0';

const API = 'https://api.polyhaven.com';

const api = async (path) => {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`Poly Haven API ${path}: ${response.status}`);
  return response.json();
};

const md5 = (buffer) => createHash('md5').update(buffer).digest('hex');

/** One file, checked; returns whether it was fetched (false: already there). */
export async function download(url, to, expectedMd5) {
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
  return false;
}

/** The library's types, as Poly Haven names them. */
export const TYPES = { models: 'models', textures: 'textures', hdris: 'hdris' };

const catalogues = new Map();

/** Every asset of a type, `{ id: record }`, fetched once per process. */
export async function catalogue(type) {
  if (!TYPES[type]) throw new Error(`Poly Haven: no asset type '${type}' (models, textures, hdris)`);
  if (!catalogues.has(type)) {
    catalogues.set(type, api(`/assets?type=${type}`).catch((error) => {
      catalogues.delete(type);
      throw error;
    }));
  }
  return catalogues.get(type);
}

/**
 * Search a type by words in the name, id, categories and tags; every word
 * must match. Results are the editor's cards: id, name, authors,
 * categories, a thumbnail URL, the licence and the page to credit.
 */
export async function search(type, query = '', limit = 60) {
  const all = await catalogue(type);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const [id, record] of Object.entries(all)) {
    const haystack = [id, record.name, ...(record.categories ?? []), ...(record.tags ?? [])].join(' ').toLowerCase();
    if (!words.every((word) => haystack.includes(word))) continue;
    results.push({ id, record });
  }
  // Most downloaded first: the catalogue's own measure of a good asset.
  results.sort((a, b) => (b.record.download_count ?? 0) - (a.record.download_count ?? 0));
  return results.slice(0, limit).map(({ id, record }) => card(id, record, type));
}

function card(id, record, type) {
  return {
    source: SOURCE,
    type,
    id,
    name: record.name ?? id,
    authors: Object.keys(record.authors ?? {}),
    categories: record.categories ?? [],
    thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
    license: LICENSE,
    page: `https://polyhaven.com/a/${id}`
  };
}

/** An asset's record: name, authors, categories, tags. */
export async function info(id) {
  return api(`/info/${id}`);
}

/** The credit the project records for an asset. */
export async function credit(id, type) {
  return card(id, await info(id), type);
}

/**
 * A model's glTF, its buffers and textures, into `dir`, plus the alpha and
 * opacity maps the API publishes as PNG (the compiler folds them into the
 * colour) and an `info.json` with the credit. Returns the `.gltf` path.
 * @param {string} id
 * @param {string} resolution
 * @param {string} dir
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function fetchModel(id, resolution, dir, onProgress = () => {}) {
  const files = await api(`/files/${id}`);
  const available = Object.keys(files.gltf ?? {});
  const at = files.gltf?.[resolution] ? resolution : available.includes('2k') ? '2k' : available[0];
  const entry = files.gltf?.[at]?.gltf;
  if (!entry) throw new Error(`${id}: no glTF (have ${available.join(', ') || 'none'})`);
  const jobs = [[entry.url, resolve(dir, `${id}.gltf`), entry.md5, entry.size]];
  for (const [relative, file] of Object.entries(entry.include)) jobs.push([file.url, resolve(dir, relative), file.md5, file.size]);
  for (const [key, byResolution] of Object.entries(files)) {
    // `wire_alpha`, `Alpha`, `wire_opacity`: the API's keys vary in case and prefix.
    if (!/(^|_)(alpha|opacity)$/i.test(key)) continue;
    const png = byResolution[at]?.png ?? Object.values(byResolution)[0]?.png;
    if (png) jobs.push([png.url, resolve(dir, 'textures', `${id}_${key.toLowerCase()}_${at}.png`), png.md5, png.size]);
  }
  const total = jobs.reduce((sum, job) => sum + (job[3] ?? 0), 0);
  let done = 0;
  let fetched = 0;
  for (const [url, to, sum, size] of jobs) {
    if (await download(url, to, sum)) fetched++;
    done += size ?? 0;
    onProgress(done, total);
  }
  const record = await info(id);
  writeFileSync(resolve(dir, 'info.json'), JSON.stringify({
    id, resolution: at, name: record.name, authors: record.authors, categories: record.categories, tags: record.tags
  }, null, 2));
  return { gltf: resolve(dir, `${id}.gltf`), resolution: at, fetched, bytes: total, name: record.name, authors: Object.keys(record.authors ?? {}) };
}

/** A texture's colour map, one JPEG, to `to`. */
export async function fetchTexture(id, resolution, to, map = 'Diffuse') {
  const files = await api(`/files/${id}`);
  // `map` is the API's name for one of the texture's maps: `Diffuse`,
  // `nor_gl` (an OpenGL-convention normal map), `arm` (occlusion,
  // roughness and metal in red, green and blue, glTF's own layout).
  const entry = files[map]?.[resolution]?.jpg;
  if (!entry) throw new Error(`${id}: no ${map} JPEG at ${resolution} (have ${Object.keys(files[map] ?? {}).join(', ') || 'none'})`);
  const fetched = await download(entry.url, to, entry.md5) ? 1 : 0;
  const record = await info(id);
  return { fetched, bytes: entry.size, to, name: record.name, authors: Object.keys(record.authors ?? {}) };
}

/** An HDR panorama, one `.hdr`, to `to`. */
export async function fetchHDRI(id, resolution, to) {
  const files = await api(`/files/${id}`);
  const entry = files.hdri?.[resolution]?.hdr;
  if (!entry) throw new Error(`${id}: no .hdr at ${resolution} (have ${Object.keys(files.hdri ?? {}).join(', ')})`);
  const fetched = await download(entry.url, to, entry.md5) ? 1 : 0;
  const record = await info(id);
  return { fetched, bytes: entry.size, to, name: record.name, authors: Object.keys(record.authors ?? {}) };
}
