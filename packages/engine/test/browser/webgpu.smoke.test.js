import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { M2D } from '../../src/core/m2d.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { createRenderer, WebGPURenderer, WebGLRenderer } from '../../src/core/renderers/index.js';
import { initWebGPU, webgpuSupported } from '../../src/core/renderers/webgpu/device.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { box, plane, sphere, geometryFor } from '../../src/core/renderers/geometry/primitives.js';
import { SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { createCanvasElement } from '../helpers/environment.js';

/**
 * The 3D renderer in the test browser: WebGPU works, a shaded scene draws
 * through the engine's frame loop with a sky, a sun, shadows and the HUD
 * on its overlay canvas, and a scene file's `mesh` block reaches the frame.
 *
 * SwiftShader is slow and these frames are small; the assertions are about
 * relationships between pixels (lit brighter than shadowed, sky above the
 * horizon, red where the red box is), not exact values from a software
 * rasterizer. If this fails on `navigator.gpu`, check the WebGPU flags in
 * vitest.browser.config.js.
 */

async function readPixels(renderer) {
  const image = await renderer.readPixels();
  return {
    width: image.width,
    height: image.height,
    at(x, y) {
      const i = (y * image.width + x) * 4;
      return [...image.data.slice(i, i + 4)];
    }
  };
}

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const cleanup = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });

function canvasInDocument(width, height) {
  const canvas = createCanvasElement(width, height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  document.body.appendChild(canvas);
  cleanup.push(() => canvas.remove());
  return canvas;
}

/** A camera above and in front of the origin, looking at it; +z toward the eye. */
function cameraAt(width, height, position = { x: 0, y: 3, z: 8 }) {
  const camera = new Camera3D(width, height, { mode: 'free', position, lookAt: { x: 0, y: 0, z: 0 } });
  camera.update(0);
  return camera;
}

/** A frame: a 20 m floor, a red 1 m cube on it, the sun from high up and behind the camera. */
function yardFrame(renderer, camera, { shadows = true } = {}) {
  const frame = renderer.createFrame();
  frame.camera.viewProjection = camera.viewProjection;
  frame.camera.inverseViewProjection = camera.inverseViewProjection;
  frame.camera.position = camera.position;
  // Light travelling toward -x: the sun is high on the camera's right and
  // the box's shadow lies to its left, in view.
  frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
  frame.fog.density = 0;
  frame.bloom.intensity = 0;
  frame.shadow = { center: { x: 0, y: 0, z: 0 }, radius: 12, enabled: shadows };
  frame.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 20, y: 1, z: 20 }, color: [0.5, 0.5, 0.5], roughness: 0.9 });
  frame.add(box(), { position: { x: 0, y: 0.5, z: 0 }, color: [0.9, 0.05, 0.05], roughness: 0.5 });
  return frame;
}

describe('WebGPU in the test browser', () => {
  it('exposes navigator.gpu and hands out a device', async () => {
    expect(webgpuSupported(), 'navigator.gpu missing: check --enable-unsafe-webgpu in vitest.browser.config.js').toBe(true);
    const device = await initWebGPU();
    expect(device).toBeTruthy();
    expect(await initWebGPU()).toBe(device);
  });

  it('is registered as the webgpu backend and declares three dimensions', () => {
    const renderer = createRenderer('webgpu');
    expect(renderer).toBeInstanceOf(WebGPURenderer);
    expect(renderer.dimensions).toBe(3);
    expect(new WebGLRenderer().dimensions).toBe(2);
  });
});

describe('the 3D renderer', () => {
  beforeAll(() => initWebGPU());

  function make(W, H) {
    const canvas = canvasInDocument(W, H);
    const renderer = new WebGPURenderer();
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    return renderer;
  }

  it('draws a sky above the horizon and a shaded floor below it', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    renderer.render(yardFrame(renderer, camera));
    const pixels = await readPixels(renderer);

    const sky = pixels.at(W / 2, 2);
    const floor = pixels.at(8, H - 4);
    expect(sky[2], `sky is blue: ${sky}`).toBeGreaterThan(sky[0]);
    expect(luma(sky), 'sky is bright').toBeGreaterThan(120);
    // The floor is grey: no channel dominates, and it is lit.
    expect(Math.max(...floor.slice(0, 3)) - Math.min(...floor.slice(0, 3)), `floor is neutral: ${floor}`).toBeLessThan(30);
    expect(luma(floor), `floor is lit: ${floor}`).toBeGreaterThan(60);
    // Two instanced draws (floor, box) in each of two passes, the sky and the composite.
    expect(renderer.getStats().drawCalls).toBe(6);
  });

  it('draws a red box where the camera projects it, lit on the side facing the sun', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    renderer.render(yardFrame(renderer, camera));
    const pixels = await readPixels(renderer);

    const centre = camera.worldToScreen(0, 0.5, 0.5);
    const px = pixels.at(Math.round(centre.x), Math.round(centre.y));
    expect(px[0], `red box at ${px}`).toBeGreaterThan(px[1] * 2);
    expect(px[0]).toBeGreaterThan(px[2] * 2);
  });

  it('casts a shadow: the floor behind the box is darker with shadows than without', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 6, z: 6 });
    // The shadow of the box's top edge lands 0.8 m to the left per metre
    // of height, so this floor point is inside it and clear of the box.
    const sample = () => {
      const p = camera.worldToScreen(-1.0, 0, -0.3);
      return [Math.round(p.x), Math.round(p.y)];
    };
    renderer.render(yardFrame(renderer, camera, { shadows: true }));
    const shadowed = (await readPixels(renderer)).at(...sample());
    renderer.render(yardFrame(renderer, camera, { shadows: false }));
    const lit = (await readPixels(renderer)).at(...sample());
    expect(luma(shadowed), `shadowed ${shadowed} vs lit ${lit}`).toBeLessThan(luma(lit) * 0.8);
  });

  it('puts the HUD on an overlay canvas driven by the WebGL2 backend', () => {
    const canvas = canvasInDocument(40, 30);
    const renderer = new WebGPURenderer();
    renderer.init(canvas, { width: 40, height: 30 });
    cleanup.push(() => renderer.destroy());

    const overlay = renderer.overlayCanvas;
    expect(overlay).toBeTruthy();
    expect(overlay.previousElementSibling).toBe(canvas);
    expect(overlay.style.pointerEvents).toBe('none');
    expect(overlay.width).toBe(canvas.width);
    expect(overlay.height).toBe(canvas.height);
    expect(renderer.uiBackend).toBeInstanceOf(WebGLRenderer);

    renderer.destroy();
    expect(overlay.isConnected).toBe(false);
  });
});

describe('a 3D game through the engine loop', () => {
  beforeAll(async () => {
    await initWebGPU();
    await initPhysics({ dimensions: 3 });
  });

  const YARD = {
    version: SCENE_VERSION, type: 'level', name: 'yard',
    world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
    prefabs: {
      ground: { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { color: '#808080', roughness: 0.9 } },
      crate: { actor: 'Crate', physics: { bodyType: 'static' }, mesh: { color: '#ff0000', roughness: 0.5 } }
    },
    layers: [{ name: 'main', objects: [
      { id: 'floor', prefab: 'ground', x: 0, y: -0.1, z: 0, width: 20, height: 0.2, depth: 20 },
      { id: 'crate', prefab: 'crate', x: 0, y: 0.5, z: 0, width: 1, height: 1, depth: 1 }
    ] }]
  };

  class Ground {}
  class Crate {}

  function game3D(width = 96, height = 72, options = {}) {
    const canvas = canvasInDocument(width, height);
    const game = new M2D(canvas, {
      dimensions: 3, width, height, worldWidth: 20, worldHeight: 20, performanceStats: false, ...options
    });
    cleanup.push(() => game.destroy());
    return { canvas, game };
  }

  it('picks the webgpu renderer and a 3D camera, and draws the scene file\'s meshes', async () => {
    const { Entity } = await import('../../src/core/entity.js');
    const { game } = game3D();
    expect(game.renderer).toBeInstanceOf(WebGPURenderer);
    expect(game.camera).toBeInstanceOf(Camera3D);
    expect(game.uiRenderer.renderer).toBe(game.renderer.uiBackend);

    game.registerActor('Ground', class extends Entity { name = 'Ground'; });
    game.registerActor('Crate', class extends Entity { name = 'Crate'; });
    game.sceneManager.addScene('yard', {
      fetch: async () => YARD,
      onEnter() {
        Object.assign(game.camera, { mode: 'free', position: { x: 0, y: 3, z: 8 }, lookAt: { x: 0, y: 0, z: 0 } });
      },
      onRender(frame) {
        frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
        frame.fog.density = 0;
      }
    });
    await game.sceneManager.switchTo('yard');

    const crate = game.sceneManager.getCurrentScene().entitiesById.get('crate');
    expect(crate.mesh.color[0]).toBeCloseTo(1, 2);
    expect(crate.mesh.color[1]).toBe(0);
    expect(crate.mesh.roughness).toBe(0.5);

    // One frame of the engine loop, with the clock primed so it simulates
    // and draws rather than just arming itself.
    game.lastTime = 1000;
    game.update(1016);

    const pixels = await readPixels(game.renderer);
    const p = game.camera.worldToScreen(0, 0.5, 0.5);
    const px = pixels.at(Math.round(p.x), Math.round(p.y));
    expect(px[0], `the crate is red through game.update: ${px}`).toBeGreaterThan(px[1] * 2);
    const sky = pixels.at(48, 2);
    expect(sky[2], `sky through game.update: ${sky}`).toBeGreaterThan(sky[0]);
  });

  it('draws the HUD over the world on the overlay canvas', async () => {
    const { game } = game3D();
    game.sceneManager.addScene('yard', { fetch: async () => ({ ...YARD, prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
    await game.sceneManager.switchTo('yard');

    const ui = game.uiRenderer;
    ui.beginFrame();
    ui.drawRect({ x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: '#00ff00' });
    ui.endFrame();

    const gl = game.renderer.overlayCanvas.getContext('webgl2');
    const px = new Uint8Array(4);
    gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    expect([...px].slice(0, 3), 'green HUD on the overlay').toEqual([0, 255, 0]);
  });

  it('refuses a 2D renderer for a 3D game, and the reverse, naming the fix', () => {
    const canvas = canvasInDocument(16, 16);
    expect(() => new M2D(canvas, { dimensions: 3, renderer: 'webgl', performanceStats: false }))
      .toThrow(/'webgl' renderer draws in 2D but the game runs 3D physics — use \{ renderer: 'webgpu' \}/);
    const other = canvasInDocument(16, 16);
    expect(() => new M2D(other, { renderer: 'webgpu', performanceStats: false }))
      .toThrow(/'webgpu' renderer draws in 3D but the game runs 2D physics/);
  });
});

describe('lighting', () => {
  beforeAll(() => initWebGPU());

  function make(W, H) {
    const canvas = canvasInDocument(W, H);
    const renderer = new WebGPURenderer();
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    return renderer;
  }

  /** A dark floor and whatever `build` adds, under a weak sun so the lights show. */
  function scene(renderer, camera, build, { bloom = 0 } = {}) {
    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [0.3, -1, 0.2], color: [1, 1, 1], intensity: 0.4 };
    frame.ambient.intensity = 0.3;
    frame.fog.density = 0;
    frame.bloom = { threshold: 1, intensity: bloom };
    frame.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 20, y: 1, z: 20 }, color: [0.3, 0.3, 0.3], roughness: 0.9 });
    build(frame);
    return frame;
  }

  it('a mirror sphere reflects the sky above and the ground below', async () => {
    const W = 96, H = 96;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 1, z: 4 });
    const frame = scene(renderer, camera, (f) => {
      f.sun.intensity = 3;
      f.ambient.intensity = 1;
      f.add(sphere(), { position: { x: 0, y: 1, z: 0 }, scale: 1.4, color: [1, 1, 1], metallic: 1, roughness: 0.05 });
    });
    renderer.render(frame);
    const pixels = await readPixels(renderer);
    const top = camera.worldToScreen(0, 1.62, 0.25);
    const bottom = camera.worldToScreen(0, 0.4, 0.25);
    const upper = pixels.at(Math.round(top.x), Math.round(top.y));
    const lower = pixels.at(Math.round(bottom.x), Math.round(bottom.y));
    // The upper face mirrors sky: blue over red, and bright. The lower face
    // mirrors the floor and the haze below the horizon: markedly darker.
    expect(upper[2], `sky in the mirror: ${upper}`).toBeGreaterThan(upper[0]);
    expect(luma(upper), `bright reflection: ${upper}`).toBeGreaterThan(120);
    expect(luma(lower), `ground reflection ${lower} darker than sky ${upper}`).toBeLessThan(luma(upper) * 0.9);
  });

  it('a point light brightens the floor near it and not far from it', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 6, z: 6 });
    const lit = scene(renderer, camera, (f) => {
      f.addLight({ position: { x: 0, y: 1.5, z: 0 }, color: [1, 0.8, 0.5], intensity: 20, range: 6 });
    });
    renderer.render(lit);
    const near = camera.worldToScreen(0, 0, 0.5);
    const far = camera.worldToScreen(-6, 0, -4);
    const a = await readPixels(renderer);
    const nearLit = a.at(Math.round(near.x), Math.round(near.y));
    const farLit = a.at(Math.round(far.x), Math.round(far.y));
    renderer.render(scene(renderer, camera, () => {}));
    const b = await readPixels(renderer);
    const nearDark = b.at(Math.round(near.x), Math.round(near.y));
    expect(luma(nearLit), `near the light ${nearLit} vs without ${nearDark}`).toBeGreaterThan(luma(nearDark) * 1.8);
    expect(Math.abs(luma(farLit) - luma(b.at(Math.round(far.x), Math.round(far.y)))), 'beyond the range nothing changes').toBeLessThan(6);
    // Warm light: red over blue on the floor.
    expect(nearLit[0]).toBeGreaterThan(nearLit[2]);
  });

  it('a spot light lights only inside its cone', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 8, z: 4 });
    renderer.render(scene(renderer, camera, (f) => {
      f.addLight({ type: 'spot', position: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: -1, z: 0 }, color: [1, 1, 1], intensity: 40, range: 10, innerCone: 0.3, outerCone: 0.45 });
    }));
    const pixels = await readPixels(renderer);
    const inside = camera.worldToScreen(0, 0, 0);
    const outside = camera.worldToScreen(3, 0, 0);
    const i = pixels.at(Math.round(inside.x), Math.round(inside.y));
    const o = pixels.at(Math.round(outside.x), Math.round(outside.y));
    expect(luma(i), `inside the cone ${i} vs outside ${o}`).toBeGreaterThan(luma(o) * 2);
  });

  it('bloom spreads an emissive surface into a glow around it', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 1, z: 5 });
    const build = (f) => f.add(sphere(), { position: { x: 0, y: 1, z: 0 }, scale: 0.6, color: [1, 0.8, 0.4], emissive: 8 });
    const beside = camera.worldToScreen(0.55, 1, 0);
    renderer.render(scene(renderer, camera, build, { bloom: 0 }));
    const without = (await readPixels(renderer)).at(Math.round(beside.x), Math.round(beside.y));
    renderer.render(scene(renderer, camera, build, { bloom: 0.5 }));
    const withBloom = (await readPixels(renderer)).at(Math.round(beside.x), Math.round(beside.y));
    expect(luma(withBloom), `glow beside the lamp ${withBloom} vs none ${without}`).toBeGreaterThan(luma(without) + 15);
  });
});

describe('a textured model', () => {
  beforeAll(() => initWebGPU());

  it('draws a glTF box with its texture, lit and shadowed like everything else', async () => {
    const { parseGLB } = await import('../../src/core/gltf.js');
    const response = await fetch(new URL('../fixtures/models/BoxTextured.glb', import.meta.url));
    const model = await parseGLB(await response.arrayBuffer(), { name: 'BoxTextured' });
    expect(model.parts).toHaveLength(1);
    expect(model.parts[0].material.baseColorTexture).toBeInstanceOf(ImageBitmap);

    const W = 96, H = 72;
    const canvas = canvasInDocument(W, H);
    const renderer = new WebGPURenderer();
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    const camera = cameraAt(W, H, { x: 0, y: 1.5, z: 4 });

    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
    frame.fog.density = 0;
    frame.bloom.intensity = 0;
    frame.shadow.radius = 6;
    const [part] = model.parts;
    frame.add(part.geometry, { model: part.matrix, material: part.material, color: [1, 1, 1], metallic: 1, roughness: 1 });
    renderer.render(frame);
    const pixels = await readPixels(renderer);

    // Khronos's BoxTextured wears the Cesium logo: a mostly grey-blue
    // face, so the box's front reads as a coloured, lit surface that is
    // neither the sky nor the shader's grey default.
    const p = camera.worldToScreen(0, 0, 0.5);
    const px = pixels.at(Math.round(p.x), Math.round(p.y));
    expect(luma(px), `textured face is lit: ${px}`).toBeGreaterThan(40);
    expect(px[3]).toBe(255);
    // The texture varies across the face where a flat colour would not.
    const q = camera.worldToScreen(0.35, 0.35, 0.5);
    const qx = pixels.at(Math.round(q.x), Math.round(q.y));
    const differs = px.slice(0, 3).some((v, i) => Math.abs(v - qx[i]) > 12);
    expect(differs, `texture varies: ${px} vs ${qx}`).toBe(true);
    expect(renderer.getStats().drawCalls).toBe(4);
  });
});

describe('primitive geometry', () => {
  it('builds every body shape at its size, caching unit shapes', () => {
    const a = geometryFor('box', { x: 2, y: 1, z: 3 });
    const b = geometryFor('box', { x: 1, y: 1, z: 1 });
    expect(a.geometry).toBe(b.geometry);
    expect(a.scale).toEqual({ x: 2, y: 1, z: 3 });
    expect(geometryFor('sphere', { x: 0.4, y: 0.4, z: 0.4 }).scale).toEqual({ x: 0.4, y: 0.4, z: 0.4 });
    const c = geometryFor('capsule', { x: 0.6, y: 1.8, z: 0.6 });
    expect(c.scale).toEqual({ x: 1, y: 1, z: 1 });
    // A capsule is built to its proportions: tip to tip is its height.
    let top = -Infinity, bottom = Infinity;
    for (let i = 1; i < c.geometry.positions.length; i += 3) {
      top = Math.max(top, c.geometry.positions[i]);
      bottom = Math.min(bottom, c.geometry.positions[i]);
    }
    expect(top - bottom).toBeCloseTo(1.8, 5);
    expect(geometryFor('capsule', { x: 0.6, y: 1.8 }).geometry).toBe(c.geometry);
  });
});
