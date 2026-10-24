import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createCanvasElement } from './helpers/environment.js';
import { M2D } from '../src/core/m2d.js';
import { UIElement } from '../src/core/ui/uiElement.js';

/**
 * Fullscreen and resize lifecycle.
 *
 * The roadmap's requirement is that entering, leaving and repeating resizes
 * preserve aspect ratio, camera coordinates, input mapping and UI hit
 * testing. These tests drive the engine's resize path directly, with a canvas
 * whose displayed size can be changed.
 */

/** A canvas whose CSS size can be set, so resizes can be simulated. */
function displayCanvas(cssWidth, cssHeight) {
  const canvas = createCanvasElement(cssWidth, cssHeight);
  setDisplaySize(canvas, cssWidth, cssHeight);
  return canvas;
}

function setDisplaySize(canvas, width, height) {
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height });
}

function makeGame(canvas, options = {}) {
  return new M2D(canvas, { width: 1280, height: 720, renderer: 'canvas', ...options });
}

describe('resize lifecycle', () => {
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

  describe('camera coordinates', () => {
    it('keeps the view size fixed across repeated resizes in letterbox mode', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);

      for (const [w, h] of [[1920, 1080], [800, 450], [2100, 900], [1280, 720]]) {
        setDisplaySize(canvas, w, h);
        game.resize();
        expect(game.camera.width).toBe(1280);
        expect(game.camera.height).toBe(720);
      }
    });

    it('keeps a world point under the same screen point after a resize', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);
      game.camera.x = 5000;
      game.camera.y = 3000;

      const before = game.camera.worldToScreen(5000, 3000);
      setDisplaySize(canvas, 2560, 1440);
      game.resize();
      const after = game.camera.worldToScreen(5000, 3000);

      // The camera is centred on its position, so the centre is invariant.
      expect(after).toEqual(before);
    });

    it('widens the view only in expand mode', () => {
      const canvas = displayCanvas(2100, 900);

      const boxed = makeGame(canvas, { aspectMode: 'letterbox' });
      expect(boxed.camera.width).toBe(1280);

      const expanded = makeGame(canvas, { aspectMode: 'expand' });
      expect(expanded.camera.width).toBeCloseTo(1680, 5);
      expect(expanded.camera.height).toBe(720);
    });

    it('centres a bounded camera when expand makes the view wider than the bounds', () => {
      // A fixed-board game (maze): the board is exactly one view, with camera
      // bounds to match. In expand mode on a wide display the view outgrows
      // the board, which inverts the clamp limits — the camera must centre on
      // the board, not pin to whichever limit wins.
      const canvas = displayCanvas(2100, 900);
      const game = makeGame(canvas, { width: 640, height: 480, aspectMode: 'expand' });
      game.camera.bounds = { left: 0, top: 0, right: 640, bottom: 480 };
      game.camera.follow({ body: { position: { x: 600, y: 400 } } });

      for (let i = 0; i < 50; i++) game.camera.update();

      expect(game.camera.width).toBeGreaterThan(640);
      expect(game.camera.x).toBe(320);
      // The vertical span still fits exactly, so normal clamping applies.
      expect(game.camera.y).toBeCloseTo(240, 5);
    });
  });

  describe('render resolution', () => {
    it('changes the world surface without moving the camera', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);

      game.setResolution({ width: 640, height: 360 });

      // Visible world is untouched — no accidental zoom-out past the map edge.
      expect(game.camera.width).toBe(1280);
      expect(game.camera.height).toBe(720);
      expect(game.viewport.worldWidth).toBe(640);
      // The UI keeps the display's full resolution.
      expect(game.viewport.uiWidth).toBe(1280);
      expect(game.viewport.backingWidth).toBe(1280);
    });

    it('survives a round trip back to native', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);
      const native = game.viewport.worldWidth;

      game.setResolution(0.25);
      game.setResolution('native');

      expect(game.viewport.worldWidth).toBe(native);
    });

    // The option used to reach the Canvas backend and be dropped silently by
    // the WebGL one, so pin that it arrives and that it can change later.
    it('passes the world filter through to the backend', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas, { worldFilter: 'nearest' });

      expect(game.renderer.worldFilter).toBe('nearest');
      expect(game.worldFilter).toBe('nearest');

      game.setWorldFilter('linear');
      expect(game.renderer.worldFilter).toBe('linear');
    });

    it('defaults the world filter to linear and ignores unknown values', () => {
      const game = makeGame(displayCanvas(1280, 720));
      expect(game.worldFilter).toBe('linear');

      game.setWorldFilter('bicubic');
      expect(game.worldFilter).toBe('linear');
    });
  });

  describe('input mapping', () => {
    it('maps a click to the same world point at any display size', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);

      const at = () => game.getMousePosition({ clientX: 320, clientY: 180 });
      const expected = at();

      for (const [w, h] of [[2560, 1440], [640, 360]]) {
        setDisplaySize(canvas, w, h);
        game.resize();
        const scaled = game.getMousePosition({ clientX: 320 * (w / 1280), clientY: 180 * (h / 720) });
        expect(scaled.x).toBeCloseTo(expected.x, 5);
        expect(scaled.y).toBeCloseTo(expected.y, 5);
      }
    });

    it('is unaffected by the render resolution', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);

      const before = game.getMousePosition({ clientX: 400, clientY: 300 });
      game.setResolution({ width: 320, height: 180 });
      const after = game.getMousePosition({ clientX: 400, clientY: 300 });

      expect(after).toEqual(before);
    });

    it('maps the display corner to the UI corner at a non-design aspect', () => {
      const canvas = displayCanvas(2100, 900);
      const game = makeGame(canvas);

      const corner = game.getUIPosition({ clientX: 2100, clientY: 900 });
      expect(corner.x).toBeCloseTo(game.uiRenderer.width, 5);
      expect(corner.y).toBeCloseTo(game.uiRenderer.height, 5);
    });
  });

  describe('UI hit testing', () => {
    it('keeps an anchored element clickable at its edge after a resize', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);

      const button = new UIElement(-50, -30, 80, 40, { anchor: 'bottom-right' });
      button.setGame(game);

      // Click where the element should visibly be: 50 x 40 UI units in from
      // the real bottom-right corner of the display.
      const clickBottomRight = () => {
        const cssPerUnit = game.viewport.uiScale / game.viewport.pixelRatio;
        const p = game.getUIPosition({
          clientX: canvas.clientWidth - 50 * cssPerUnit,
          clientY: canvas.clientHeight - 30 * cssPerUnit
        });
        return button.contains(p.x, p.y);
      };

      expect(clickBottomRight()).toBe(true);
      for (const [w, h] of [[2100, 900], [900, 900], [1280, 720]]) {
        setDisplaySize(canvas, w, h);
        game.resize();
        expect(clickBottomRight()).toBe(true);
      }
    });

    it('does not hit an element the pointer is nowhere near', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);

      const button = new UIElement(-50, -30, 80, 40, { anchor: 'bottom-right' });
      button.setGame(game);

      const p = game.getUIPosition({ clientX: 10, clientY: 10 });
      expect(button.contains(p.x, p.y)).toBe(false);
    });
  });

  describe('notification', () => {
    it('reports the view size to subscribers', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas, { aspectMode: 'expand' });
      const seen = [];
      game.onResize((w, h) => seen.push([w, h]));

      setDisplaySize(canvas, 2100, 900);
      game.resize();

      expect(seen).toHaveLength(1);
      expect(seen[0][0]).toBeCloseTo(1680, 5);
      expect(seen[0][1]).toBe(720);
    });

    it('stops notifying after unsubscribe', () => {
      const canvas = displayCanvas(1280, 720);
      const game = makeGame(canvas);
      const handler = vi.fn();
      const off = game.onResize(handler);

      setDisplaySize(canvas, 800, 450);
      game.resize();
      expect(handler).toHaveBeenCalledTimes(1);

      off();
      setDisplaySize(canvas, 640, 360);
      game.resize();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('ignores a resize that changes nothing', () => {
      // The engine sets canvas.width from the measured size, so acting on an
      // unchanged measurement would let a ResizeObserver feed itself.
      const game = makeGame(displayCanvas(1280, 720));
      const handler = vi.fn();
      game.onResize(handler);

      game.resize();
      game.resize();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('teardown', () => {
    it('removes the display listeners it registered', () => {
      const removals = [];
      globalThis.window = {
        devicePixelRatio: 1,
        addEventListener: () => {},
        removeEventListener: (type) => removals.push(type)
      };
      const added = [];
      globalThis.document.addEventListener = (type) => added.push(type);
      globalThis.document.removeEventListener = (type) => removals.push(type);

      const game = makeGame(displayCanvas(1280, 720));
      expect(added).toContain('fullscreenchange');

      game.destroy();

      // Without a ResizeObserver the engine falls back to window 'resize'.
      expect(removals).toContain('fullscreenchange');
      expect(removals).toContain('resize');
    });

    it('releases the renderer', () => {
      const game = makeGame(displayCanvas(1280, 720));
      game.destroy();
      expect(game.renderer.canvas).toBeNull();
    });

    // These listeners were bound inline with `.bind(this)`, so there was no
    // stable reference to remove and every destroyed game left a pair of
    // document listeners behind, still holding the whole engine alive.
    it('removes the input and audio listeners it registered', () => {
      const live = new Set();
      globalThis.document.addEventListener = (type, handler) => live.add(handler);
      globalThis.document.removeEventListener = (type, handler) => live.delete(handler);

      const game = makeGame(displayCanvas(1280, 720));
      const added = live.size;
      expect(added).toBeGreaterThan(0);

      game.destroy();

      expect(live.size).toBe(0);
    });

    it('stops audio so a destroyed game cannot keep playing', () => {
      const game = makeGame(displayCanvas(1280, 720));
      const track = { loop: true, paused: false, currentTime: 12, volume: 1, pause() { this.paused = true; } };
      game.soundManager.music.set('theme', track);
      game.soundManager.currentMusic = track;

      game.destroy();

      expect(track.paused).toBe(true);
      expect(game.soundManager.music.size).toBe(0);
    });

    it('leaves key bindings inert rather than firing into a dead game', () => {
      const game = makeGame(displayCanvas(1280, 720));
      let fired = false;
      game.keys.addKey('x', () => { fired = true; });

      game.destroy();
      // Even if a stray event reaches the handler, there is nothing bound.
      game.keys.handleKeyDown({ key: 'x' });

      expect(fired).toBe(false);
      expect(game.keys.keys.size).toBe(0);
    });
  });
});
