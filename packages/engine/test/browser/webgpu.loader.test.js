import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebGPURenderer } from '../../src/core/renderers/webgpuRenderer.js';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.js';
import { initBasis, transcodeKTX2 } from '../../src/core/renderers/webgpu/basis.js';
import { parseGLB, setKTX2Decoder } from '../../src/core/gltf.js';
import { loadModel, workersAvailable, destroyModelLoader } from '../../src/core/modelLoader.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { createCanvasElement } from '../helpers/environment.js';

// Streaming loads models mid-game, and a parse plus a KTX2 transcode on
// the main thread is a dropped frame per model. `modelLoader` does it in a
// worker and transfers the result back; this checks the result is the
// same model the main thread would have made, that it draws, and that
// the worker path is what a browser actually gets.
describe('the model loader', () => {
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

  it('brings an image texture across as a bitmap, and the model draws', async () => {
    const url = new URL('../fixtures/models/BoxTextured.glb', import.meta.url).href;
    const model = await loadModel(url, { transcodeTarget: 'rgba8' });
    expect(model.parts[0].material.baseColorTexture).toBeInstanceOf(ImageBitmap);

    const W = 64, H = 64;
    const canvas = createCanvasElement(W, H);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);
    const r = new WebGPURenderer();
    r.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: false, film: false };
    r.init(canvas, { width: W, height: H });
    const camera = new Camera3D(W, H, { mode: 'free', position: { x: 0, y: 1, z: 3 }, lookAt: { x: 0, y: 0, z: 0 } });
    camera.update(0);
    const f = r.createFrame();
    f.setCamera(camera);
    f.sun = { direction: [0.3, -1, 0.2], color: [1, 1, 1], intensity: 3 };
    f.fog.density = 0; f.bloom.intensity = 0; f.shadow.enabled = false;
    for (const part of model.parts) f.add(part.geometry, { model: part.matrix, material: part.material });
    r.render(f);
    const img = await r.readPixels();
    let lit = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 40) lit++;
    expect(lit, 'the worker-loaded box is on screen').toBeGreaterThan(50);
    r.destroy();
  });

  it('reports a missing file as the error it is', async () => {
    const url = new URL('../fixtures/models/NoSuchModel.glb', import.meta.url).href;
    await expect(loadModel(url, { transcodeTarget: 'rgba8' })).rejects.toThrow(/404/);
  });
});
