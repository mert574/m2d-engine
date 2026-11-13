import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPURenderer } from '../../src/core/renderers/webgpuRenderer.js';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { box } from '../../src/core/renderers/geometry/primitives.js';
import { createCanvasElement } from '../helpers/environment.js';

// A `mesh.texture` is mapped planar, one tile per `size` metres. On a
// floor or a wall that is mapped from the world, so neighbouring pieces
// tile as one surface. On a body that moves it must be mapped in the
// body's own frame: mapped from the world, a pushed crate slid under a
// texture that stood still, as if the crate were a hole cut onto a
// backdrop (the lot's crates, once).
//
// The box wears a tile that is red on its left half and blue on its
// right, a metre wide. It is drawn twice, half a metre apart, with the
// camera moved along with it, and the same point of its face is read.
describe('planar texturing', () => {
  beforeAll(() => initWebGPU());

  async function faceColour(planarFrame, boxX) {
    const W = 96, H = 96;
    const canvas = createCanvasElement(W, H);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);
    const r = new WebGPURenderer();
    r.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: false, film: false };
    r.init(canvas, { width: W, height: H });

    const tile = new OffscreenCanvas(2, 1);
    const paint = tile.getContext('2d');
    paint.fillStyle = '#ff0000'; paint.fillRect(0, 0, 1, 1);
    paint.fillStyle = '#0000ff'; paint.fillRect(1, 0, 1, 1);
    const material = {
      name: 'tile', baseColor: [1, 1, 1, 1], baseColorTexture: await createImageBitmap(tile),
      normalTexture: null, metallicRoughnessTexture: null, occlusionTexture: null,
      metallic: 0, roughness: 1, normalScale: 1, occlusionStrength: 1, emissive: [0, 0, 0],
      worldScale: 1, planarFrame
    };

    const camera = new Camera3D(W, H, { mode: 'free', position: { x: boxX, y: 0.5, z: 3 }, lookAt: { x: boxX, y: 0.5, z: 0 } });
    camera.update(0);
    const f = r.createFrame();
    f.setCamera(camera);
    f.sun = { direction: [0, 0, -1], color: [1, 1, 1], intensity: 3 };
    f.ambient = { sky: [1, 1, 1], ground: [1, 1, 1], intensity: 0.6 };
    f.add(box(), { position: { x: boxX, y: 0.5, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: [1, 1, 1], material });
    r.render(f);
    const image = await r.readPixels();
    // A quarter of the way across the face from its centre: the middle
    // of one half of the tile in the box's own frame.
    const p = camera.worldToScreen(boxX + 0.25, 0.5, 0.5);
    const i = (Math.round(p.y) * image.width + Math.round(p.x)) * 4;
    r.destroy?.();
    canvas.remove();
    return [...image.data.slice(i, i + 3)];
  }

  const redOverBlue = ([red, , blue]) => red > blue;

  it('rides with a body that moves', async () => {
    const before = await faceColour('own', 0);
    const after = await faceColour('own', 0.5);
    expect(redOverBlue(before), `before ${before}`).toBe(redOverBlue(after));
  });

  it('stands still on a surface mapped from the world', async () => {
    const before = await faceColour('world', 0);
    const after = await faceColour('world', 0.5);
    expect(redOverBlue(before), `before ${before}, after ${after}`).not.toBe(redOverBlue(after));
  });
});
