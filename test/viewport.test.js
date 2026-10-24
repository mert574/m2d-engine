import { describe, it, expect } from 'vitest';
import { computeViewport, identityViewport, mapPointer, viewToUI, sameResolution, MAX_PIXEL_RATIO } from '../src/core/viewport.js';

/**
 * Viewport sizing: the contract that keeps the three resolutions independent.
 *
 * The properties that matter to a game are:
 * - the render resolution never changes how much world is visible;
 * - the UI always covers the whole display, at the display's pixel density;
 * - only the aspect ratio can reveal more world, and only when asked to.
 */
describe('viewport', () => {
  const design = { designWidth: 1280, designHeight: 720 };

  describe('render resolution', () => {
    it('does not change how much world is visible', () => {
      const high = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, resolution: 'native' });
      const low = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, resolution: { width: 640, height: 360 } });

      // The whole point: a resolution setting is fidelity, not zoom.
      expect(low.viewWidth).toBe(high.viewWidth);
      expect(low.viewHeight).toBe(high.viewHeight);
      expect(low.worldWidth).toBe(640);
      expect(low.worldHeight).toBe(360);
    });

    it('leaves the UI at full display resolution however coarse the world is', () => {
      const v = computeViewport({
        ...design, displayWidth: 1280, displayHeight: 720,
        resolution: { width: 320, height: 180 }
      });

      expect(v.worldHeight).toBe(180);
      // UI still spans the whole backing store, one unit per display pixel.
      expect(v.uiScale).toBe(1);
      expect(v.uiWidth * v.uiScale).toBe(v.backingWidth);
      expect(v.uiHeight * v.uiScale).toBe(v.backingHeight);
    });

    it('accepts a scale factor as well as a preset', () => {
      const v = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, resolution: 0.5 });
      expect(v.worldWidth).toBe(640);
      expect(v.worldHeight).toBe(360);
      expect(v.viewWidth).toBe(1280);
    });

    it("renders one world pixel per presented pixel at 'native'", () => {
      const v = computeViewport({
        ...design, displayWidth: 1280, displayHeight: 720, pixelRatio: 2, resolution: 'native'
      });
      expect(v.worldWidth).toBe(v.contentWidth);
      expect(v.worldHeight).toBe(v.contentHeight);
    });
  });

  describe('device pixel ratio', () => {
    it('scales the backing store so everything rasterizes sharp', () => {
      const v = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, pixelRatio: 2 });
      expect(v.backingWidth).toBe(2560);
      expect(v.backingHeight).toBe(1440);
      expect(v.viewWidth).toBe(1280);
      expect(v.uiScale).toBe(2);
    });

    it('caps absurd ratios and never goes below 1', () => {
      const high = computeViewport({ ...design, displayWidth: 100, displayHeight: 100, pixelRatio: 12 });
      const low = computeViewport({ ...design, displayWidth: 100, displayHeight: 100, pixelRatio: 0.5 });
      expect(high.pixelRatio).toBe(MAX_PIXEL_RATIO);
      expect(low.pixelRatio).toBe(1);
    });
  });

  describe('letterbox mode', () => {
    it('keeps the designed view and centres it with bars', () => {
      // 16:9 design on a 21:9 display.
      const v = computeViewport({ ...design, displayWidth: 2100, displayHeight: 900, aspectMode: 'letterbox' });

      expect(v.viewWidth).toBe(1280);
      expect(v.viewHeight).toBe(720);
      expect(v.contentHeight).toBe(900);
      expect(v.contentWidth).toBeCloseTo(1600, 5);
      // Bars split evenly, so nothing past the designed view is revealed.
      expect(v.contentX).toBeCloseTo((2100 - 1600) / 2, 5);
      expect(v.contentY).toBe(0);
    });

    it('still lets the UI cover the whole display', () => {
      const v = computeViewport({ ...design, displayWidth: 2100, displayHeight: 900, aspectMode: 'letterbox' });

      expect(v.uiHeight).toBe(720);
      expect(v.uiWidth).toBeCloseTo(1680, 5); // wider than the design box
      expect(v.uiWidth * v.uiScale).toBeCloseTo(v.backingWidth, 5);
    });
  });

  describe('expand mode', () => {
    it('widens the view so more world is visible', () => {
      const v = computeViewport({ ...design, displayWidth: 2100, displayHeight: 900, aspectMode: 'expand' });

      expect(v.viewHeight).toBe(720);
      expect(v.viewWidth).toBeCloseTo(1680, 5);
      // No bars: the world fills the display.
      expect(v.contentX).toBe(0);
      expect(v.contentY).toBe(0);
      expect(v.contentWidth).toBe(2100);
    });

    it('matches letterbox exactly at the design aspect ratio', () => {
      const box = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, aspectMode: 'letterbox' });
      const exp = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, aspectMode: 'expand' });
      expect(exp).toEqual(box);
    });
  });

  describe('degenerate input', () => {
    it('falls back to the design size for a zero-sized canvas', () => {
      const v = computeViewport({ ...design, displayWidth: 0, displayHeight: 0 });
      expect(v.backingWidth).toBe(1280);
      expect(v.backingHeight).toBe(720);
    });
  });

  describe('identityViewport', () => {
    it('scales nothing anywhere', () => {
      const v = identityViewport(320, 240);
      expect(v.viewWidth).toBe(320);
      expect(v.worldWidth).toBe(320);
      expect(v.uiWidth).toBe(320);
      expect(v.backingWidth).toBe(320);
      expect(v.uiScale).toBe(1);
      expect(v.worldScale).toBe(1);
      expect(v.contentX).toBe(0);
    });
  });

  describe('mapPointer', () => {
    const rect = (width, height) => ({ left: 0, top: 0, width, height });

    it('maps the centre of an unscaled canvas to the centre of both spaces', () => {
      const viewport = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720 });
      const p = mapPointer({ clientX: 640, clientY: 360, rect: rect(1280, 720), viewport });

      expect(p.ui.x).toBeCloseTo(640, 5);
      expect(p.view.x).toBeCloseTo(640, 5);
      expect(p.view.y).toBeCloseTo(360, 5);
      expect(p.inContent).toBe(true);
    });

    it('accounts for the devicePixelRatio', () => {
      const viewport = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720, pixelRatio: 2 });
      const p = mapPointer({ clientX: 640, clientY: 360, rect: rect(1280, 720), viewport });

      // UI and world coordinates are density-independent.
      expect(p.ui.x).toBeCloseTo(640, 5);
      expect(p.view.x).toBeCloseTo(640, 5);
    });

    it('reports letterbox bars as outside the world content', () => {
      const viewport = computeViewport({ ...design, displayWidth: 2100, displayHeight: 900, aspectMode: 'letterbox' });
      const bar = mapPointer({ clientX: 10, clientY: 450, rect: rect(2100, 900), viewport });
      const inside = mapPointer({ clientX: 1050, clientY: 450, rect: rect(2100, 900), viewport });

      expect(bar.inContent).toBe(false);
      expect(inside.inContent).toBe(true);
      // The UI covers the bars, so a click there is still a valid UI point.
      expect(bar.ui.x).toBeGreaterThanOrEqual(0);
      expect(bar.ui.x).toBeLessThan(viewport.uiWidth);
    });

    it('corrects for a CSS-letterboxed bounding rect', () => {
      // object-fit: contain inside a rect that is taller than the canvas: the
      // drawn area is 800x450 centred vertically in an 800x600 box.
      const viewport = computeViewport({ ...design, displayWidth: 1280, displayHeight: 720 });
      const p = mapPointer({ clientX: 400, clientY: 300, rect: rect(800, 600), viewport });

      // The rect's centre is still the view's centre despite the CSS bars...
      expect(p.view.x).toBeCloseTo(640, 5);
      expect(p.view.y).toBeCloseTo(360, 5);

      // ...and the top of the rect is above the drawn area, so it maps
      // outside the view rather than onto its first row.
      const top = mapPointer({ clientX: 400, clientY: 0, rect: rect(800, 600), viewport });
      expect(top.view.y).toBeLessThan(0);
    });

    it('maps the right edge to the right edge of UI space at any aspect', () => {
      for (const [w, h] of [[1280, 720], [2100, 900], [900, 900]]) {
        const viewport = computeViewport({ ...design, displayWidth: w, displayHeight: h });
        const p = mapPointer({ clientX: w, clientY: h / 2, rect: rect(w, h), viewport });
        expect(p.ui.x).toBeCloseTo(viewport.uiWidth, 5);
      }
    });
  });

  describe('sameResolution', () => {
    it('matches object presets structurally', () => {
      expect(sameResolution({ width: 640, height: 360 }, { width: 640, height: 360 })).toBe(true);
      expect(sameResolution({ width: 640, height: 360 }, { width: 320, height: 180 })).toBe(false);
    });

    it("treats 'native' and null as the same setting", () => {
      expect(sameResolution('native', null)).toBe(true);
      expect(sameResolution(undefined, 'native')).toBe(true);
      expect(sameResolution('native', 0.5)).toBe(false);
      expect(sameResolution('native', { width: 640, height: 360 })).toBe(false);
    });

    it('compares scale factors by value', () => {
      expect(sameResolution(0.5, 0.5)).toBe(true);
      expect(sameResolution(0.5, 0.25)).toBe(false);
    });
  });

  describe('viewToUI', () => {
    const rect = (width, height) => ({ left: 0, top: 0, width, height });

    it('is the inverse of mapPointer across aspects, DPRs and resolutions', () => {
      const cases = [
        { displayWidth: 1280, displayHeight: 720 },
        { displayWidth: 2100, displayHeight: 900 }, // letterbox bars left/right
        { displayWidth: 900, displayHeight: 900 },  // bars top/bottom
        { displayWidth: 1280, displayHeight: 720, pixelRatio: 2 },
        { displayWidth: 1280, displayHeight: 720, resolution: 0.25 },
        { displayWidth: 2100, displayHeight: 900, aspectMode: 'expand' }
      ];

      for (const params of cases) {
        const viewport = computeViewport({ ...design, ...params });
        const p = mapPointer({
          clientX: 700, clientY: 400,
          rect: rect(params.displayWidth, params.displayHeight),
          viewport
        });

        // A pointer mapped into view space and projected back must land on the
        // same UI point — this is what pins a label to the thing under it.
        const ui = viewToUI({ x: p.view.x, y: p.view.y, viewport });
        expect(ui.x).toBeCloseTo(p.ui.x, 5);
        expect(ui.y).toBeCloseTo(p.ui.y, 5);
      }
    });

    it('offsets by the letterbox bars, not a 1:1 copy', () => {
      const viewport = computeViewport({ ...design, displayWidth: 2100, displayHeight: 900 });
      const origin = viewToUI({ x: 0, y: 0, viewport });

      // The view's origin sits at the content rect's corner in UI units.
      expect(origin.x).toBeCloseTo(viewport.contentX / viewport.uiScale, 5);
      expect(origin.x).toBeGreaterThan(0);
      expect(origin.y).toBeCloseTo(0, 5);
    });

    it('does not move with the render resolution', () => {
      const base = { ...design, displayWidth: 1280, displayHeight: 720 };
      const native = viewToUI({ x: 300, y: 200, viewport: computeViewport(base) });
      const coarse = viewToUI({ x: 300, y: 200, viewport: computeViewport({ ...base, resolution: 0.25 }) });

      expect(coarse).toEqual(native);
    });
  });
});
