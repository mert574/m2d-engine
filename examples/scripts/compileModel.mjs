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
 * ignored by git, rebuilt by `buildModels.mjs`, and are what
 * `assets.models` in a scene names. The compiler itself is the editor
 * host's (`m2d-editor-host/pipeline/compile.mjs`).
 *
 * Textures are KTX2 (Basis Universal, `KHR_texture_basisu`), which the
 * engine transcodes at load to whatever block-compressed format the GPU
 * has — a quarter of RGBA8's memory, with the mip chain in the file — so
 * the cap is 3072 where WebP had to stop at 2048; see `TEXTURE_CAP` for
 * why not 4096. Normal maps are UASTC with the encoder's normal-map
 * tuning, metallic-roughness and occlusion UASTC too (ETC1S's shared
 * codebook smears correlated channels), and colour maps ETC1S, which
 * reads fine for albedo at a fraction of the bytes. Block formats need
 * dimensions in whole 4px blocks at level 0, which the cap preserves for
 * the power-of-two sources Poly Haven ships and `roundToBlock` guards
 * for anything else.
 *
 * A build is encoder time. The decimation of even a four-million-triangle
 * scan is a minute; every 3072 UASTC texture at the encoder's default
 * effort is three quarters of one, and a tree carries nine. The levels
 * chosen below bring a texture to 3–13 s; `buildModels.mjs` runs several
 * models at once on top of that.
 *
 * An encode that fails is an error, not a warning. The encoder plugin
 * catches its own failures and leaves the source image in place, which
 * is how a whole build once shipped 4k PNGs while every status said
 * KTX2; `assertEncoded` refuses to write such a file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileModel as compile } from 'm2d-editor-host/pipeline/compile.mjs';
import { SOURCE_DIR, ASSETS, PIECES } from './fetchPolyHaven.mjs';

/** Where the compiled lot models go; ignored by git, rebuilt by `buildModels.mjs`. */
export const OUT_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'models', 'ph');

/**
 * Bumped when what this script writes changes shape (texture format, LOD
 * layout); `buildModels.mjs` rebuilds every model whose stamp disagrees.
 * 5: foliage levels thin whole cards, and cut-outs carry `m2d.foliage`.
 * 6: textures sized by kind (`TEXTURE_SIZE` in the compiler), not all at 3072.
 * 7: levels switch at distances by kind; far foliage is quads, a tree's last level a few thousand triangles.
 * 8: a tree's level 0 is 150k triangles, not 300k; clearcoat factors are kept.
 */
export const FORMAT = 8;

/**
 * Models whose textures outgrow their kind's size: the fort's pieces are
 * props, but a tower thirteen metres tall is seen across it.
 */
const TEXTURE_SIZES = { fort_tower: 2048, fort_wall: 2048, fort_corner: 2048, fort_gate: 2048 };

/** What kind of thing each source is, which sets its triangle budget. */
export const KINDS = {
  jacaranda_tree: 'tree', island_tree_02: 'tree', tree_small_02: 'tree', searsia_lucida: 'tree',
  fir_sapling_medium: 'tree', dead_tree_trunk_02: 'tree',
  island_tree_01: 'tree', island_tree_03: 'tree', pine_tree_01: 'tree', dead_tree_trunk: 'tree', tree_stump_01: 'tree',
  fir_sapling: 'tree', pine_tree: 'tree', pine_tree_b: 'tree', shrub_large: 'ground',
  grass_medium_01: 'ground', fern_02: 'ground', shrub_02: 'ground', nettle_plant: 'ground', dandelion_01: 'ground',
  shrub_01: 'ground', shrub_03: 'ground', grass_medium_02: 'ground', flower_gazania: 'ground', moss_01: 'ground',
  weed_plant_02: 'ground', periwinkle_plant: 'ground', dry_branches_medium_01: 'ground',
  boulder_01: 'rock', rock_moss_set_01: 'rock', namaqualand_boulder_02: 'rock',
  potted_plant_01: 'ground', potted_plant_02: 'ground'
};

/** The Poly Haven source a model key compiles from: itself, or the kit a piece is cut from. */
export const sourceOf = (id) => PIECES[id]?.from ?? id;

/**
 * One of the lot's sources into `OUT_DIR`. The compiler itself is the
 * editor host's (`m2d-editor-host/pipeline/compile.mjs`), which the
 * editor's library import runs too; this names the lot's paths and kinds.
 * A key in `PIECES` compiles its kit with only the piece's nodes kept.
 */
export async function compileModel(id) {
  const source = sourceOf(id);
  const info = JSON.parse(readFileSync(resolve(SOURCE_DIR, source, 'info.json'), 'utf8'));
  return compile({
    source: resolve(SOURCE_DIR, source, `${source}.gltf`),
    to: resolve(OUT_DIR, `${id}.glb`),
    kind: KINDS[id] ?? 'prop',
    label: `polyhaven:${source}`,
    name: info.name,
    authors: Object.keys(info.authors ?? {}),
    keep: PIECES[id]?.keep ?? null,
    textureSize: TEXTURE_SIZES[id] ?? null
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(ASSETS), ...Object.keys(PIECES)];
  let total = 0;
  for (const id of ids) {
    const r = await compileModel(id);
    total += r.bytes;
    console.log(`${id}: ${(r.sourceTriangles / 1e3).toFixed(0)}k tris -> ${r.lods.map((l) => `${(l.triangles / 1e3).toFixed(0)}k`).join(' / ')}, ${(r.bytes / 1e6).toFixed(1)} MB in ${r.seconds.toFixed(1)} s`);
  }
  console.log(`${ids.length} models, ${(total / 1e6).toFixed(0)} MB in ${OUT_DIR}`);
}
