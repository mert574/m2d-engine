import { describe, it, expect } from 'vitest';
import * as mat from '../src/core/renderers/geometry/matrix.js';
import { parseColor, parseColorPremultiplied } from '../src/core/renderers/geometry/color.js';
import { strokePolyline } from '../src/core/renderers/geometry/polyline.js';
import { arcPoints, roundRectPoints, triangulate, signedArea, fanIndices } from '../src/core/renderers/geometry/shapes.js';
import { bakeGradient, GRADIENT_LUT_SIZE } from '../src/core/renderers/geometry/gradient.js';

/**
 * The GPU backends' API-neutral geometry layer. Pure functions, so these run
 * in the fast node project even though the backend itself needs a browser.
 */
describe('geometry: matrix', () => {
  it('composes translate, rotate and scale in Canvas order', () => {
    const m = mat.fromTransform({ x: 10, y: 20, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 });
    const [x, y] = mat.apply(m, 1, 0);
    // Scale (2,0) → rotate 90° (0,2) → translate (10,22)
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(22);
  });

  it('multiplies so the right-hand matrix applies first', () => {
    const t = mat.translation(5, 0);
    const s = mat.scaling(2, 2);
    expect(mat.apply(mat.multiply(t, s), 1, 1)).toEqual([7, 2]);
    expect(mat.apply(mat.multiply(s, t), 1, 1)).toEqual([12, 2]);
  });
});

describe('geometry: colour', () => {
  it.each([
    ['#f00', [1, 0, 0, 1]],
    ['#ff000080', [1, 0, 0, 128 / 255]],
    ['rgb(0, 255, 0)', [0, 1, 0, 1]],
    ['rgba(0,0,255,0.5)', [0, 0, 1, 0.5]],
    ['transparent', [0, 0, 0, 0]],
    ['CornflowerBlue', [100 / 255, 149 / 255, 237 / 255, 1]]
  ])('parses %s', (input, expected) => {
    const actual = parseColor(input);
    expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 5));
  });

  it('premultiplies alpha', () => {
    expect(parseColorPremultiplied('rgba(255,255,255,0.5)')).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('rejects colours it cannot represent', () => {
    expect(() => parseColor('hsl(0, 100%, 50%)')).toThrowError(/Unsupported colour/);
  });
});

describe('geometry: strokes', () => {
  it('extrudes a segment into a quad of the requested width', () => {
    const { positions, indices } = strokePolyline([0, 0, 10, 0], false, 4);
    expect(indices).toHaveLength(6);
    const ys = positions.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-2);
    expect(Math.max(...ys)).toBeCloseTo(2);
    // Butt caps: nothing beyond the endpoints.
    const xs = positions.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(10);
  });

  it('adds join geometry at corners and for closed paths', () => {
    const open = strokePolyline([0, 0, 10, 0, 10, 10], false, 2);
    const closed = strokePolyline([0, 0, 10, 0, 10, 10], true, 2);
    expect(open.indices.length).toBeGreaterThan(12);
    expect(closed.indices.length).toBeGreaterThan(open.indices.length);
  });

  it('ignores degenerate input', () => {
    expect(strokePolyline([5, 5], false, 2).indices).toHaveLength(0);
    expect(strokePolyline([5, 5, 5, 5], false, 2).indices).toHaveLength(0);
  });
});

describe('geometry: shapes', () => {
  it('samples a full circle without a duplicated closing point', () => {
    const { points, full } = arcPoints(0, 0, 10);
    expect(full).toBe(true);
    const n = points.length / 2;
    expect(points[0]).toBeCloseTo(10);
    expect(Math.hypot(points[2 * (n - 1)] - 10, points[2 * (n - 1) + 1])).toBeGreaterThan(0.1);
  });

  it('samples a partial arc from start to end, clockwise in screen space', () => {
    const { points, full } = arcPoints(0, 0, 10, 0, Math.PI / 2);
    expect(full).toBe(false);
    expect(points[0]).toBeCloseTo(10);
    expect(points[1]).toBeCloseTo(0);
    expect(points[points.length - 2]).toBeCloseTo(0);
    expect(points[points.length - 1]).toBeCloseTo(10);
  });

  it('returns four corners for an unrounded rect and clamps large radii', () => {
    expect(roundRectPoints(0, 0, 10, 20, 0)).toEqual([0, 0, 10, 0, 10, 20, 0, 20]);
    const rounded = roundRectPoints(0, 0, 10, 20, 50);
    expect(Math.abs(signedArea(rounded))).toBeLessThan(10 * 20);
    expect(Math.abs(signedArea(rounded))).toBeGreaterThan(Math.PI * 25 * 0.9);
  });

  it('triangulates a concave polygon', () => {
    // An L shape: 6 vertices → 4 triangles, total area preserved.
    const L = [0, 0, 20, 0, 20, 10, 10, 10, 10, 20, 0, 20];
    const indices = triangulate(L);
    expect(indices).toHaveLength(12);
    let area = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const tri = [0, 1, 2].flatMap(k => [L[2 * indices[i + k]], L[2 * indices[i + k] + 1]]);
      area += Math.abs(signedArea(tri));
    }
    expect(area).toBeCloseTo(300);
  });

  it('builds a fan for convex outlines', () => {
    expect(fanIndices(4)).toEqual([0, 1, 2, 0, 2, 3]);
  });
});

describe('geometry: gradients', () => {
  it('bakes stops into a premultiplied ramp', () => {
    const lut = bakeGradient([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: 'rgba(0,0,255,0)' }
    ]);
    expect(lut).toHaveLength(GRADIENT_LUT_SIZE * 4);
    expect([...lut.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    const last = (GRADIENT_LUT_SIZE - 1) * 4;
    expect([...lut.slice(last, last + 4)]).toEqual([0, 0, 0, 0]);
    const mid = Math.floor(GRADIENT_LUT_SIZE / 2) * 4;
    expect(lut[mid + 3]).toBeGreaterThan(100);
    expect(lut[mid + 3]).toBeLessThan(156);
  });
});
