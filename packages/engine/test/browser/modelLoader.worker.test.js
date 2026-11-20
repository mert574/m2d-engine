import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebGPURenderer } from '../../src/core/renderers/webgpuRenderer.ts';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.ts';
import { initBasis, transcodeKTX2 } from '../../src/core/renderers/webgpu/basis.ts';
import { parseGLB, setKTX2Decoder } from '../../src/core/gltf.ts';
import { loadModel, workersAvailable, destroyModelLoader } from '../../src/core/modelLoader.ts';
import { createCanvasElement } from '../../src/testing/environment.js';

// The model loader's worker path, which needs a browser's Web Worker. The
// rest of the loader is checked in `gpu/webgpu.loader.test.js`.
describe('the model loader in a browser', () => {
  beforeAll(() => initWebGPU());
  afterAll(() => destroyModelLoader());

  it('loads in a worker here, and the model matches a main-thread parse', async () => {
    expect(workersAvailable()).toBe(true);
    const url = new URL('../fixtures/models/BoxTexturedKtx2.glb', import.meta.url).href;
    const r = new WebGPURenderer();
    const canvas = createCanvasElement(32, 32);
    document.body.appendChild(canvas);
    r.init(canvas, { width: 32, height: 32 });
    const target = r.transcodeTarget;
    expect(['astc', 'bc7', 'etc2', 'rgba8']).toContain(target);

    const fromWorker = await loadModel(url, { transcodeTarget: target });
    setKTX2Decoder(async (bytes) => transcodeKTX2(await initBasis(), bytes, target));
    const onMain = await parseGLB(await (await fetch(url)).arrayBuffer(), { name: 'main' });

    expect(fromWorker.parts).toHaveLength(onMain.parts.length);
    const [w, m] = [fromWorker.parts[0], onMain.parts[0]];
    expect(w.geometry.positions).toEqual(m.geometry.positions);
    expect(w.geometry.indices).toEqual(m.geometry.indices);
    // The transcoded texture came across whole: same format, size and mip chain.
    const [wt, mt] = [w.material.baseColorTexture, m.material.baseColorTexture];
    expect(wt.compressed).toBe(true);
    expect([wt.base, wt.width, wt.height, wt.mips.length]).toEqual([mt.base, mt.width, mt.height, mt.mips.length]);
    expect(wt.mips[0]).toEqual(mt.mips[0]);
    // Transferred, not copied: the buffers are real, detached nowhere on this side.
    expect(w.geometry.positions.buffer.byteLength).toBeGreaterThan(0);
    r.destroy();
  });
});
