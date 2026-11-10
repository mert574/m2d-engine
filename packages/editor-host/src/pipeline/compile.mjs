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
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, mergeDocuments, dedup, weld, simplify, prune, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';

/** Kinds of model, by their triangle budget. */
export const KIND_NAMES = ['tree', 'ground', 'rock', 'prop'];

/** The KTX2 encoder runs in Node, where it needs its images decoded for it. */
const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

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
 * `ktx2()` catches its own failures and logs a warning, leaving the
 * source image on the texture — so a build can report success and ship
 * exactly what KTX2 was meant to replace. This turns that into the
 * error it is, naming what was left behind.
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
 * calls for, since the source marks cut-outs and glass alike.
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
const triangles = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

export async function compileModel({ source, to, kind = 'prop', label, name, authors = [] }) {
  const id = label ?? source;
  if (!existsSync(source)) throw new Error(`${id}: no source at ${source}`);
  const started = performance.now();
  const base = await io.read(source);
  await foldAlpha(base, dirname(source));
  await base.transform(dedup(), weld());
  const sourceTriangles = triangles(base);
  const budget = BUDGET[kind] ?? BUDGET.prop;

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
  // The resize runs as lossless PNG; the KTX2 encode is the lossy step.
  await out.transform(
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'png', resize: [TEXTURE_CAP, TEXTURE_CAP] }),
    roundToBlock(),
    // UASTC's quality level is its encoder effort, and it is the whole
    // cost of a build: on a 3072 normal map the default (2) takes 46 s,
    // level 1 takes 13 s and level 0 takes 3 s, for the same bytes out
    // and a difference in error well under what a block format already
    // costs. Normals get level 1, since a normal map shows banding first;
    // roughness and occlusion, which the eye never sees directly, level 0.
    ktx2({ slots: /normalTexture/, imageDecoder, generateMipmap: true, isUASTC: true, uastcLDRQualityLevel: 1, needSupercompression: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }),
    ktx2({ slots: /metallicRoughnessTexture|occlusionTexture/, imageDecoder, generateMipmap: true, isUASTC: true, uastcLDRQualityLevel: 0, needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }),
    ktx2({ slots: /baseColorTexture|emissiveTexture/, imageDecoder, generateMipmap: true, isUASTC: false, qualityLevel: 192, isPerceptual: true, isSetKTX2SRGBTransferFunc: true }),
    prune(),
    // The merged levels each brought a buffer; a .glb holds one.
    unpartition()
  );
  assertEncoded(out, id);
  out.getRoot().getAsset().extras = {
    ...out.getRoot().getAsset().extras,
    m2d: { source: label ?? null, name: name ?? null, authors, sourceTriangles, lods: lodInfo }
  };
  const glb = await io.writeBinary(out);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, glb);
  return { id, to, bytes: glb.byteLength, sourceTriangles, lods: lodInfo, seconds: (performance.now() - started) / 1000 };
}
