/**
 * Stroke extrusion: turns a polyline into triangles of a given width with
 * butt caps and bevel joins. GL line primitives have unreliable widths, so
 * every stroke in a GPU backend goes through this.
 */

/**
 * @param {number[]} points - Flat [x0, y0, x1, y1, ...]
 * @param {boolean} closed - Join the last point back to the first
 * @param {number} width - Stroke width
 * @returns {{positions: number[], indices: number[]}}
 */
export function strokePolyline(points, closed, width) {
  const pts = dedupe(points);
  const n = pts.length / 2;
  const positions = [];
  const indices = [];
  if (n < 2) return { positions, indices };

  const hw = width / 2;
  const segCount = closed ? n : n - 1;

  // Per-segment quads.
  const segNormals = [];
  for (let i = 0; i < segCount; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1];
    const j = (i + 1) % n;
    const x1 = pts[2 * j], y1 = pts[2 * j + 1];
    let dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy * hw, ny = dx * hw;
    segNormals.push(nx, ny);

    const base = positions.length / 2;
    positions.push(x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  // Bevel joins: a triangle between the two offset corners on each side.
  const joinStart = closed ? 0 : 1;
  const joinEnd = closed ? n : n - 1;
  for (let i = joinStart; i < joinEnd; i++) {
    const prev = (i - 1 + segCount) % segCount;
    const next = i % segCount;
    const px = pts[2 * i], py = pts[2 * i + 1];
    const pnx = segNormals[2 * prev], pny = segNormals[2 * prev + 1];
    const nnx = segNormals[2 * next], nny = segNormals[2 * next + 1];
    if (Math.abs(pnx - nnx) < 1e-6 && Math.abs(pny - nny) < 1e-6) continue;

    const base = positions.length / 2;
    positions.push(px, py, px + pnx, py + pny, px + nnx, py + nny, px - pnx, py - pny, px - nnx, py - nny);
    indices.push(base, base + 1, base + 2, base, base + 3, base + 4);
  }

  return { positions, indices };
}

function dedupe(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    const m = out.length;
    if (m >= 2 && Math.abs(out[m - 2] - x) < 1e-9 && Math.abs(out[m - 1] - y) < 1e-9) continue;
    out.push(x, y);
  }
  // A closed path given with an explicit repeat of the first point.
  const m = out.length;
  if (m >= 4 && Math.abs(out[0] - out[m - 2]) < 1e-9 && Math.abs(out[1] - out[m - 1]) < 1e-9) {
    out.length = m - 2;
  }
  return out;
}
