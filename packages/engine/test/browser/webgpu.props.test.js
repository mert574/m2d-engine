import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPURenderer } from '../../src/core/renderers/webgpuRenderer.js';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { plane, box } from '../../src/core/renderers/geometry/primitives.js';
import { M2D } from '../../src/core/m2d.js';
import { Entity } from '../../src/core/entity.js';
import { SceneLoader, SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { createCanvasElement } from '../helpers/environment.js';

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// The lot's street lamps, end to end: a prop prefab whose mesh is a
// glowing shell around its own point light, built by the scene into
// resident batches and prop lights, drawn with the light casting a
// shadow cube. Two things went wrong here once, and neither showed in
// a frame built by hand: the shell cast — the prop ignored the prefab's
// `castShadow: false` — and put everything the lamp reached in its
// cube's shadow; and the light's CSS colour went to the frame as a
// string, which packs as NaN. Either leaves the floor under the lamp
// dark, so that is what this checks, beside a crate that proves the
// cube is live.
describe('a prop lantern', () => {
  beforeAll(async () => { await initPhysics({ dimensions: 3 }); await initWebGPU(); });
  class Ground extends Entity { name = 'Ground'; }

  it('lights the floor under it, its shell casting nothing while its cube still works', async () => {
    const W = 128, H = 96;
    const canvas = createCanvasElement(W, H);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);
    const r = new WebGPURenderer();
    r.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: false, film: false };
    r.init(canvas, { width: W, height: H });
    r.setShadowQuality('high');

    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 1 });
    game.registerActor('Ground', Ground);
    const config = new SceneLoader(game).load({
      version: SCENE_VERSION, type: 'level', name: 'lot', world: { dimensions: 3 },
      prefabs: {
        lantern: {
          actor: 'Ground',
          mesh: { shape: 'sphere', color: '#ffd9a0', emissive: 7, roughness: 1, castShadow: false },
          light: { type: 'point', color: '#ffc473', intensity: 70, range: 24 }
        },
        crate: { actor: 'Ground', mesh: { color: '#b86a2a', roughness: 0.8 } }
      },
      layers: [{
        name: 'main', objects: [],
        props: [
          { id: 'lanterns', prefab: 'lantern', width: 0.22, height: 0.22, collider: 'none', instances: [[0, 3, 0, 0, 1]] },
          { id: 'crates', prefab: 'crate', width: 1, height: 1, depth: 1, collider: 'none', instances: [[1.5, 0.5, 0, 0, 1]] }
        ]
      }]
    });
    // A displayed game's scene: the batches are built, as the lot's are.
    const { Scene } = await import('../../src/core/scene.js');
    const scene = new Scene({ headless: false, physics: { dimensions: 3 } }, config);
    scene.setupProps();
    expect(scene.batches).toHaveLength(2);
    expect(scene.propLights).toHaveLength(1);

    const camera = new Camera3D(W, H, { mode: 'free', position: { x: 0, y: 4, z: 7 }, lookAt: { x: 0.5, y: 0, z: 0 } });
    camera.update(0);
    const frame = () => {
      const f = r.createFrame();
      f.setCamera(camera);
      // Night: no sun, a trace of ambient, so the lamp is what lights the floor.
      f.sun = { direction: [0.3, -1, 0.2], color: [1, 1, 1], intensity: 0 };
      f.ambient.intensity = 0.02;
      f.fog.density = 0; f.bloom.intensity = 0;
      f.shadow.enabled = true;
      f.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 40, y: 1, z: 40 }, color: [0.5, 0.5, 0.5], roughness: 0.9 });
      for (const batch of scene.batches) f.addBatch(batch);
      for (const light of scene.propLights) f.addLight(light);
      return f;
    };
    // Two frames: the cube is drawn on the first and read on both.
    r.render(frame());
    r.render(frame());
    const img = await r.readPixels();
    const at = (x, y, z) => {
      const p = camera.worldToScreen(x, y, z);
      const i = (Math.round(p.y) * img.width + Math.round(p.x)) * 4;
      return [...img.data.slice(i, i + 4)];
    };
    // The floor beside the lamp, away from the crate; the floor in the
    // crate's shadow, on the far side from the light; the shell itself.
    const lit = at(-1.5, 0, 1);
    const shadowed = at(2.6, 0, 0);
    const shell = at(0, 3, 0.11);
    console.log(`lantern: lit floor ${lit}, shadowed floor ${shadowed}, shell ${shell}`);
    for (const px of [lit, shadowed, shell]) for (const c of px) expect(Number.isFinite(c) && c >= 0).toBe(true);
    expect(luma(lit), `the floor under the lamp is lit: ${lit}`).toBeGreaterThan(60);
    // Warm, as the lamp's colour says: red over blue.
    expect(lit[0]).toBeGreaterThan(lit[2] * 1.3);
    expect(luma(shadowed), `the crate's shadow is cast through the cube: ${shadowed}`).toBeLessThan(luma(lit) * 0.5);
    expect(luma(shell), `the shell glows: ${shell}`).toBeGreaterThan(150);
    r.destroy();
  });

  it('gives a model\'s GPU memory back on unload, and draws it again after', async () => {
    const W = 64, H = 64;
    const canvas = createCanvasElement(W, H);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);
    const r = new WebGPURenderer();
    r.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: false, film: false };
    r.init(canvas, { width: W, height: H });

    // A model shaped like `gltf.js` makes them: one part, one material,
    // one texture. Streaming has to be able to let all of it go.
    const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(64 * 64 * 4).fill(200), 64, 64));
    // `gltf.js` puts the decoded image straight on the slot.
    const material = { name: 'crate', baseColorTexture: bitmap };
    const geometry = box();
    const model = { parts: [{ geometry, material, matrix: null }], lods: [] };

    const camera = new Camera3D(W, H, { mode: 'free', position: { x: 0, y: 1, z: 3 }, lookAt: { x: 0, y: 0, z: 0 } });
    camera.update(0);
    const draw = () => {
      const f = r.createFrame();
      f.setCamera(camera);
      f.sun = { direction: [0.3, -1, 0.2], color: [1, 1, 1], intensity: 3 };
      f.fog.density = 0; f.bloom.intensity = 0; f.shadow.enabled = false;
      f.add(geometry, { position: { x: 0, y: 0, z: 0 }, material });
      r.render(f);
    };
    const litPixels = async () => {
      const img = await r.readPixels();
      let lit = 0;
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 40) lit++;
      return lit;
    };

    draw();
    const before = await litPixels();
    expect(before, 'the crate is on screen to begin with').toBeGreaterThan(50);
    expect(r.textureBytes, 'its texture is counted as resident').toBeGreaterThan(0);

    const freed = r.unloadModel(model);
    expect(freed, 'unloading hands the texture bytes back').toBeGreaterThan(0);
    expect(r.textureBytes).toBe(0);

    // And the caches rebuild from the CPU data, so the very next frame
    // draws the same picture: letting go costs an upload, never the image.
    draw();
    const after = await litPixels();
    expect(Math.abs(after - before), `redrawn after unload: ${before} then ${after}`).toBeLessThanOrEqual(2);
    expect(r.textureBytes).toBeGreaterThan(0);
    r.destroy();
  });
});
