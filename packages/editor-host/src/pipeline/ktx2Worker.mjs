/**
 * One KTX2 encoder on a thread of its own, for `ktx2Pool.mjs`.
 *
 * Basis Universal's WebAssembly build is single-threaded and blocks while
 * it encodes, so a model's textures sharing one module encode one after
 * another however they are awaited. Each worker owns a module: N workers,
 * N textures at once.
 */
import { parentPort } from 'node:worker_threads';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

/** The encoder runs in Node, where it needs its images decoded for it. */
const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

parentPort.on('message', async ({ id, image, options }) => {
  try {
    const out = await encodeToKTX2(image, { ...options, imageDecoder });
    parentPort.postMessage({ id, out }, [out.buffer]);
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message ?? String(error) });
  }
});
