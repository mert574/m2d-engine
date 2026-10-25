import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createCanvasElement } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { M2D } from '../src/core/m2d.js';

/**
 * Engine pause (`game.paused`): the simulation freezes, the presentation
 * does not. That split is what lets the settings menu sit over a crisp,
 * frozen frame — and what the menu's Paused row and `pauseWhenOpen` rely on.
 */

function displayCanvas(cssWidth, cssHeight) {
  const canvas = createCanvasElement(cssWidth, cssHeight);
  Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight });
  return canvas;
}

describe('engine pause', () => {
  let game;
  let renderer;
  let scene;

  beforeAll(() => {
    globalThis.document.addEventListener ??= () => {};
    globalThis.document.removeEventListener ??= () => {};
  });

  beforeEach(() => {
    globalThis.window = {
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};

    renderer = new RecordingRenderer();
    game = new M2D(displayCanvas(1280, 720), { width: 1280, height: 720, renderer });
    scene = { update: vi.fn(), draw: vi.fn(), drawUI: vi.fn() };
    game.sceneManager.currentScene = scene;
    game.sceneManager.loading = false;
  });

  /** Two update ticks: the first only establishes lastTime. */
  function runFrame() {
    game.update(1000);
    renderer.reset();
    game.update(1016);
  }

  it('starts unpaused and simulates normally', () => {
    runFrame();

    expect(game.paused).toBe(false);
    expect(scene.update).toHaveBeenCalled();
    expect(scene.draw).toHaveBeenCalled();
  });

  it('freezes the simulation but keeps presenting while paused', () => {
    game.paused = true;
    runFrame();

    // No simulation...
    expect(scene.update).not.toHaveBeenCalled();
    // ...but the frame is still drawn, world pass and UI pass alike, so the
    // frozen game stays visible under overlays.
    expect(scene.draw).toHaveBeenCalled();
    expect(scene.drawUI).toHaveBeenCalled();
    expect(renderer.callsTo('beginFrame')).toHaveLength(1);
  });

  it('does not move the camera while paused', () => {
    game.camera.follow({ body: { position: { x: 5000, y: 3000 } } });
    const before = { x: game.camera.x, y: game.camera.y };

    game.paused = true;
    runFrame();

    expect(game.camera.x).toBe(before.x);
    expect(game.camera.y).toBe(before.y);
  });

  it('resumes without a time jump', () => {
    game.paused = true;
    game.update(1000);
    game.update(5000); // a long pause

    game.paused = false;
    scene.update.mockClear();
    game.update(5016);

    // lastTime advanced during the pause, so the first live frame steps by
    // one frame's worth, not by the whole paused stretch.
    expect(scene.update).toHaveBeenCalledWith(expect.closeTo(0.016, 3));
  });
});
