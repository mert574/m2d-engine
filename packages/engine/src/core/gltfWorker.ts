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
 * copied, so the handover is a few object headers. See `modelLoader.ts`.
 *
 * One worker transcodes for one target: the first message's `target`
 * sets the decoder, and the loader keeps a pool per target.
 */
import { parseGLB, setKTX2Decoder } from './gltf.ts';
import { initBasis, transcodeKTX2 } from './renderers/webgpu/basis.ts';
import type { TranscodeTarget } from './renderers/webgpu/basis.ts';
import { transferablesOf } from './modelLoader.ts';

/** What `modelLoader.ts` posts: one job per message. */
interface WorkerJob {
  id: number;
  url: string;
  target: TranscodeTarget;
}

/** The engine's `lib` is the DOM's, where `self` is a window; this is the worker scope it runs in. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerJob>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

let decoderFor: TranscodeTarget | null = null;

scope.onmessage = async ({ data: { id, url, target } }) => {
  try {
    if (decoderFor !== target) {
      decoderFor = target;
      setKTX2Decoder(async (bytes) => transcodeKTX2(await initBasis(), bytes, target));
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`M2D: could not fetch model ${url} (${response.status})`);
    const model = await parseGLB(await response.arrayBuffer(), { name: url });
    scope.postMessage({ id, model }, [...transferablesOf(model)]);
  } catch (error) {
    scope.postMessage({ id, error: (error as { message?: string } | null)?.message ?? String(error) });
  }
};
