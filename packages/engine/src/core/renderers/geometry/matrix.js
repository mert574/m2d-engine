/**
 * 2D affine matrices as six numbers [a, b, c, d, e, f], mapping
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 * (the Canvas 2D / SVG convention). API-neutral; used by GPU backends to
 * transform geometry on the CPU before batching.
 */

export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

/** m * n (apply n first, then m). */
export function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

export function translation(x, y) {
  return [1, 0, 0, 1, x, y];
}

export function rotation(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, 0, 0];
}

export function scaling(sx, sy) {
  return [sx, 0, 0, sy, 0, 0];
}

/**
 * Build the matrix for a { x, y, rotation, scaleX, scaleY } transform
 * descriptor, applied as translate, then rotate, then scale (Canvas order).
 */
export function fromTransform({ x = 0, y = 0, rotation: angle = 0, scaleX = 1, scaleY = 1 } = {}) {
  let m = translation(x, y);
  if (angle) m = multiply(m, rotation(angle));
  if (scaleX !== 1 || scaleY !== 1) m = multiply(m, scaling(scaleX, scaleY));
  return m;
}

/** Transform a point, returning [x', y']. */
export function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Transform a flat [x0, y0, x1, y1, ...] array in place-free fashion. */
export function applyToPositions(m, positions) {
  const out = new Array(positions.length);
  for (let i = 0; i < positions.length; i += 2) {
    const x = positions[i];
    const y = positions[i + 1];
    out[i] = m[0] * x + m[2] * y + m[4];
    out[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return out;
}

/** Largest scale factor the matrix applies to any direction. */
export function maxScale(m) {
  return Math.sqrt(Math.max(m[0] * m[0] + m[1] * m[1], m[2] * m[2] + m[3] * m[3]));
}

/**
 * Inverse of an affine matrix, or null when it is singular (a zero scale).
 */
export function invert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det) return null;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

/**
 * The world-to-view matrix a camera describes: world positions in, view
 * coordinates out, with (0, 0) at the view's top-left corner.
 *
 * The camera's `x, y` land at the centre of the view; `zoom` scales the
 * world about that point (2 shows half as much world at twice the size);
 * `rotation` is the camera's own angle in radians, so the world turns the
 * other way. Zoom and rotation are optional: a bare `{ x, y, width, height }`
 * is the translate-only camera every backend always understood.
 *
 * Both renderer backends build their camera from this, so there is exactly
 * one definition of where a world point lands on screen — the camera's own
 * `worldToScreen` uses it too.
 */
export function viewMatrix({ x, y, width, height, zoom = 1, rotation: angle = 0 }) {
  let m = translation(width / 2, height / 2);
  if (angle) m = multiply(m, rotation(-angle));
  if (zoom !== 1) m = multiply(m, scaling(zoom, zoom));
  return multiply(m, translation(-x, -y));
}
