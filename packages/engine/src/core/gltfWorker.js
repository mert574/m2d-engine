/**
 * The model loader's worker: fetch a `.glb`, parse it, transcode its KTX2
 * textures, and hand the finished model back.
 *
 * Everything `loadGLB` does is CPU work the main thread can feel —
 * reading accessors, making tangents, and above all transcoding a
 * 3072-square UASTC texture to the GPU's block format in wasm, which is
 * tens of milliseconds a texture and a model carries nine. On the main
 * thread that is a dropped frame per model as the level streams in; here
 * it is nothing the frame loop sees. The result crosses back by
 * structured clone with every buffer and bitmap *transferred*, not
 * copied, so the handover is a few object headers. See `modelLoader.js`.
 *
 * One worker transcodes for one target: the first message's `target`
 * sets the decoder, and the loader keeps a pool per target.
 */
import { parseGLB, setKTX2Decoder } from './gltf.js';
import { initBasis, transcodeKTX2 } from './renderers/webgpu/basis.js';
import { transferablesOf } from './modelLoader.js';

let decoderFor = null;

self.onmessage = async ({ data: { id, url, target } }) => {
  try {
    if (decoderFor !== target) {
      decoderFor = target;
      setKTX2Decoder(async (bytes) => transcodeKTX2(await initBasis(), bytes, target));
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`M2D: could not fetch model ${url} (${response.status})`);
    const model = await parseGLB(await response.arrayBuffer(), { name: url });
    self.postMessage({ id, model }, [...transferablesOf(model)]);
  } catch (error) {
    self.postMessage({ id, error: error?.message ?? String(error) });
  }
};
