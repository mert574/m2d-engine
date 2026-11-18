import { describe, it, expect } from 'vitest';
import { WorldOverlay } from '../src/core/ui/worldOverlay.js';

/**
 * The world overlay in three dimensions: lines, paths and arcs — what a
 * debug view draws (a route, a click ring) — are projected point by point
 * through the camera, where before they were dropped. Rects and images
 * stay flat-only. The game here is a stub with a see-through projection
 * (world x/z onto the view, times ten), so the numbers are checkable.
 */

function makeGame() {
  const calls = [];
  const record = (method) => (options) => calls.push({ method, options });
  const game = {
    renderer: { dimensions: 3 },
    viewport: { contentX: 0, contentY: 0, contentWidth: 1000, contentHeight: 1000, uiScale: 1 },
    uiRenderer: {
      pushClip() {}, popClip() {},
      pushTransform() {}, popTransform() {},
      drawPath: record('drawPath'), drawLine: record('drawLine'), drawArc: record('drawArc'), drawRect: record('drawRect')
    },
    // A toy camera: world (x, z) lands at (10x, 10z); anything at y < 0 is "behind the camera".
    worldToUI(x, y, z) {
      if (y < 0) return null;
      return { x: x * 10, y: z * 10 };
    }
  };
  return { game, calls };
}

describe('the world overlay in 3D', () => {
  it('projects a path point by point', () => {
    const { game, calls } = makeGame();
    const overlay = new WorldOverlay(game);
    overlay.drawPath({ points: [{ x: 1, y: 0, z: 2 }, { x: 3, y: 0, z: 4 }, { x: 5, y: 0, z: 6 }], strokeStyle: '#fff', lineWidth: 2 });
    overlay.draw();
    expect(calls).toHaveLength(1);
    expect(calls[0].options.points).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]);
    expect(calls[0].options.lineWidth).toBe(2);
  });

  it('projects a line and an arc, and an arc radius projects unless screenRadius says not to', () => {
    const { game, calls } = makeGame();
    const overlay = new WorldOverlay(game);
    overlay.drawLine({ x1: 1, y1: 0, z1: 1, x2: 2, y2: 0, z2: 2 });
    overlay.drawArc({ x: 4, y: 0, z: 4, radius: 2, startAngle: 0, endAngle: 1 });
    overlay.drawArc({ x: 4, y: 0, z: 4, radius: 7, startAngle: 0, endAngle: 1, screenRadius: true });
    overlay.draw();
    expect(calls.map((c) => c.method)).toEqual(['drawLine', 'drawArc', 'drawArc']);
    expect(calls[0].options).toMatchObject({ x1: 10, y1: 10, x2: 20, y2: 20 });
    expect(calls[1].options.radius).toBe(20); // 2 world units, projected
    expect(calls[2].options.radius).toBe(7); // already UI units
  });

  it('drops what the camera cannot see, and never draws a flat-only shape', () => {
    const { game, calls } = makeGame();
    const overlay = new WorldOverlay(game);
    overlay.drawLine({ x1: 1, y1: -1, z1: 1, x2: 2, y2: 0, z2: 2 }); // one end behind the camera
    overlay.drawPath({ points: [{ x: 1, y: -1, z: 1 }, { x: 2, y: -1, z: 2 }] }); // all behind
    overlay.drawRect({ x: 0, y: 0, width: 10, height: 10 }); // flat-only
    overlay.draw();
    expect(calls).toHaveLength(0);
  });
});
