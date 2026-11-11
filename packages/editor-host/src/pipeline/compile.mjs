/**
 * The model compiler: a glTF source in, one `.glb` the engine loads out.
 *
 * A photoscanned model arrives as millions of triangles and several 4k
 * textures, which no frame can afford per instance. This writes one
 * `.glb` holding a chain of levels of detail — the mesh decimated with
 * meshoptimizer to a budget for level 0 (by `kind`) and to a fraction of
 * it for each level after, under root nodes named `LOD0`, `LOD1`, ... that
 * the engine's glTF reader recognises — with the textures capped and
 * encoded as KTX2 (Basis Universal), and the screen coverage each level
 * is drawn at in `asset.extras.m2d.lods`.
 *
 * It lives in the editor's host because the host runs the asset pipeline
 * for any project (the editor's library import); the examples' build
 * scripts call it with their own paths. Plain JavaScript, so it runs
 * wherever Node does, with the gltf-transform stack it needs.
 *
 * Normal maps are UASTC with the encoder's normal-map tuning,
 * metallic-roughness and occlusion UASTC too (ETC1S's shared codebook
 * smears correlated channels), colour maps ETC1S. An encode that fails is
 * an error, not a warning: the encoder plugin catches its own failures and
 * leaves the source image in place, so `assertEncoded` refuses such a file.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, mergeDocuments, dedup, weld, simplifyPrimitive, compactPrimitive, prune, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ktx2Parallel } from './ktx2Pool.mjs';
import { cardsOf, foliageLevel } from './foliage.mjs';
import sharp from 'sharp';

/** Kinds of model, by their triangle budget. */
export const KIND_NAMES = ['tree', 'ground', 'rock', 'prop'];

/**
 * Block-compressed formats need level-0 dimensions in whole 4px blocks;
 * shave anything that is not (none of Poly Haven's are) down to one.
 */
function roundToBlock() {
  return async (document) => {
    for (const texture of document.getRoot().listTextures()) {
      const size = texture.getSize();
      if (!size || (size[0] % 4 === 0 && size[1] % 4 === 0)) continue;
      const [width, height] = size.map((d) => Math.max(4, Math.floor(d / 4) * 4));
      const png = await sharp(texture.getImage()).resize(width, height, { fit: 'fill' }).png().toBuffer();
      texture.setImage(png).setMimeType('image/png');
      console.warn(`${texture.getName() || texture.getURI()}: ${size[0]}x${size[1]} is not whole 4px blocks; resized to ${width}x${height}`);
    }
  };
}

/**
 * Refuse to write a model whose textures did not survive the encoder.
 *
 * The pool rejects an encode that fails, but a texture in a slot it does
 * not know (a material extension's) is skipped and would ship as the
 * source image — exactly what KTX2 was meant to replace. This turns that
 * into the error it is, naming what was left behind.
 */
function assertEncoded(document, id) {
  const left = document.getRoot().listTextures()
    .filter((texture) => texture.getMimeType() !== 'image/ktx2')
    .map((texture) => {
      const size = texture.getSize();
      return `${texture.getName() || texture.getURI() || 'unnamed'} (${texture.getMimeType()}, ${size ? size.join('x') : '?'})`;
    });
  if (!left.length) return;
  throw new Error(
    `${id}: ${left.length} texture(s) were not encoded as KTX2 and would ship uncompressed:\n  ${left.join('\n  ')}\n` +
    'The encoder plugin logs its failures as warnings above. A texture over ' +
    `${TEXTURE_CAP}px, or over Basis 2.5's 12,582,912-texel ceiling, is the usual cause.`);
}

/** Triangles level 0 may keep, by what the model is; the levels after are fractions of it. */
// A tree at 150k: level 0 is only ever seen within a few metres of its scale times twelve, and at 300k a canopy's cost was in leaves smaller than a pixel.
const BUDGET = { tree: 150_000, ground: 40_000, rock: 60_000, prop: 80_000 };

/**
 * The levels of detail, by kind. `distance` is where a level takes over,
 * in metres from a model at its own size under a 60-degree view; the
 * compiler turns it into the screen coverage the renderer switches on, so
 * a model placed twice as large switches twice as far. `ratio` is the
 * share of level 0's triangles the wood, stone and everything opaque keep,
 * at the simplifier's `error` (a share of the mesh's extent); `cards` the
 * share of leaf cards kept, `quads` whether they become quads.
 *
 * Distances by kind, not one coverage for all: a barrel and a tree under
 * the same coverage switch at three and forty metres, and the barrel's
 * switch is right in front of the player. Foliage goes to quads first,
 * at a distance where a leaf is a few pixels and the change is invisible,
 * and is only thinned further out; the last level is a few thousand
 * triangles, so a tree two hundred metres off costs what one should.
 */
const LEVELS = {
  tree: [
    { distance: 0, ratio: 1, error: 0.01, cards: 1 },
    { distance: 12, ratio: 0.3, error: 0.02, cards: 1, quads: true },
    { distance: 30, ratio: 0.1, error: 0.05, cards: 0.35, quads: true },
    { distance: 70, ratio: 0.03, error: 0.12, cards: 0.12, quads: true },
    { distance: 150, ratio: 0.01, error: 0.25, cards: 0.04, quads: true }
  ],
  ground: [
    { distance: 0, ratio: 1, error: 0.01, cards: 1 },
    { distance: 6, ratio: 0.35, error: 0.03, cards: 1, quads: true },
    { distance: 15, ratio: 0.12, error: 0.08, cards: 0.4, quads: true },
    { distance: 35, ratio: 0.04, error: 0.2, cards: 0.15, quads: true }
  ],
  rock: [
    { distance: 0, ratio: 1, error: 0.01 },
    { distance: 10, ratio: 0.3, error: 0.02 },
    { distance: 25, ratio: 0.1, error: 0.05 },
    { distance: 60, ratio: 0.03, error: 0.15 }
  ],
  prop: [
    { distance: 0, ratio: 1, error: 0.01 },
    { distance: 10, ratio: 0.3, error: 0.02 },
    { distance: 25, ratio: 0.1, error: 0.05 },
    { distance: 60, ratio: 0.03, error: 0.15 }
  ]
};
/** tan(30 degrees): half the reference view's height at one metre. */
const REFERENCE_TAN = Math.tan(Math.PI / 6);

/**
 * How much a surviving card may grow to stand in for the ones thinned
 * around it. Coverage would want 1/sqrt(cards); past this a leaf reads
 * as a paddle even at the distance its level is drawn at.
 */
const CARD_GROWTH = 3;

/**
 * The fewest cards thinning leaves a model with, across all its foliage.
 * A tree has tens of thousands of leaves and loses most of them far off
 * without looking thinner from there; a tuft of grass has a few hundred
 * blades, and at the same share it would be a handful.
 */
const MIN_CARDS = 120;

/** meshoptimizer, told to collapse across attribute seams and drop specks; see `reduceLevel`. */
const SEAMLESS = {
  ...MeshoptSimplifier,
  ready: MeshoptSimplifier.ready,
  simplify: (indices, positions, stride, target, error, flags = []) => MeshoptSimplifier.simplify(indices, positions, stride, target, error, [...flags, 'Permissive', 'Prune'])
};

/** Leaf, needle and blade cards: whatever a cut-out material draws. */
const isFoliage = (prim) => prim.getMaterial()?.getAlphaMode() === 'MASK' && !!prim.getIndices();

/**
 * Bring one level to its share. Level 0 is the source cut to its budget;
 * every level after is made from level 0, never from the source, so none
 * can cost more than it. (From the source, a pine's 409,000 needles —
 * which level 0's budget squeezes to 121,000 triangles in all — came back
 * as 818,000 triangles of quads.) Wood, stone and everything opaque are
 * simplified by `woodRatio` at the level's error; foliage is made by
 * `foliageLevel` (quads, then thinning), and what stays triangles is
 * reduced by `foliageRatio`, which past level 0 is 1: a leaf keeps the
 * shape level 0 gave it.
 */
async function reduceLevel(doc, level, woodRatio, foliageRatio, level0Error) {
  await MeshoptSimplifier.ready;
  const prims = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((prim) => [mesh, prim]));
  const cards = prims.filter(([, prim]) => isFoliage(prim)).reduce((total, [, prim]) => total + cardsOf(prim).length, 0);
  const keep = Math.min(1, Math.max(level.cards ?? 1, MIN_CARDS / Math.max(cards, 1)));
  const grow = keep < 1 ? Math.min(1 / Math.sqrt(keep), CARD_GROWTH) : 1;
  for (const [mesh, prim] of prims) {
    const foliage = isFoliage(prim);
    if (foliage && (keep < 1 || level.quads)) foliageLevel(doc, mesh, prim, { keep, grow, quads: !!level.quads });
    const ratio = foliage ? foliageRatio : woodRatio;
    // Past level 0, wood and stone may collapse across their uv seams: a
    // scan is cut into dozens of uv islands, every seam is a border the
    // strict simplifier will not cross, and a branch or a boulder stopped
    // at the same thirteen thousand triangles at every distance. Seen from
    // where those levels draw, a stretched texel at a seam is invisible.
    const simplifier = foliage || level.distance === 0 ? MeshoptSimplifier : SEAMLESS;
    if (ratio < 1 && prim.getIndices()?.getCount()) simplifyPrimitive(prim, { simplifier, ratio, error: foliage ? level0Error : level.error });
    if (!prim.getIndices() || prim.getIndices().getCount() === 0) { mesh.removePrimitive(prim); prim.dispose(); }
  }
  await doc.transform(prune());
}
/**
 * The largest texture written, in pixels a side.
 *
 * Not 4096: Basis Universal 2.5 refuses more than 12,582,912 source
 * texels in one encode — a guard against OOM in its 32-bit wasm — and a
 * 4096 square is 16,777,216. The plugin catches that refusal and leaves
 * the image as it found it, so a 4k cap silently wrote PNGs. 3072 is
 * 9,437,184 texels, the largest whole-block size under the ceiling, and
 * three quarters of the source's side rather than half.
 */
const TEXTURE_CAP = 3072;
/**
 * The largest side each kind of model keeps, under the cap. A tree's leaf
 * atlas and a boulder's surface are seen up close and large; a bench, a
 * bin or a tuft of grass covers a few hundred pixels at most. At 3072
 * across the board the lot's eighty models held 2.8 GB of GPU textures
 * (a fence gate alone 75 MB), enough to crash a tab; `textureSize`
 * overrides this per model, for a big prop such as a fort's tower.
 */
export const TEXTURE_SIZE = { tree: 2048, rock: 2048, ground: 1024, prop: 1024 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * What an alpha map actually is, from its own histogram.
 *
 * Poly Haven marks every material that has an alpha map `BLEND`,
 * whether it is a leaf card or a pane of glass. The difference matters
 * to the renderer: a cut-out wants masking, which is cheap, ordered and
 * casts a cut-out shadow, while blending a canopy of overlapping leaf
 * cards accumulates them into a bright haze and casts no shadow at all.
 * The map says which it is. A cut-out is largely *fully* transparent —
 * the card around the leaf — where translucency is graded everywhere
 * and nowhere empty.
 *
 * @returns {'OPAQUE'|'MASK'|'BLEND'}
 */
function classifyAlpha(data) {
  let transparent = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < 16) transparent++;
    else if (data[i] > 239) opaque++;
  }
  // Nothing is even partly transparent: the map says nothing at all.
  if (opaque === data.length) return 'OPAQUE';
  // A fifth of a leaf card is the leaf; the rest is hole.
  if (transparent / data.length >= 0.05) return 'MASK';
  return 'BLEND';
}

/**
 * Poly Haven's glTF textures are JPEGs, so a masked or blended material
 * arrives with an opaque colour map; its cut-out lives in a separate
 * `*_alpha` (or `*_opacity`) PNG the fetcher puts beside the textures.
 * Fold that into the colour's alpha channel, as PNG, for the encoder to
 * carry into KTX2 — and set the alpha mode the map's own histogram
 * calls for, since the source marks cut-outs and glass alike. A map
 * beside a material marked `OPAQUE` is read too: Pine Tree 01 ships its
 * twig cards' cut-out but marks the material opaque, and drew as sheets.
 */
export async function foldAlpha(doc, dir) {
  const materials = doc.getRoot().listMaterials();
  for (const material of materials) {
    const texture = material.getBaseColorTexture();
    if (!texture) continue;
    // A material marked opaque takes an alpha map only when the colour
    // texture is its alone. Where several share one atlas, the map is the
    // marked one's: the street lamp's body, glass and bulb share a texture
    // and its opacity map is the glass's, and the body read it as its own
    // and drew the whole lamp blended.
    // By the image, not the texture object: a source may name one image
    // through two textures (the generator's body and glass do).
    if (material.getAlphaMode() === 'OPAQUE' && materials.some((other) => other !== material && other.getBaseColorTexture()?.getURI() === texture.getURI())) continue;
    const uri = texture.getURI();
    const candidates = ['alpha', 'opacity'].map((kind) => resolve(dir, uri.replace(/_diff(_\dk)\.\w+$/, `_${kind}$1.png`)));
    const alphaPath = candidates.find((path) => existsSync(path));
    if (!alphaPath) {
      if (material.getAlphaMode() !== 'OPAQUE') console.warn(`${material.getName()}: ${material.getAlphaMode()} but no alpha map beside ${uri}; it will draw opaque`);
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
    // What the map is, not what the source claimed.
    const mode = classifyAlpha(alpha.data);
    if (mode !== material.getAlphaMode()) {
      console.log(`${material.getName()}: ${material.getAlphaMode()} -> ${mode} (from its alpha map)`);
      material.setAlphaMode(mode);
    }
    if (mode === 'MASK') material.setAlphaCutoff(0.5);
    // An opaque map carries nothing worth a fourth channel.
    if (mode === 'OPAQUE') continue;
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, c = 0, a = 0; i < rgba.length; i += 4, c += 3, a++) {
      rgba[i] = colour.data[c]; rgba[i + 1] = colour.data[c + 1]; rgba[i + 2] = colour.data[c + 2]; rgba[i + 3] = alpha.data[a];
    }
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
    texture.setImage(png).setMimeType('image/png').setURI(uri.replace(/\.\w+$/, '.png'));
  }
}
/** Material extensions the renderer reads: the reflectance, from the factors only. */
const READ_MATERIAL_EXTENSIONS = new Set(['KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_clearcoat']);

/**
 * Material data the renderer never reads goes. Specular and clearcoat
 * textures go (the renderer reads `KHR_materials_specular` as one
 * reflectance and `KHR_materials_clearcoat` as a strength and roughness,
 * from their factors), and so does every other material extension with
 * its maps: transmission, volume, sheen. They are bytes that draw
 * nothing, and no encode pass covers their slots, so they would ship as
 * PNG — Poly Haven's generator carries a specular map and its compost
 * bags a transmission map.
 */
function dropUnreadMaterialData(doc) {
  const dropped = new Set();
  for (const material of doc.getRoot().listMaterials()) {
    for (const extension of material.listExtensions()) {
      const name = extension.extensionName;
      if (name === 'KHR_materials_specular') extension.setSpecularTexture(null).setSpecularColorTexture(null);
      else if (name === 'KHR_materials_clearcoat') extension.setClearcoatTexture(null).setClearcoatRoughnessTexture(null).setClearcoatNormalTexture(null);
      else if (!READ_MATERIAL_EXTENSIONS.has(name)) { material.setExtension(name, null); dropped.add(name); }
    }
  }
  for (const extension of doc.getRoot().listExtensionsUsed()) if (dropped.has(extension.extensionName)) extension.dispose();
}
const triangles = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

/**
 * Cut one piece out of a kit.
 *
 * A modular source (a fence kit, a set of poles, a fort) lays its parts
 * out side by side for display, so placing the whole file puts a gate,
 * two corners and a loose bracket wherever a fence panel was wanted.
 * `keep` names the root nodes that make one piece (strings, or regular
 * expressions against the node name); the rest are dropped, and what is
 * left is moved so the piece stands on its origin — the ground at y 0,
 * centred in x and z — which is where a scene expects a prop to stand.
 */
function cutPiece(doc, keep, id) {
  const scene = doc.getRoot().listScenes()[0];
  const matches = (name) => keep.some((k) => (k instanceof RegExp ? k.test(name) : k === name));
  const kept = [];
  for (const node of scene.listChildren()) {
    if (matches(node.getName())) kept.push(node);
    else { scene.removeChild(node); node.dispose(); }
  }
  if (!kept.length) throw new Error(`${id}: no root node matches ${keep.map(String).join(', ')}`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of kept) {
    const b = getBounds(node);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  }
  const shift = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  for (const node of kept) {
    const t = node.getTranslation();
    node.setTranslation([t[0] + shift[0], t[1] + shift[1], t[2] + shift[2]]);
  }
}

export async function compileModel({ source, to, kind = 'prop', label, name, authors = [], keep = null, textureSize = null }) {
  const side = Math.min(TEXTURE_CAP, textureSize ?? TEXTURE_SIZE[kind] ?? TEXTURE_SIZE.prop);
  const id = label ?? source;
  if (!existsSync(source)) throw new Error(`${id}: no source at ${source}`);
  const started = performance.now();
  const base = await io.read(source);
  if (keep) cutPiece(base, keep, id);
  dropUnreadMaterialData(base);
  await foldAlpha(base, dirname(source));
  await base.transform(dedup(), weld());
  const sourceTriangles = triangles(base);
  const budget = BUDGET[kind] ?? BUDGET.prop;

  // Level 0 from the welded source, cut to its budget; every level after
  // from level 0 (see `reduceLevel`). The levels are folded into one
  // document as they are made — level 0's scene, then each level's roots
  // under a node named for it.
  const lodInfo = [];
  const level0 = Math.min(sourceTriangles, budget);
  let out = null;
  let scene = null;
  const wrap = (children, name) => {
    const node = out.createNode(name);
    for (const child of children) node.addChild(child);
    scene.addChild(node);
  };
  // The model's bounding sphere, which the renderer switches levels on.
  const bounds = getBounds(base.getRoot().listScenes()[0]);
  const radius = Math.hypot(...bounds.max.map((v, k) => v - bounds.min[k])) / 2;
  const levels = LEVELS[kind] ?? LEVELS.prop;
  let level0Doc = null;
  for (const [i, level] of levels.entries()) {
    const doc = cloneDocument(i === 0 ? base : level0Doc);
    if (i === 0) await reduceLevel(doc, level, level0 / sourceTriangles, level0 / sourceTriangles, level.error);
    else await reduceLevel(doc, level, level.ratio, 1, levels[0].error);
    if (i === 0) level0Doc = cloneDocument(doc);
    const count = Math.round(triangles(doc));
    // A level that saved little over the one before is not a level: skip it,
    // and the next, further out, may still save something.
    if (i > 0 && count >= lodInfo[lodInfo.length - 1].triangles * 0.8) continue;
    lodInfo.push({ triangles: count, coverage: i === 0 ? 0 : radius / (level.distance * REFERENCE_TAN) });
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
    wrap(children, `LOD${lodInfo.length - 1}`);
  }
  // The textures and materials the copies share, folded back together.
  // The resize runs as lossless PNG; the KTX2 encode is the lossy step.
  await out.transform(
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'png', resize: [side, side] }),
    roundToBlock(),
    // On a pool of threads: see ktx2Pool.mjs for the settings by slot.
    ktx2Parallel(),
    prune(),
    // The merged levels each brought a buffer; a .glb holds one.
    unpartition()
  );
  assertEncoded(out, id);
  // A tree's and ground cover's cut-outs are foliage, which the renderer
  // keeps from thinning with distance; a kit's chain-link is not.
  if (kind === 'tree' || kind === 'ground') {
    for (const material of out.getRoot().listMaterials()) {
      if (material.getAlphaMode() === 'MASK') material.setExtras({ ...material.getExtras(), m2d: { ...material.getExtras()?.m2d, foliage: true } });
    }
  }
  out.getRoot().getAsset().extras = {
    ...out.getRoot().getAsset().extras,
    m2d: { source: label ?? null, name: name ?? null, authors, sourceTriangles, lods: lodInfo, ...(keep && { piece: keep.map(String) }) }
  };
  const glb = await io.writeBinary(out);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, glb);
  return { id, to, bytes: glb.byteLength, sourceTriangles, lods: lodInfo, seconds: (performance.now() - started) / 1000 };
}
