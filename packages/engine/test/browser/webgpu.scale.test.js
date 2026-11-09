import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPURenderer } from '../../src/core/renderers/webgpuRenderer.js';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { box, plane, sphere } from '../../src/core/renderers/geometry/primitives.js';
import { StaticBatch } from '../../src/core/renderers/frame3d.js';
import { createCanvasElement } from '../helpers/environment.js';

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// A frame at the lot's scale — hundreds of resident instances, nearly a
// thousand lights, the whole post stack — because the bugs this size
// finds (cluster overflow, buffers grown mid-encode) never show in a
// scene with one box and one lamp.
describe('a lot-sized frame', () => {
  beforeAll(() => initWebGPU());
  it('stays lit in the afternoon with hundreds of lamps around', async () => {
    const W = 128, H = 96;
    const canvas = createCanvasElement(W, H);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);
    const r = new WebGPURenderer();
    r.effects = { taa: true, ao: true, dof: true, motionBlur: true, autoExposure: true, bloom: true, film: true };
    r.init(canvas, { width: W, height: H });
    r.setShadowQuality('high');

    // The lot in miniature: crate batches on a grid, lamp lights at
    // 13 m spacing over a 390 m square, the camera standing in one lot.
    const crates = new StaticBatch(box(), null);
    for (let i = 0; i < 400; i++) {
      crates.push({ position: { x: (i % 20) * 19 - 190, y: 0.5, z: Math.floor(i / 20) * 19 - 190 }, color: [0.6, 0.5, 0.4] });
    }
    const camera = new Camera3D(W, H, { mode: 'free', position: { x: 2, y: 2.5, z: 8 }, lookAt: { x: 0, y: 0.5, z: 0 } });
    camera.update(0);

    const draw = async (dusk) => {
      const f = r.createFrame();
      f.setCamera(camera);
      f.sun = dusk
        ? { direction: [0.55, -0.06, 0.45], color: [1, 0.4, 0.15], intensity: 0.5 }
        : { direction: [0.55, -0.6, 0.45], color: [1, 0.88, 0.7], intensity: 4.2 };
      f.ambient = dusk
        ? { sky: [0.1, 0.08, 0.22], ground: [0.04, 0.03, 0.05], intensity: 0.3 }
        : { sky: [0.36, 0.46, 0.68], ground: [0.22, 0.17, 0.12], intensity: 0.55 };
      f.fog = { color: dusk ? [0.3, 0.18, 0.3] : [0.66, 0.74, 0.86], density: dusk ? 0.009 : 0.006 };
      f.exposure = dusk ? 1.4 : 0.95;
      f.bloom = { threshold: dusk ? 0.8 : 1.1, intensity: dusk ? 1.1 : 0.7, scatter: 0.75 };
      f.shadow.distance = 70;
      f.shadow.enabled = true;
      f.post.autoExposure = { enabled: true, key: dusk ? 0.12 : 0.2, min: 0.5, max: 3, speed: 1e6 };
      f.post.dof = { focus: 8, focalLength: 35, fStop: 6, maxBlur: 12 };
      f.post.vignette = 0.3;
      f.post.grain = 0.025;
      f.post.grade = { saturation: 1.05, contrast: 1.03, temperature: 0.05, lut: null };
      f.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 400, y: 1, z: 400 }, color: [0.5, 0.5, 0.5], roughness: 0.9 });
      f.add(box(), { position: { x: 0, y: 0.5, z: 0 }, color: [0.8, 0.2, 0.2] });
      f.addBatch(crates);
      for (let gx = -15; gx <= 15; gx++) {
        for (let gz = -15; gz <= 15; gz++) {
          f.addLight({ position: { x: gx * 13, y: 3.3, z: gz * 13 }, color: [1, 0.77, 0.45], intensity: 70, range: 24 });
        }
      }
      // Settle auto exposure over a few frames, like a player standing still.
      for (let i = 0; i < 12; i++) r.render(f);
      const img = await r.readPixels();
      const at = (x, y, z) => {
        const p = camera.worldToScreen(x, y, z);
        const i2 = (Math.round(p.y) * img.width + Math.round(p.x)) * 4;
        return [...img.data.slice(i2, i2 + 4)];
      };
      return { floor: at(2, 0, 4), cube: at(0, 0.7, 0.55), shadowSide: at(-1.2, 0, -1.2) };
    };

    const day = await draw(false);
    console.log('afternoon:', JSON.stringify(day));
    expect(luma(day.floor), `afternoon floor is lit: ${day.floor}`).toBeGreaterThan(60);
    expect(luma(day.cube), `afternoon cube is lit: ${day.cube}`).toBeGreaterThan(40);

    const dusk = await draw(true);
    console.log('dusk:', JSON.stringify(dusk));
    // Standing a few metres from a lamp at (0, 3.3, 0): its pool lights the floor.
    expect(luma(dusk.floor), `dusk floor catches the lamp: ${dusk.floor}`).toBeGreaterThan(25);
    r.destroy();
  });
});
