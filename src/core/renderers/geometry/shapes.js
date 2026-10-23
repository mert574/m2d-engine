/**
 * Outline sampling and triangulation for the renderer's shape primitives.
 * All functions work on flat [x0, y0, x1, y1, ...] arrays.
 */

const TWO_PI = Math.PI * 2;

/**
 * Sample an arc the way Canvas 2D `arc(x, y, r, start, end)` traces it
 * (clockwise in screen space, i.e. increasing angle with y down).
 * @returns {{points: number[], full: boolean}} `full` when it is a whole circle
 */
export function arcPoints(x, y, radius, startAngle = 0, endAngle = TWO_PI) {
  let sweep = endAngle - startAngle;
  let full = false;
  if (sweep >= TWO_PI) {
    sweep = TWO_PI;
    full = true;
  } else if (sweep < 0) {
    sweep = (sweep % TWO_PI + TWO_PI) % TWO_PI;
  }

  const segments = arcSegments(radius, sweep);
  const points = [];
  // For a full circle the last point would coincide with the first.
  const count = full ? segments : segments + 1;
  for (let i = 0; i < count; i++) {
    const a = startAngle + (sweep * i) / segments;
    points.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  return { points, full };
}

export function arcSegments(radius, sweep) {
  const perRadian = Math.max(2, Math.ceil(Math.sqrt(Math.max(radius, 1)) * 2.5));
  return Math.min(256, Math.max(8, Math.ceil(Math.abs(sweep) * perRadian)));
}

/**
 * Outline of a rectangle with (optionally per-corner) rounded corners,
 * following Canvas 2D `roundRect` radius semantics.
 * @param {number|number[]} radius - Scalar or [tl, tr, br, bl]
 */
export function roundRectPoints(x, y, width, height, radius = 0) {
  let [tl, tr, br, bl] = normalizeRadii(radius);
  const limit = Math.min(width, height) / 2;
  tl = Math.min(tl, limit); tr = Math.min(tr, limit);
  br = Math.min(br, limit); bl = Math.min(bl, limit);

  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return [x, y, x + width, y, x + width, y + height, x, y + height];
  }

  const points = [];
  corner(points, x + width - tr, y + tr, tr, -Math.PI / 2, 0);
  corner(points, x + width - br, y + height - br, br, 0, Math.PI / 2);
  corner(points, x + bl, y + height - bl, bl, Math.PI / 2, Math.PI);
  corner(points, x + tl, y + tl, tl, Math.PI, Math.PI * 1.5);
  return points;
}

function corner(points, cx, cy, r, from, to) {
  if (r <= 0) {
    points.push(cx, cy);
    return;
  }
  const segments = Math.max(4, Math.ceil(arcSegments(r, to - from)));
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments;
    points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

function normalizeRadii(radius) {
  if (typeof radius === 'number') return [radius, radius, radius, radius];
  if (!Array.isArray(radius) || radius.length === 0) return [0, 0, 0, 0];
  if (radius.length === 1) return [radius[0], radius[0], radius[0], radius[0]];
  if (radius.length === 2) return [radius[0], radius[1], radius[0], radius[1]];
  if (radius.length === 3) return [radius[0], radius[1], radius[2], radius[1]];
  return [radius[0], radius[1], radius[2], radius[3]];
}

/** Triangle-fan indices for a convex polygon of n points. */
export function fanIndices(n, base = 0) {
  const indices = [];
  for (let i = 1; i < n - 1; i++) indices.push(base, base + i, base + i + 1);
  return indices;
}

/**
 * Ear-clipping triangulation for a simple (possibly concave) polygon.
 * @returns {number[]} Indices into the point list
 */
export function triangulate(points) {
  const n = points.length / 2;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  const area = signedArea(points);
  if (Math.abs(area) < 1e-12) return [];
  const ccw = area > 0;

  const remaining = [];
  for (let i = 0; i < n; i++) remaining.push(i);
  const indices = [];
  let guard = 0;

  while (remaining.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const i0 = remaining[(i - 1 + remaining.length) % remaining.length];
      const i1 = remaining[i];
      const i2 = remaining[(i + 1) % remaining.length];
      if (!isConvex(points, i0, i1, i2, ccw)) continue;
      if (containsAnyPoint(points, remaining, i0, i1, i2)) continue;
      indices.push(i0, i1, i2);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate input; emit what we have
  }
  if (remaining.length === 3) indices.push(remaining[0], remaining[1], remaining[2]);
  return indices;
}

export function signedArea(points) {
  let area = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return area / 2;
}

function isConvex(p, i0, i1, i2, ccw) {
  const cross = (p[2 * i1] - p[2 * i0]) * (p[2 * i2 + 1] - p[2 * i1 + 1]) -
                (p[2 * i1 + 1] - p[2 * i0 + 1]) * (p[2 * i2] - p[2 * i1]);
  return ccw ? cross > 1e-12 : cross < -1e-12;
}

function containsAnyPoint(p, remaining, i0, i1, i2) {
  for (const k of remaining) {
    if (k === i0 || k === i1 || k === i2) continue;
    if (pointInTriangle(p[2 * k], p[2 * k + 1], p, i0, i1, i2)) return true;
  }
  return false;
}

function pointInTriangle(x, y, p, i0, i1, i2) {
  const ax = p[2 * i0], ay = p[2 * i0 + 1];
  const bx = p[2 * i1], by = p[2 * i1 + 1];
  const cx = p[2 * i2], cy = p[2 * i2 + 1];
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Axis-aligned bounds of a flat position array. */
export function bounds(positions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 2) {
    const x = positions[i], y = positions[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
