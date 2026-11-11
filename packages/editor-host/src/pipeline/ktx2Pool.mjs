/**
 * Encodes a document's textures to KTX2 on a pool of worker threads.
 *
 * This replaces three passes of `ktx2-encoder`'s glTF-Transform plugin.
 * The plugin starts every texture at once but hands them all to one
 * WebAssembly encoder, which is single-threaded and blocks, so they ran
 * one after another: on a tree, 47 of a 51-second compile was nine
 * textures encoded in a row on one core. Here each worker owns an
 * encoder and the textures spread across them.
 *
 * The settings by slot are the plugin passes' own, in the order those
 * passes claimed a texture: a normal map first, then roughness and
 * occlusion, then colour.
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';

/**
 * How a texture in each slot is encoded. UASTC's quality level is its
 * encoder effort: on a 3072 normal map level 2 takes 46 s, level 1 13 s
 * and level 0 3 s, for the same bytes and an error under what a block
 * format already costs. Normals get level 1, since a normal map shows
 * banding first; roughness and occlusion, never seen directly, level 0;
 * colour is ETC1S, whose quality 192 is where its artefacts stop showing
 * on photographed surfaces.
 */
const SLOT_OPTIONS = [
  [/normalTexture/, { generateMipmap: true, isUASTC: true, uastcLDRQualityLevel: 1, needSupercompression: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }],
  [/metallicRoughnessTexture|occlusionTexture/, { generateMipmap: true, isUASTC: true, uastcLDRQualityLevel: 0, needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }],
  [/baseColorTexture|emissiveTexture/, { generateMipmap: true, isUASTC: false, qualityLevel: 192, isPerceptual: true, isSetKTX2SRGBTransferFunc: true }]
];

/**
 * Encoder threads per compile. One per core by default; `buildModels.mjs`,
 * which runs several compiles at once, divides the cores between them
 * through `M2D_ENCODE_THREADS` so the machine is not oversubscribed.
 */
export function encodeThreads() {
  const set = Number(process.env.M2D_ENCODE_THREADS);
  return Math.max(1, Number.isFinite(set) && set > 0 ? set : availableParallelism());
}

const slotsOf = (texture) => {
  const root = Document.fromGraph(texture.getGraph()).getRoot();
  return texture.getGraph().listParentEdges(texture).filter((edge) => edge.getParent() !== root).map((edge) => edge.getName());
};

/** A glTF-Transform transform: every PNG, JPEG or WebP texture in a known slot becomes KTX2. */
export function ktx2Parallel({ threads = encodeThreads() } = {}) {
  const transform = async (document) => {
    const jobs = [];
    for (const texture of document.getRoot().listTextures()) {
      if (!/^image\/(png|jpeg|webp)$/.test(texture.getMimeType())) continue;
      const slots = slotsOf(texture);
      const options = SLOT_OPTIONS.find(([slot]) => slots.some((name) => slot.test(name)))?.[1];
      if (options && texture.getImage()) jobs.push({ texture, options });
    }
    if (!jobs.length) return;
    // Largest first, so the long encodes start at once and the small ones fill in.
    jobs.sort((a, b) => b.texture.getImage().byteLength - a.texture.getImage().byteLength);
    const workers = Array.from({ length: Math.min(threads, jobs.length) }, () => new Worker(new URL('./ktx2Worker.mjs', import.meta.url)));
    try {
      let next = 0;
      await Promise.all(workers.map(async (worker) => {
        while (next < jobs.length) {
          const job = jobs[next++];
          const image = job.texture.getImage();
          const out = await new Promise((resolve, reject) => {
            const done = ({ out, error }) => { worker.off('error', fail); error ? reject(new Error(error)) : resolve(out); };
            const fail = (error) => { worker.off('message', done); reject(error); };
            worker.once('message', done);
            worker.once('error', fail);
            worker.postMessage({ id: next, image, options: job.options });
          });
          job.texture.setImage(out).setMimeType('image/ktx2');
        }
      }));
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
    }
    document.createExtension(KHRTextureBasisu).setRequired(true);
  };
  Object.defineProperty(transform, 'name', { value: 'ktx2Parallel' });
  return transform;
}
