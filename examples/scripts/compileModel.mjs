/**
 * Compiles source models into what the game loads:
 * `node --max-old-space-size=4096 scripts/compileModel.mjs [ids...]`.
 * One model at a time is kind to memory; a shell loop over the ids is
 * how the whole set is built.
 *
 * A photoscanned tree arrives as millions of triangles and nine 4k
 * textures, which no frame can afford per instance. For each model this
 * writes one `.glb` to `src/yard/models/ph/` holding a chain of levels of
 * detail — the mesh decimated with meshoptimizer to a budget for level 0
 * and to a fraction of it for each level after, under root nodes named
 * `LOD0`, `LOD1`, ... that the engine's glTF reader recognises — with the
 * textures resized to a cap and re-encoded as WebP, and the screen
 * coverage each level is drawn at written into `asset.extras.m2d.lods`.
 * The sources come from `scripts/fetchPolyHaven.mjs`; the outputs are
 * committed and are what `assets.models` in a scene names.
 *
 * Textures are capped at 2048 for now: a 4k RGBA texture with its mips
 * is 85 MB of GPU memory and a tree has nine, so 4k waits for compressed
 * textures (KTX2, the next slice), which cut that fourfold.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, mergeDocuments, dedup, weld, simplify, prune, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { SOURCE_DIR, ASSETS } from './fetchPolyHaven.mjs';

export const OUT_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'models', 'ph');

/** Triangles level 0 may keep, by what the model is; the levels after are fractions of it. */
const BUDGET = { tree: 300_000, ground: 40_000, rock: 60_000, prop: 80_000 };
/**
 * Each level after 0 as a share of level 0's triangles, the screen coverage
 * it takes over at, and the error (as a share of the mesh's extent) the
 * simplifier may introduce to get there. A scan's leaf cards are nearly
 * all border, so borders are not locked: a locked tree stays at two
 * million triangles.
 */
const LEVELS = [
  { ratio: 1, coverage: 0, error: 0.01 },
  { ratio: 0.3, coverage: 0.35, error: 0.03 },
  { ratio: 0.08, coverage: 0.12, error: 0.08 },
  { ratio: 0.02, coverage: 0.04, error: 0.2 }
];
const TEXTURE_CAP = 2048;

/** What kind of thing each source is, which sets its triangle budget. */
export const KINDS = {
  jacaranda_tree: 'tree', island_tree_02: 'tree', tree_small_02: 'tree', searsia_lucida: 'tree',
  fir_sapling_medium: 'tree', dead_tree_trunk_02: 'tree',
  grass_medium_01: 'ground', fern_02: 'ground', shrub_02: 'ground', nettle_plant: 'ground', dandelion_01: 'ground',
  boulder_01: 'rock', rock_moss_set_01: 'rock', namaqualand_boulder_02: 'rock'
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Poly Haven's glTF textures are JPEGs, so a masked or blended material
 * arrives with an opaque colour map; its cut-out lives in a separate
 * `*_alpha` (or `*_opacity`) PNG the fetcher puts beside the textures.
 * Fold that into the colour's alpha channel, as PNG, for the encoder to
 * carry into WebP.
 */
async function foldAlpha(doc, dir) {
  for (const material of doc.getRoot().listMaterials()) {
    if (material.getAlphaMode() === 'OPAQUE') continue;
    const texture = material.getBaseColorTexture();
    if (!texture) continue;
    const uri = texture.getURI();
    const candidates = ['alpha', 'opacity'].map((kind) => resolve(dir, uri.replace(/_diff(_\dk)\.\w+$/, `_${kind}$1.png`)));
    const alphaPath = candidates.find((path) => existsSync(path));
    if (!alphaPath) {
      console.warn(`${material.getName()}: ${material.getAlphaMode()} but no alpha map beside ${uri}; it will draw opaque`);
      continue;
    }
    // The map is an RGBA PNG with the mask in its colour. Interleave one
    // grey channel of it behind the colour's RGB by hand: sharp's channel
    // join came back three-channel for these files.
    const colour = await sharp(texture.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = colour.info;
    const alpha = await sharp(alphaPath).removeAlpha().resize(width, height).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
    if (colour.info.channels !== 3 || alpha.info.channels !== 1) {
      throw new Error(`${uri}: expected RGB colour and a grey mask, got ${colour.info.channels} and ${alpha.info.channels} channels`);
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, c = 0, a = 0; i < rgba.length; i += 4, c += 3, a++) {
      rgba[i] = colour.data[c]; rgba[i + 1] = colour.data[c + 1]; rgba[i + 2] = colour.data[c + 2]; rgba[i + 3] = alpha.data[a];
    }
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
    texture.setImage(png).setMimeType('image/png').setURI(uri.replace(/\.\w+$/, '.png'));
  }
}
const triangles = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

export async function compileModel(id) {
  const source = resolve(SOURCE_DIR, id, `${id}.gltf`);
  if (!existsSync(source)) throw new Error(`${id}: no source at ${source}; run scripts/fetchPolyHaven.mjs ${id}`);
  const started = performance.now();
  const base = await io.read(source);
  await foldAlpha(base, dirname(source));
  await base.transform(dedup(), weld());
  const sourceTriangles = triangles(base);
  const budget = BUDGET[KINDS[id] ?? 'prop'];

  // Each level from the welded source: level 0 to its budget, the rest to
  // their share of level 0. The levels are folded into one document as they are made — level 0's
  // scene, then each level's roots under a node named for it — so one
  // copy of the source is alive at a time.
  const lodInfo = [];
  const level0 = Math.min(sourceTriangles, budget);
  let out = null;
  let scene = null;
  const wrap = (children, name) => {
    const node = out.createNode(name);
    for (const child of children) node.addChild(child);
    scene.addChild(node);
  };
  for (const [i, level] of LEVELS.entries()) {
    const doc = cloneDocument(base);
    const target = level0 * level.ratio;
    if (target < sourceTriangles) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / sourceTriangles, error: level.error }));
    }
    const count = Math.round(triangles(doc));
    // A level that saved nothing over the one before is not a level.
    if (i > 0 && count >= lodInfo[lodInfo.length - 1].triangles * 0.9) break;
    lodInfo.push({ triangles: count, coverage: level.coverage });
    if (i === 0) {
      out = doc;
      scene = out.getRoot().listScenes()[0];
      wrap(scene.listChildren(), 'LOD0');
      continue;
    }
    mergeDocuments(out, doc);
    const merged = out.getRoot().listScenes().slice(1);
    const children = merged.flatMap((s) => s.listChildren());
    for (const s of merged) { for (const child of s.listChildren()) s.removeChild(child); s.dispose(); }
    wrap(children, `LOD${i}`);
  }
  // The textures and materials the copies share, folded back together.
  await out.transform(
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_CAP, TEXTURE_CAP], quality: 88 }),
    prune(),
    // The merged levels each brought a buffer; a .glb holds one.
    unpartition()
  );
  const info = JSON.parse(readFileSync(resolve(SOURCE_DIR, id, 'info.json'), 'utf8'));
  out.getRoot().getAsset().extras = {
    ...out.getRoot().getAsset().extras,
    m2d: { source: `polyhaven:${id}`, name: info.name, authors: Object.keys(info.authors ?? {}), sourceTriangles, lods: lodInfo }
  };
  const glb = await io.writeBinary(out);
  mkdirSync(OUT_DIR, { recursive: true });
  const to = resolve(OUT_DIR, `${id}.glb`);
  writeFileSync(to, glb);
  return { id, to, bytes: glb.byteLength, sourceTriangles, lods: lodInfo, seconds: (performance.now() - started) / 1000 };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ASSETS);
  let total = 0;
  for (const id of ids) {
    const r = await compileModel(id);
    total += r.bytes;
    console.log(`${id}: ${(r.sourceTriangles / 1e3).toFixed(0)}k tris -> ${r.lods.map((l) => `${(l.triangles / 1e3).toFixed(0)}k`).join(' / ')}, ${(r.bytes / 1e6).toFixed(1)} MB in ${r.seconds.toFixed(1)} s`);
  }
  console.log(`${ids.length} models, ${(total / 1e6).toFixed(0)} MB in ${OUT_DIR}`);
}
