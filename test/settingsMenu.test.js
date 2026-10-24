import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createCanvasElement } from './helpers/environment.js';
import { M2D } from '../src/core/m2d.js';
import { SettingsMenu } from '../src/core/ui/settingsMenu.js';

/**
 * The settings overlay every example mounts: resolution, fullscreen, aspect.
 *
 * These tests drive the menu through a real M2D instance with the Canvas
 * backend, using the public handleMouseDown/handleMouseMove entry points (the
 * DOM listeners are thin wrappers over them).
 */

function displayCanvas(cssWidth, cssHeight) {
  const canvas = createCanvasElement(cssWidth, cssHeight);
  Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight });
  return canvas;
}

function makeGameWithMenu(options = {}) {
  const game = new M2D(displayCanvas(1280, 720), {
    width: 1280, height: 720, renderer: 'canvas', ...options
  });
  const menu = new SettingsMenu(game);
  return { game, menu };
}

/** Open the menu and draw once so its hit rects exist. */
function openAndLayout(game, menu) {
  menu.toggle();
  game.drawOverlays();
}

/** Centre of a row's hit rect. */
function rowCentre(menu, index) {
  const r = menu.rows[index].rect;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

describe('SettingsMenu', () => {
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
  });

  it('registers itself as an engine overlay', () => {
    const { game, menu } = makeGameWithMenu();
    expect(game.overlays.has(menu)).toBe(true);
  });

  it('draws nothing and consumes nothing while closed', () => {
    const { game, menu } = makeGameWithMenu();
    game.drawOverlays();
    expect(menu.rows).toHaveLength(0);
    expect(menu.handleMouseDown(640, 360)).toBe(false);
  });

  it('lays out hit rects for every row when open', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);
    // Resolution, Fullscreen, Aspect, Close.
    expect(menu.rows).toHaveLength(4);
  });

  it('cycles the resolution presets on click, world surface only', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    // native -> 1 -> 0.75 -> 0.5 -> 0.25 -> native
    const expected = [1280, 960, 640, 320];
    for (const width of expected) {
      menu.handleMouseDown(rowCentre(menu, 0).x, rowCentre(menu, 0).y);
      expect(game.resolution).not.toBe('native');
      expect(game.viewport.worldWidth).toBe(width);
      // The point of the setting: the visible world never changes.
      expect(game.camera.width).toBe(1280);
    }
    menu.handleMouseDown(rowCentre(menu, 0).x, rowCentre(menu, 0).y);
    expect(game.resolution).toBe('native');
  });

  it('toggles the aspect mode on click', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    menu.handleMouseDown(rowCentre(menu, 2).x, rowCentre(menu, 2).y);
    expect(game.aspectMode).toBe('expand');
    menu.handleMouseDown(rowCentre(menu, 2).x, rowCentre(menu, 2).y);
    expect(game.aspectMode).toBe('letterbox');
  });

  it('consumes clicks outside the panel and closes', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    expect(menu.handleMouseDown(5, 5)).toBe(true);
    expect(menu.open).toBe(false);
  });

  it('closes via the Close row', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);
    menu.handleMouseDown(rowCentre(menu, 3).x, rowCentre(menu, 3).y);
    expect(menu.open).toBe(false);
  });

  it('stays centred when the UI space is wider than the design', () => {
    const game = new M2D(displayCanvas(2100, 900), { width: 1280, height: 720, renderer: 'canvas' });
    const menu = new SettingsMenu(game);
    openAndLayout(game, menu);

    const panel = menu.panelRect;
    const centre = panel.x + panel.width / 2;
    expect(centre).toBeCloseTo(game.uiRenderer.width / 2, 5);
  });

  it('unregisters everything on destroy', () => {
    const { game, menu } = makeGameWithMenu();
    menu.destroy();
    expect(game.overlays.has(menu)).toBe(false);
    expect(game.keys.keys.has('o')).toBe(false);
  });

  it('is torn down by game.destroy()', () => {
    const { game, menu } = makeGameWithMenu();
    game.destroy();
    expect(game.overlays.size).toBe(0);
    expect(game.keys.keys.has('o')).toBe(false);
  });
});
