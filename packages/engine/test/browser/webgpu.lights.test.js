import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPURenderer } from '../../src/core/renderers/webgpuRenderer.js';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { box, plane } from '../../src/core/renderers/geometry/primitives.js';
import { createCanvasElement } from '../helpers/environment.js';

describe('light vs camera orientation', () => {
  beforeAll(() => initWebGPU());
  it('a lamp behind the camera still lights the floor in front', async () => {
    const W = 96, H = 72;
    const canvas = createCanvasElement(W, H);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);
    const r = new WebGPURenderer();
    r.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: false, film: false };
    r.init(canvas, { width: W, height: H });

    const shoot = async (lookAtX, shadow) => {
      const camera = new Camera3D(W, H, { mode: 'free', position: { x: 0, y: 2, z: 0 }, lookAt: { x: lookAtX, y: 0.5, z: 0 } });
      camera.update(0);
      const f = r.createFrame();
      f.setCamera(camera);
      f.sun = { direction: [0.3, -1, 0.2], color: [1, 1, 1], intensity: 0.2 };
      f.ambient.intensity = 0.15;
      f.fog.density = 0; f.bloom.intensity = 0;
      f.shadow.enabled = true;
      f.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 40, y: 1, z: 40 }, color: [0.5, 0.5, 0.5], roughness: 0.9 });
      // The lamp sits 2 m toward -x; range covers the whole area.
      f.addLight({ position: { x: -2, y: 2, z: 0 }, color: [1, 0.8, 0.5], intensity: 50, range: 16, shadow });
      r.render(f);
      const img = await r.readPixels();
      // Sample the floor ~4 m ahead of the camera along the look direction.
      const p = camera.worldToScreen(Math.sign(lookAtX) * 4, 0, 0);
      const i = (Math.round(p.y) * img.width + Math.round(p.x)) * 4;
      const px = [...img.data.slice(i, i + 4)];
      return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
    };

    for (const shadow of [false, true]) {
      const facing = await shoot(-10, shadow);   // looking at the lamp
      const away = await shoot(10, shadow);      // lamp behind the camera
      console.log(`shadow=${shadow}: floor luma facing ${facing.toFixed(1)}, facing away ${away.toFixed(1)}`);
      expect(away, `floor still lit with the lamp behind the camera (shadow=${shadow})`).toBeGreaterThan(facing * 0.45);
    }
    r.destroy();
  });
});
