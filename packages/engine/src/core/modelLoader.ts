/**
 * Loading models off the main thread.
 *
 * `loadModel(url)` does what `gltf.ts`'s `loadGLB` does — fetch, parse,
 * transcode — but in a web worker, so a level streaming its props in does
 * not stall the frame it streams into. A small pool of workers shares the
 * work (half the cores, at most four: the GPU upload that follows is
 * main-thread anyway, and more workers would only queue there), and each
 * finished model crosses back with its buffers and bitmaps transferred.
 *
 * Where there is no `Worker` — Node, a test, an exotic embedding — or a
 * worker fails to start, this falls back to the main-thread path, so a
 * caller never has to know which it got. The pool is keyed by transcode
 * target, since a worker's KTX2 decoder is set once.
 */
import { loadGLB } from './gltf.ts';
import type { Model } from './gltf.ts';
import type { TranscodeTarget } from './renderers/webgpu/basis.ts';

/** Workers per target: half the cores, one at least, four at most. */
const POOL_SIZE = Math.max(1, Math.min(4, Math.floor((globalThis.navigator?.hardwareConcurrency ?? 4) / 2)));

/** What `gltfWorker.ts` posts back for a job. */
interface WorkerResponse {
  id: number;
  model?: Model;
  error?: string;
}

interface Pool {
  workers: Worker[];
  busy: number[];
  pending: Map<number, { resolve: (model: Model) => void; reject: (error: Error) => void }>;
}

const pools = new Map<string, Pool>();
let nextId = 1;
let workersBroken = false;

/**
 * Every transferable object a model holds: the `ArrayBuffer` under each
 * typed array (once, however many views share it) and each `ImageBitmap`.
 * What `postMessage` is given as its transfer list, so a model crosses
 * threads without a copy.
 */
export function transferablesOf(
  value: unknown, out = new Set<ArrayBuffer | ImageBitmap>(), seen = new Set<object>()
): Set<ArrayBuffer | ImageBitmap> {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) out.add(value.buffer);
    return out;
  }
  if (value instanceof ArrayBuffer) { out.add(value); return out; }
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) { out.add(value); return out; }
  for (const inner of Array.isArray(value) ? value : Object.values(value)) transferablesOf(inner, out, seen);
  return out;
}

/** Whether loads go to a worker here, or straight through `loadGLB`. */
export function workersAvailable(): boolean {
  return !workersBroken && typeof Worker === 'function' && typeof document !== 'undefined';
}

function poolFor(target: string): Pool {
  const existing = pools.get(target);
  if (existing) return existing;
  const pool: Pool = { workers: [], busy: [], pending: new Map() };
  for (let i = 0; i < POOL_SIZE; i++) {
    // The options stay static literals: Vite bundles the worker only
    // when it can read them at build time. The URL names the source file,
    // which bundlers resolve literally; tsc rewrites import specifiers but
    // not `new URL` strings, so the build (copyAssets.ts) rewrites this one
    // to the emitted `.js` in dist.
    const worker = new Worker(new URL('./gltfWorker.ts', import.meta.url), { type: 'module', name: 'm2d model loader' });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const job = pool.pending.get(data.id);
      if (!job) return;
      pool.pending.delete(data.id);
      pool.busy[i]!--;
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.model!);
    };
    worker.onerror = (event) => {
      // A worker that cannot even start (a bundler that did not carry the
      // script, a CSP) fails every job it holds, and the loader stops
      // asking: the main-thread path takes over for good.
      workersBroken = true;
      for (const job of pool.pending.values()) job.reject(new Error(`M2D: model loader worker failed: ${event.message ?? 'unknown error'}`));
      pool.pending.clear();
      event.preventDefault?.();
    };
    pool.workers.push(worker);
    pool.busy.push(0);
  }
  pools.set(target, pool);
  return pool;
}

/**
 * Fetch and parse a `.glb`, off the main thread where possible.
 * @param url - Resolved against the page, as `fetch` would
 * @param options.transcodeTarget - The GPU's block format for KTX2 textures; `renderer.transcodeTarget`
 * @returns A `gltf.ts` model
 */
export async function loadModel(
  url: string, { transcodeTarget = 'rgba8' }: { transcodeTarget?: TranscodeTarget } = {}
): Promise<Model> {
  if (!workersAvailable()) return loadGLB(url);
  // The worker resolves a relative URL against its own script, not the
  // page; make it absolute here, where the page is.
  const absolute = new URL(url, document.baseURI).href;
  const pool = poolFor(transcodeTarget);
  let slot = 0;
  for (let i = 1; i < pool.busy.length; i++) if (pool.busy[i]! < pool.busy[slot]!) slot = i;
  pool.busy[slot]!++;
  const id = nextId++;
  try {
    return await new Promise<Model>((resolve, reject) => {
      pool.pending.set(id, { resolve, reject });
      pool.workers[slot]!.postMessage({ id, url: absolute, target: transcodeTarget });
    });
  } catch (error) {
    if (!workersBroken) throw error;
    // The workers went away under us; the main thread still can.
    return loadGLB(url);
  }
}

/** Stop every worker; a test or a page teardown. */
export function destroyModelLoader(): void {
  for (const pool of pools.values()) for (const worker of pool.workers) worker.terminate();
  pools.clear();
}
