import { describe, it, expect, afterEach, vi } from 'vitest';
import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';
import { expectColorAt, snapshot } from '../helpers/pixels.js';
import { identityViewport } from '../../src/core/viewport.js';

/**
 * Resizing across a WebGL context loss.
 *
 * A context can be lost at any time, including while the window is being
 * resized — a real scenario, since entering fullscreen on a GPU under memory
 * pressure can do both at once. The renderer cannot act on a resize while the
 * context is gone, so it must remember the size and replay the *latest* one
 * when the context comes back. Replaying a stale size would leave the game
 * rendering at the pre-resize resolution until something else forced a
 * resize.
 */
describe('WebGLRenderer context loss and resize', () => {
  let renderer;
  let target;
  let lose;

  function setup(width = 200, height = 120) {
    target = createCanvasElement(width, height);
    renderer = new WebGLRenderer({ contextAttributes: { preserveDrawingBuffer: true } });
    renderer.init(target, { width, height });
    lose = target.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!lose) throw new Error('WEBGL_lose_context is required for these tests');
  }

  /** Lose the context and wait for the renderer to see the event. */
  async function loseContext() {
    lose.loseContext();
    await vi.waitFor(() => expect(renderer.contextLost).toBe(true));
  }

  /** Restore the context and wait for the renderer to rebuild. */
  async function restoreContext() {
    lose.restoreContext();
    await vi.waitFor(() => expect(renderer.contextLost).toBe(false), { timeout: 5000 });
  }

  afterEach(() => {
    renderer?.destroy();
  });

  it('records a resize that arrives while the context is lost', async () => {
    setup();
    await loseContext();

    renderer.resize(320, 240);

    // It cannot touch the GPU yet, but it must have accepted the size.
    expect(renderer.width).toBe(320);
    expect(renderer.height).toBe(240);
  });

  it('replays the latest size once the context is restored', async () => {
    setup();
    await loseContext();
    renderer.resize(320, 240);
    await restoreContext();

    expect(target.width).toBe(320);
    expect(target.height).toBe(240);
    expect(renderer.width).toBe(320);
  });

  it('replays the last of several resizes, not the first', async () => {
    setup();
    await loseContext();
    renderer.resize(320, 240);
    renderer.resize(100, 50);
    renderer.resize(160, 90);
    await restoreContext();

    expect(target.width).toBe(160);
    expect(target.height).toBe(90);
  });

  it('draws correctly at the new size after restoring', async () => {
    setup();
    await loseContext();
    renderer.resize(160, 90);
    await restoreContext();

    renderer.beginFrame();
    renderer.drawRect({ x: 0, y: 0, width: 160, height: 90, fillStyle: '#ff0000' });
    renderer.endFrame();

    const snap = snapshot({ readPixels: readWebGLPixels }, target);
    expect(snap.width).toBe(160);
    expect(snap.height).toBe(90);
    expectColorAt(snap, 80, 45, '#ff0000');
    expectColorAt(snap, 5, 5, '#ff0000');
  });

  it('keeps an independent world and UI resolution across a restore', async () => {
    setup();
    const split = {
      ...identityViewport(200, 120),
      worldWidth: 20, worldHeight: 12, worldScale: 0.1
    };

    await loseContext();
    renderer.setViewport(split);
    await restoreContext();

    expect(renderer.viewport.worldWidth).toBe(20);
    expect(renderer.viewport.uiWidth).toBe(200);
    expect(target.width).toBe(200);

    // The UI still rasterizes at full resolution over the coarse world.
    renderer.beginFrame();
    renderer.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#000000' });
    renderer.endFrame();
    renderer.beginScreenFrame();
    renderer.drawRect({ x: 100, y: 0, width: 1, height: 120, fillStyle: '#00ff00', isScreenSpace: true });
    renderer.endScreenFrame();

    const snap = snapshot({ readPixels: readWebGLPixels }, target);
    expectColorAt(snap, 100, 60, '#00ff00');
  });
});
