import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createCanvasElement } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { M2D } from '../src/core/m2d.js';
import { Scene } from '../src/core/scene.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { SettingsMenu } from '../src/core/ui/settingsMenu.js';

/**
 * Scene setup behaviour: what scene JSON produces, driven through a real M2D.
 *
 * Buttons used to be able to do exactly one thing — switch scenes — which is
 * how the platformer's Settings button shipped pointing at a scene that does
 * not exist, failing as an unhandled rejection inside a click handler.
 * Buttons now also take an `"action"`: `'settings'` opens the mounted
 * settings menu, anything else goes to the scene config's `onAction` hook,
 * and a bad scene switch logs instead of exploding silently.
 */

function displayCanvas(cssWidth, cssHeight) {
  const canvas = createCanvasElement(cssWidth, cssHeight);
  Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight });
  return canvas;
}

/** A UI scene holding one button with the given properties, set up for clicking. */
async function sceneWithButton(game, properties, config = {}) {
  const scene = new Scene(game, {
    type: 'ui',
    elements: [{ type: 'button', x: 640, y: 360, properties: { text: 'Button', ...properties } }],
    ...config
  });
  await scene.setupUIScene();
  const button = [...scene.ui.elements].find(el => el.text === 'Button');
  return { scene, button };
}

describe('scene button actions', () => {
  let game;

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
    game = new M2D(displayCanvas(1280, 720), {
      width: 1280, height: 720, renderer: new RecordingRenderer()
    });
  });

  it("opens the mounted settings menu for action: 'settings'", async () => {
    const menu = new SettingsMenu(game);
    const { button } = await sceneWithButton(game, { action: 'settings' });

    button.onClick();

    expect(menu.isOpen).toBe(true);
  });

  it("warns instead of crashing when action: 'settings' has no menu", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { button } = await sceneWithButton(game, { action: 'settings' });

    expect(() => button.onClick()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no SettingsMenu mounted'));
    warn.mockRestore();
  });

  it('hands any other action to the scene config onAction hook', async () => {
    const onAction = vi.fn();
    const { button } = await sceneWithButton(game, { action: 'credits' }, { onAction });

    button.onClick();

    expect(onAction).toHaveBeenCalledWith('credits');
  });

  it('still switches scenes through onClick', async () => {
    game.sceneManager.switchTo = vi.fn(async () => {});
    const { button } = await sceneWithButton(game, { onClick: 'level1' });

    button.onClick();

    expect(game.sceneManager.switchTo).toHaveBeenCalledWith('level1');
  });

  it('logs a missing scene instead of an unhandled rejection', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { button } = await sceneWithButton(game, { onClick: 'no-such-scene' });

    button.onClick();
    // The rejection is consumed asynchronously; give it a microtask.
    await Promise.resolve().then(() => {});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("cannot switch to scene 'no-such-scene'"),
      expect.any(Error)
    );
    error.mockRestore();
  });

  it('prefers action over onClick when both are present', async () => {
    const menu = new SettingsMenu(game);
    game.sceneManager.switchTo = vi.fn(async () => {});
    const { button } = await sceneWithButton(game, { action: 'settings', onClick: 'level1' });

    button.onClick();

    expect(menu.isOpen).toBe(true);
    expect(game.sceneManager.switchTo).not.toHaveBeenCalled();
  });

  describe('background layer', () => {
    it('tiles the world size, not the display', () => {
      // worldWidth/worldHeight in world units; the display is deliberately a
      // different size so a viewport-derived count would give itself away.
      const worldGame = new M2D(displayCanvas(1280, 720), {
        width: 1280, height: 720, worldWidth: 1600, worldHeight: 1200,
        renderer: new RecordingRenderer()
      });
      const scene = new Scene(worldGame, {
        assets: { spritesheets: { tiles: { url: 'bg.png', frameWidth: 32, frameHeight: 32 } } }
      });
      scene.spriteSheets.set('tiles', new SpriteSheet({ width: 32, height: 32 }, 32, 32, worldGame));

      scene.setupBackground({ spritesheet: 'tiles' });

      const [name, layer] = worldGame.layers.layers[0];
      expect(name).toBe('background');
      // ceil(1600/32) x ceil(1200/32). This used to read the nonexistent
      // `game.width`, so the counts were NaN and the layer came out empty.
      expect(layer.tiles).toHaveLength(50 * 38);

      // Tiles live at fixed world coordinates, covering the far corner too.
      const last = layer.tiles[layer.tiles.length - 1].pos;
      expect(last).toEqual({ x: 49 * 32, y: 37 * 32 });
    });
  });
});
