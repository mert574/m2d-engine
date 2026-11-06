import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { M2D } from '../../src/core/m2d.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { createRenderer, WebGPURenderer, WebGLRenderer } from '../../src/core/renderers/index.js';
import { initWebGPU, webgpuSupported } from '../../src/core/renderers/webgpu/device.js';
import { SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { createCanvasElement } from '../helpers/environment.js';

/**
 * First light: WebGPU works in the test browser, the 3D renderer clears and
 * draws one lit triangle, the engine drives it through its frame loop, and
 * the HUD lands on the overlay canvas above it.
 *
 * This is the R0 gate in docs/plans/3d-and-editor.md. If it fails on
 * `navigator.gpu`, check `--enable-unsafe-webgpu` in vitest.browser.config.js.
 */

/**
 * The renderer's own readback, in the same task as the draw. (A 2D canvas
 * snapshot of a WebGPU canvas reads back empty under SwiftShader, so the
 * pixels come off the GPU instead.)
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

const close = (actual, expected, tolerance = 3) =>
  actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);

/** Assert a pixel, showing what was there when it is not. */
function expectPixel(actual, expected, label) {
  expect(close(actual, expected), `${label}: got [${actual}], wanted [${expected}]`).toBe(true);
}

/** A triangle filling the middle of clip space, facing the viewer (+z toward the eye), red. */
function triangle() {
  const n = [0, 0, 1];
  const c = [1, 0, 0];
  return new Float32Array([
    -0.8, -0.8, 0, ...n, ...c,
    0.8, -0.8, 0, ...n, ...c,
    0, 0.8, 0, ...n, ...c
  ]);
}

/** Light travelling away from the viewer, so a viewer-facing surface is fully lit. */
const LIGHT = { direction: [0, 0, -1], color: [1, 1, 1], ambient: [0, 0, 0] };

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

  it('clears to a colour and draws one lit triangle', async () => {
    const W = 64, H = 48;
    const canvas = canvasInDocument(W, H);
    const renderer = new WebGPURenderer();
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());

    renderer.render({ clearColor: '#204060', light: LIGHT, meshes: [{ vertices: triangle() }] });

    const pixels = await readPixels(renderer);
    expectPixel(pixels.at(W / 2, H / 2), [255, 0, 0, 255], 'centre is the lit red triangle');
    expectPixel(pixels.at(1, 1), [0x20, 0x40, 0x60, 255], 'corner is the clear colour');
    expect(renderer.getStats().drawCalls).toBe(1);
  });

  it('shades by the light: a surface facing away is only ambient', async () => {
    const W = 32, H = 32;
    const canvas = canvasInDocument(W, H);
    const renderer = new WebGPURenderer();
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());

    const away = { direction: [0, 0, 1], color: [1, 1, 1], ambient: [0.2, 0.2, 0.2] };
    renderer.render({ clearColor: '#000', light: away, meshes: [{ vertices: triangle() }] });
    const pixels = await readPixels(renderer);
    expectPixel(pixels.at(W / 2, H / 2), [51, 0, 0, 255], 'red at 0.2 ambient only');
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
    prefabs: {}, layers: [{ name: 'main', objects: [] }]
  };

  function game3D(width = 64, height = 48, options = {}) {
    const canvas = canvasInDocument(width, height);
    const game = new M2D(canvas, {
      dimensions: 3, width, height, worldWidth: 20, worldHeight: 20, performanceStats: false, ...options
    });
    cleanup.push(() => game.destroy());
    return { canvas, game };
  }

  it('picks the webgpu renderer by default and draws the scene\'s frame', async () => {
    const { canvas, game } = game3D();
    expect(game.renderer).toBeInstanceOf(WebGPURenderer);
    expect(game.uiRenderer.renderer).toBe(game.renderer.uiBackend);

    game.sceneManager.addScene('yard', {
      fetch: async () => YARD,
      onRender(frame) {
        frame.clearColor = '#204060';
        frame.light = LIGHT;
        frame.meshes.push({ vertices: triangle() });
      }
    });
    await game.sceneManager.switchTo('yard');

    // One frame of the engine loop, with the clock primed so it simulates
    // and draws rather than just arming itself. (Priming through a first
    // `update` would leave a second animation frame pending that `destroy`
    // does not know about.)
    game.lastTime = 1000;
    game.update(1016);

    const pixels = await readPixels(game.renderer);
    expectPixel(pixels.at(32, 24), [255, 0, 0, 255], 'the triangle through game.update');
    expectPixel(pixels.at(1, 1), [0x20, 0x40, 0x60, 255], 'the clear colour');
  });

  it('draws the HUD over the world on the overlay canvas', async () => {
    const { game } = game3D();
    game.sceneManager.addScene('yard', { fetch: async () => YARD });
    await game.sceneManager.switchTo('yard');

    const ui = game.uiRenderer;
    ui.beginFrame();
    ui.drawRect({ x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: '#00ff00' });
    ui.endFrame();

    const gl = game.renderer.overlayCanvas.getContext('webgl2');
    const px = new Uint8Array(4);
    gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    expectPixel([...px], [0, 255, 0, 255], 'green HUD on the overlay');
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
