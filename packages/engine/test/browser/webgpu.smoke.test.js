import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { M2D } from '../../src/core/m2d.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { createRenderer, WebGPURenderer, WebGLRenderer } from '../../src/core/renderers/index.js';
import { initWebGPU, webgpuSupported } from '../../src/core/renderers/webgpu/device.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { box, plane, sphere, geometryFor } from '../../src/core/renderers/geometry/primitives.js';
import { StaticBatch } from '../../src/core/renderers/frame3d.js';
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

/**
 * Every post stage off but bloom, so a test sees the lighting it set up
 * and nothing smoothed, blurred or adapted over it. The post tests turn
 * one stage on each.
 */
function quiet(renderer) {
  renderer.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: true, film: false };
  return renderer;
}

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
  frame.setCamera(camera);
  // Light travelling toward -x: the sun is high on the camera's right and
  // the box's shadow lies to its left, in view.
  frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
  frame.fog.density = 0;
  frame.bloom.intensity = 0;
  frame.shadow.enabled = shadows;
  frame.shadow.distance = 30;
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
    const renderer = quiet(new WebGPURenderer());
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
    // Two instanced draws (floor, box) in each of three cascades and the
    // main pass, the sky, the resolve and the composite.
    expect(renderer.getStats().drawCalls).toBe(2 * 4 + 1 + 2);
  });

  it('culls on the GPU: what the camera cannot see is not drawn, and the statistics say so', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    const frame = yardFrame(renderer, camera, { shadows: false });
    const g = box();
    frame.add(g, { position: { x: 0, y: 0, z: 30 } });    // behind the camera
    frame.add(g, { position: { x: 300, y: 0, z: 0 } });   // far to the side
    const batch = new StaticBatch(g);
    for (let i = 0; i < 50; i++) batch.push({ position: { x: 2 + (i % 5) * 0.3, y: 0.5 + Math.floor(i / 5) * 0.3, z: 0 }, scale: 0.25 });
    for (let i = 0; i < 50; i++) batch.push({ position: { x: -500, y: 0, z: i } });  // all unseen
    frame.addBatch(batch);
    renderer.render(frame);
    // The picture still has the red box in it, through the indirect draw.
    // (Pixels must be read in the task that drew them; the statistics can wait.)
    const pixels = await readPixels(renderer);
    const centre = camera.worldToScreen(0, 0.5, 0.5);
    const px = pixels.at(Math.round(centre.x), Math.round(centre.y));
    expect(px[0], `red where the box is: ${px}`).toBeGreaterThan(px[1] + 40);
    await renderer.flushStats();
    const stats = renderer.getStats();
    expect(stats.instances).toBe(2 + 2 + 100);
    // The floor, the red box and the fifty small cubes; nothing else.
    expect(stats.drawn).toBe(52);
    expect(stats.casters).toBe(0);
    expect(stats.triangles).toBe(2 + 51 * 12);
  });

  it('draws each instance at one level of detail: groups whose coverage ranges tile do not double it', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    const frame = yardFrame(renderer, camera, { shadows: false });
    // The same twenty cubes in a near level and a far level; eight metres
    // out, a 0.3 m cube covers about 3% of the view, so the far one draws.
    const near = new StaticBatch(box(), null, 64, [0.1, Infinity]);
    const far = new StaticBatch(sphere(), null, 64, [0, 0.1]);
    for (let i = 0; i < 20; i++) {
      const at = { position: { x: -3 + i * 0.3, y: 0.5, z: -2 }, scale: 0.3 };
      near.push(at);
      far.push(at);
    }
    frame.addBatch(near);
    frame.addBatch(far);
    renderer.render(frame);
    await renderer.flushStats();
    const stats = renderer.getStats();
    expect(stats.instances).toBe(2 + 40);
    expect(stats.drawn).toBe(2 + 20);
  });

  it('cuts an alpha-masked material out where its texture is transparent', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    // A texture whose left half is opaque red and right half clear.
    const sheet = new OffscreenCanvas(64, 64);
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = 'rgb(255, 0, 0)';
    ctx.fillRect(0, 0, 32, 64);
    const image = await createImageBitmap(sheet, { premultiplyAlpha: 'none' });
    const material = {
      name: 'cutout', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, emissive: [0, 0, 0],
      baseColorTexture: image, metallicRoughnessTexture: null, emissiveTexture: null,
      normalTexture: null, normalScale: 1, occlusionTexture: null, occlusionStrength: 1,
      alphaMode: 'mask', alphaCutoff: 0.5, doubleSided: true, uvTransform: null
    };
    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
    frame.fog.density = 0;
    frame.bloom.intensity = 0;
    frame.shadow.enabled = false;
    frame.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 20, y: 1, z: 20 }, color: [0.5, 0.5, 0.5], roughness: 0.9 });
    // The plane's u runs along +x, so the red half lies at negative x.
    frame.add(plane(), { position: { x: 0, y: 0.02, z: 0 }, scale: { x: 6, y: 1, z: 6 }, material, color: [1, 1, 1] });
    renderer.render(frame);
    const pixels = await readPixels(renderer);
    const under = (x, z) => { const p = camera.worldToScreen(x, 0.02, z); return pixels.at(Math.round(p.x), Math.round(p.y)); };
    const red = under(-1.5, 0);
    const cut = under(1.5, 0);
    expect(red[0], `red where the texture is opaque: ${red}`).toBeGreaterThan(red[1] + 60);
    expect(Math.max(...cut.slice(0, 3)) - Math.min(...cut.slice(0, 3)), `grey floor through the cut-out: ${cut}`).toBeLessThan(30);
  });

  it('counts shadow casters per cascade, and leaves out what casts none', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    const frame = yardFrame(renderer, camera);
    frame.add(box(), { position: { x: 2, y: 0.5, z: 0 }, castShadow: false });
    renderer.render(frame);
    await renderer.flushStats();
    const stats = renderer.getStats();
    expect(stats.drawn).toBe(3);
    // Three cascades at medium quality, each seeing the floor and the red
    // box; the non-caster is in none of them.
    expect(stats.casters).toBe(3 * 2);
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
    quiet(game.renderer);
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
    const renderer = quiet(new WebGPURenderer());
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

  it('a shadowed spot light leaves the floor dark behind a box', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 8, z: 5 });
    const build = (shadow) => (f) => {
      f.add(box(), { position: { x: 0, y: 0.5, z: 0 }, color: [0.6, 0.6, 0.6] });
      f.addLight({ type: 'spot', position: { x: 0, y: 4, z: 3 }, direction: { x: 0, y: -1, z: -0.75 }, color: [1, 1, 1], intensity: 60, range: 12, innerCone: 0.6, outerCone: 0.8, shadow });
    };
    // The box's shadow from a light above and in front of it lands behind
    // it, from z -0.5 to -1.7; the camera sees the floor only past -1.3.
    const behind = camera.worldToScreen(0, 0, -1.55);
    renderer.render(scene(renderer, camera, build(true)));
    const shadowed = (await readPixels(renderer)).at(Math.round(behind.x), Math.round(behind.y));
    renderer.render(scene(renderer, camera, build(false)));
    const lit = (await readPixels(renderer)).at(Math.round(behind.x), Math.round(behind.y));
    expect(luma(shadowed), `behind the box: shadowed ${shadowed} vs unshadowed ${lit}`).toBeLessThan(luma(lit) * 0.75);
  });

  it('shadow quality off draws no shadow passes, high draws four cascades', async () => {
    const W = 64, H = 48;
    const renderer = make(W, H);
    const camera = cameraAt(W, H);
    renderer.setShadowQuality('off');
    renderer.render(yardFrame(renderer, camera));
    expect(renderer.getStats().drawCalls).toBe(2 + 1 + 2);
    renderer.setShadowQuality('high');
    renderer.render(yardFrame(renderer, camera));
    expect(renderer.getStats().drawCalls).toBe(2 * 5 + 1 + 2);
    renderer.setShadowQuality('medium');
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
    // Bloom is energy-conserving — a share of the light scattered, not
    // light added — so the sky pixel beside the warm lamp takes on its
    // colour rather than simply getting brighter.
    const warmth = (px) => px[0] - px[2];
    expect(warmth(withBloom), `lamp colour spreads: ${withBloom} vs none ${without}`).toBeGreaterThan(warmth(without) + 10);
  });
});

describe('the display settings', () => {
  beforeAll(() => initWebGPU());

  it('renders the world at the resolution setting and letterboxes it into the content rectangle', async () => {
    const { computeViewport } = await import('../../src/core/viewport.js');
    // A 96x96 display showing a 16:9 design at half resolution: bars above
    // and below, and a world surface a quarter the size of the content.
    const viewport = computeViewport({
      displayWidth: 96, displayHeight: 96, designWidth: 160, designHeight: 90,
      pixelRatio: 1, aspectMode: 'letterbox', resolution: 0.5
    });
    expect(viewport.contentHeight).toBeLessThan(96);
    expect(viewport.worldWidth).toBeLessThan(viewport.contentWidth);

    const canvas = canvasInDocument(96, 96);
    const renderer = quiet(new WebGPURenderer());
    renderer.init(canvas, { viewport });
    cleanup.push(() => renderer.destroy());
    const camera = cameraAt(viewport.viewWidth, viewport.viewHeight);
    renderer.render(yardFrame(renderer, camera));
    const pixels = await readPixels(renderer);

    const bar = pixels.at(48, 2);
    const inside = pixels.at(48, Math.round(viewport.contentY + 3));
    expect(luma(bar), `letterbox bar is black: ${bar}`).toBeLessThan(8);
    expect(inside[2], `sky inside the content rect: ${inside}`).toBeGreaterThan(inside[0]);
    expect(luma(inside)).toBeGreaterThan(100);
  });
});

describe('the post stack', () => {
  beforeAll(() => initWebGPU());

  function make(W, H) {
    const canvas = canvasInDocument(W, H);
    const renderer = quiet(new WebGPURenderer());
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    return renderer;
  }

  /** A grey floor, a grey box, a steady sun; `tune` edits the frame. */
  function scene(renderer, camera, tune = () => {}) {
    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [-0.5, -1, -0.3], color: [1, 1, 1], intensity: 3 };
    frame.fog.density = 0;
    frame.bloom.intensity = 0;
    frame.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 20, y: 1, z: 20 }, color: [0.5, 0.5, 0.5], roughness: 0.9 });
    frame.add(box(), { position: { x: 0, y: 0.5, z: 0 }, color: [0.5, 0.5, 0.5], roughness: 0.8 });
    tune(frame);
    return frame;
  }
  const at = (pixels, camera, x, y, z) => {
    const p = camera.worldToScreen(x, y, z);
    return pixels.at(Math.round(p.x), Math.round(p.y));
  };

  it('ambient occlusion darkens the floor at the foot of the box, not out in the open', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 3, y: 4, z: 5 });
    // A dim sun and a strong sky, so indirect light — what occlusion scales — carries the floor.
    const dim = (f) => { f.sun.intensity = 0.3; f.ambient.intensity = 1.6; };
    renderer.render(scene(renderer, camera, dim));
    const plain = await readPixels(renderer);
    renderer.effects.ao = true;
    renderer.render(scene(renderer, camera, (f) => { dim(f); f.post.ao = { radius: 1, intensity: 1.5 }; }));
    const occluded = await readPixels(renderer);
    const foot = [0.62, 0, 0.62];
    const open = [-1.5, 0, 1];
    const footDrop = luma(at(plain, camera, ...foot)) - luma(at(occluded, camera, ...foot));
    const openDrop = luma(at(plain, camera, ...open)) - luma(at(occluded, camera, ...open));
    expect(footDrop, `foot of the box darkens by ${footDrop}, the open floor by ${openDrop}`).toBeGreaterThan(openDrop + 6);
  });

  it('temporal anti-aliasing settles a still scene to the same picture frame after frame', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 3, y: 3, z: 5 });
    renderer.effects.taa = true;
    const samples = [];
    for (let i = 0; i < 12; i++) {
      renderer.render(scene(renderer, camera));
      if (i >= 8) samples.push(await readPixels(renderer));
    }
    // Once converged, consecutive frames agree closely across a row of pixels.
    let worst = 0;
    for (let x = 4; x < W - 4; x += 4) {
      const a = samples[0].at(x, H / 2);
      const b = samples[samples.length - 1].at(x, H / 2);
      worst = Math.max(worst, Math.abs(luma(a) - luma(b)));
    }
    expect(worst, `largest frame-to-frame change ${worst}`).toBeLessThan(8);
    // And it is still the scene: a grey box on a grey floor under a sky.
    const sky = samples[0].at(W / 2, 2);
    expect(sky[2]).toBeGreaterThan(sky[0]);
  });

  it('depth of field blurs the far floor and leaves the focus sharp', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 2, z: 6 });
    // A hard checker on the floor gives the blur something to soften.
    // A fast, long lens: at this tiny frame height the circle of confusion
    // is a fraction of a pixel otherwise.
    const tune = (focus) => (f) => {
      f.post.dof = { focus, focalLength: 85, fStop: 0.5, maxBlur: 10 };
    };
    const checkerScene = (focus) => {
      const frame = scene(renderer, camera, tune(focus));
      frame.add(plane(), { position: { x: 0, y: 0.01, z: 0 }, scale: { x: 20, y: 1, z: 20 }, color: [0.9, 0.9, 0.9], roughness: 0.9, checker: 1 });
      return frame;
    };
    const contrast = (pixels, z) => {
      // Luma range along a run of the floor at depth z, clear of the box.
      const values = [];
      for (let x = 1.5; x <= 4; x += 0.125) values.push(luma(at(pixels, camera, x, 0.01, z)));
      return Math.max(...values) - Math.min(...values);
    };
    renderer.render(checkerScene(null));
    const sharp = await readPixels(renderer);
    renderer.effects.dof = true;
    renderer.render(checkerScene(camera.position.z - 1));
    const focused = await readPixels(renderer);
    const far = -5;
    expect(contrast(focused, far), 'far floor softened').toBeLessThan(contrast(sharp, far) * 0.7);
    expect(contrast(focused, 1), 'near the focus unchanged').toBeGreaterThan(contrast(sharp, 1) * 0.8);
  });

  it('vignette darkens the corners and leaves the centre', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 3, z: 6 });
    renderer.render(scene(renderer, camera));
    const plain = await readPixels(renderer);
    renderer.effects.film = true;
    renderer.render(scene(renderer, camera, (f) => { f.post.vignette = 0.6; }));
    const filmed = await readPixels(renderer);
    const corner = [2, 2];
    const centre = [W / 2, H / 2];
    expect(luma(filmed.at(...corner)), 'corner darker').toBeLessThan(luma(plain.at(...corner)) * 0.8);
    expect(Math.abs(luma(filmed.at(...centre)) - luma(plain.at(...centre))), 'centre kept').toBeLessThan(6);
  });

  it('auto exposure brings a dark scene up over a few frames', async () => {
    const W = 64, H = 48;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 3, z: 6 });
    const dark = (f) => {
      f.exposure = 0.2;
      f.post.autoExposure = { enabled: true, key: 0.18, min: 0.25, max: 8, speed: 20 };
    };
    renderer.render(scene(renderer, camera, dark));
    const first = luma((await readPixels(renderer)).at(W / 2, H - 6));
    renderer.effects.autoExposure = true;
    let last = first;
    for (let i = 0; i < 6; i++) {
      renderer.render(scene(renderer, camera, dark));
      last = luma((await readPixels(renderer)).at(W / 2, H - 6));
    }
    // Tonemapping compresses the gain; a clear step up is what counts.
    expect(last, `floor went from ${first} to ${last}`).toBeGreaterThan(first + 15);
  });

  it('a moving box smears along its motion when motion blur is on', async () => {
    const W = 96, H = 72;
    const renderer = make(W, H);
    const camera = cameraAt(W, H, { x: 0, y: 2, z: 7 });
    // A second, dark box in front of the scene's, that was 1.5 m to the left last frame.
    const moving = (x, previousX) => (f) => {
      f.post.motionBlur = { strength: 1 };
      const previousModel = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, previousX, 0.5, 2, 1]);
      f.add(box(), { position: { x, y: 0.5, z: 2 }, color: [0.02, 0.02, 0.02], previousModel });
    };
    // A pixel just inside its trailing edge stays dark without blur and
    // takes in the floor beside it when the box smears.
    const trail = [-0.42, 0.5, 2.51];
    renderer.render(scene(renderer, camera, moving(0, -1.5)));
    const still = await readPixels(renderer);
    renderer.effects.motionBlur = true;
    renderer.render(scene(renderer, camera, moving(0, -1.5)));
    const blurred = await readPixels(renderer);
    expect(luma(at(blurred, camera, ...trail)), `trail ${at(blurred, camera, ...trail)} vs still ${at(still, camera, ...trail)}`)
      .toBeGreaterThan(luma(at(still, camera, ...trail)) * 1.3 + 4);
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
    const renderer = quiet(new WebGPURenderer());
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    const camera = cameraAt(W, H, { x: 0, y: 1.5, z: 4 });

    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
    frame.fog.density = 0;
    frame.bloom.intensity = 0;
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
    // One instanced draw per cascade and in the main pass, the sky, the resolve and the composite.
    expect(renderer.getStats().drawCalls).toBe(3 + 1 + 1 + 2);
  });
});

describe('KTX2 textures', () => {
  beforeAll(() => initWebGPU());

  it('transcodes a KTX2 file to the device\'s format, every mip present', async () => {
    const { initBasis, bestTranscodeTarget, transcodeKTX2 } = await import('../../src/core/renderers/webgpu/basis.js');
    const { webgpuDevice } = await import('../../src/core/renderers/webgpu/device.js');
    const response = await fetch(new URL('../fixtures/textures/blue.ktx2', import.meta.url));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const target = bestTranscodeTarget(webgpuDevice());
    const image = transcodeKTX2(await initBasis(), bytes, target, 'blue.ktx2');
    expect(image.compressed).toBe(true);
    expect(image.base).toBe(target);
    expect(image.width).toBe(16);
    expect(image.height).toBe(16);
    // 16x16 with a full chain: 16, 8, 4, 2, 1.
    expect(image.mips).toHaveLength(5);
    for (const mip of image.mips) expect(mip.length).toBeGreaterThan(0);
  });

  it('draws a box whose texture is KTX2 (KHR_texture_basisu)', async () => {
    const W = 96, H = 72;
    const canvas = canvasInDocument(W, H);
    const renderer = quiet(new WebGPURenderer());
    // init registers the KTX2 decoder, so it comes before the parse.
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());

    const { parseGLB } = await import('../../src/core/gltf.js');
    const response = await fetch(new URL('../fixtures/models/BoxTexturedKtx2.glb', import.meta.url));
    const model = await parseGLB(await response.arrayBuffer(), { name: 'BoxTexturedKtx2' });
    const texture = model.parts[0].material.baseColorTexture;
    expect(texture.compressed).toBe(true);
    expect(texture.mips.length).toBeGreaterThan(1);

    const camera = cameraAt(W, H, { x: 0, y: 1.5, z: 4 });
    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [-0.8, -1, -0.3], color: [1, 1, 1], intensity: 3 };
    frame.fog.density = 0;
    frame.bloom.intensity = 0;
    const [part] = model.parts;
    frame.add(part.geometry, { model: part.matrix, material: part.material, color: [1, 1, 1], metallic: 1, roughness: 1 });
    renderer.render(frame);
    const pixels = await readPixels(renderer);

    // The same checks the image-texture box passes: a lit face that varies.
    const p = camera.worldToScreen(0, 0, 0.5);
    const px = pixels.at(Math.round(p.x), Math.round(p.y));
    expect(luma(px), `textured face is lit: ${px}`).toBeGreaterThan(40);
    const q = camera.worldToScreen(0.35, 0.35, 0.5);
    const qx = pixels.at(Math.round(q.x), Math.round(q.y));
    const differs = px.slice(0, 3).some((v, i) => Math.abs(v - qx[i]) > 12);
    expect(differs, `texture varies: ${px} vs ${qx}`).toBe(true);
  });
});

describe('a skinned model', () => {
  beforeAll(() => initWebGPU());

  it('is skinned on the GPU: the pose changes as the clip plays', async () => {
    const { parseGLB } = await import('../../src/core/gltf.js');
    const { Animator3D } = await import('../../src/core/animator3d.js');
    const response = await fetch(new URL('../fixtures/models/RiggedSimple.glb', import.meta.url));
    const model = await parseGLB(await response.arrayBuffer(), { name: 'RiggedSimple' });
    const animator = new Animator3D(model);
    animator.play('clip 0', { fade: 0 });

    const W = 96, H = 72;
    const canvas = canvasInDocument(W, H);
    const renderer = quiet(new WebGPURenderer());
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    const camera = cameraAt(W, H, { x: 0, y: 3, z: 12 });
    const draw = () => {
      const frame = renderer.createFrame();
      frame.setCamera(camera);
      frame.sun = { direction: [-0.5, -1, -0.3], color: [1, 1, 1], intensity: 3 };
      frame.fog.density = 0;
      frame.bloom.intensity = 0;
      const [part] = model.parts;
      frame.add(part.geometry, { model: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), material: part.material, color: [0.9, 0.3, 0.3], metallic: 0, roughness: 0.6, skin: animator.jointMatrices(0) });
      renderer.render(frame);
      return readPixels(renderer);
    };
    const before = await draw();
    animator.update(1.0);
    const after = await draw();
    // The cylinder bends: somewhere on screen the picture changed a lot.
    let changed = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (Math.abs(luma(before.at(x, y)) - luma(after.at(x, y))) > 40) changed++;
    }
    expect(changed, `${changed} sample points changed`).toBeGreaterThan(8);
    // And it is drawn at all: red where the cylinder is.
    const centre = before.at(W / 2, H / 2);
    expect(centre[0]).toBeGreaterThan(centre[2]);
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
