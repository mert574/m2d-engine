/**
 * Mesh geometry for the primitive shapes a physics body can have, so a 3D
 * level draws before it has a single model: a box is a box, a sphere a
 * sphere, a capsule a capsule. Each is a `Geometry`:
 *
 *   { positions: Float32Array (xyz per vertex),
 *     normals:   Float32Array (xyz per vertex),
 *     uvs:       Float32Array (uv per vertex),
 *     indices:   Uint16Array | Uint32Array (triangle list) }
 *
 * Unit-sized where a scale can finish the job — a box or a cylinder is
 * built once and scaled per instance — and built per proportion where it
 * cannot: a capsule's caps are spheres, and scaling a unit capsule would
 * squash them. API-neutral; the renderer uploads these.
 */

/** Unit cube, centred, 24 vertices so every face has its own normal. */
export function box() {
  const p = [];
  const n = [];
  const idx = [];
  const faces = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
  ];
  const t = [];
  for (const [normal, right, up] of faces) {
    const base = p.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let i = 0; i < 3; i++) p.push((normal[i] + right[i] * u + up[i] * v) * 0.5);
      n.push(...normal);
      t.push(u * 0.5 + 0.5, 0.5 - v * 0.5);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return finish(p, n, idx, t);
}

/** A sphere of radius 0.5 (unit diameter), centred. */
export function sphere(segments = 32, rings = 16) {
  const p = [];
  const n = [];
  const t = [];
  const idx = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    const y = Math.cos(phi);
    const s = Math.sin(phi);
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = s * Math.cos(theta);
      const z = s * Math.sin(theta);
      p.push(x * 0.5, y * 0.5, z * 0.5);
      n.push(x, y, z);
      t.push(i / segments, r / rings);
    }
  }
  ringIndices(idx, rings, segments);
  return finish(p, n, idx, t);
}

/** A cylinder of radius 0.5 and height 1 along y, centred, with caps. */
export function cylinder(segments = 32) {
  const p = [];
  const n = [];
  const t = [];
  const idx = [];
  // Side: two rings sharing outward normals.
  for (const y of [0.5, -0.5]) {
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      p.push(x * 0.5, y, z * 0.5);
      n.push(x, 0, z);
      t.push(i / segments, 0.5 - y);
    }
  }
  ringIndices(idx, 1, segments);
  // Caps: a centre vertex and a ring each, with the cap's normal.
  for (const [y, ny] of [[0.5, 1], [-0.5, -1]]) {
    const centre = p.length / 3;
    p.push(0, y, 0);
    n.push(0, ny, 0);
    t.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      p.push(Math.cos(theta) * 0.5, y, Math.sin(theta) * 0.5);
      n.push(0, ny, 0);
      t.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
    }
    for (let i = 0; i < segments; i++) {
      const a = centre + 1 + i;
      const b = centre + 1 + i + 1;
      if (ny > 0) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  return finish(p, n, idx, t);
}

/**
 * A capsule of the given radius and tip-to-tip height along y, centred —
 * the physics capsule's own measurements, since its proportions cannot be
 * recovered from a unit mesh by scaling.
 */
export function capsule(radius, height, segments = 24, rings = 8) {
  const half = Math.max(0, height / 2 - radius);
  const p = [];
  const n = [];
  const t = [];
  const idx = [];
  // Top hemisphere down to the equator, the straight side, then the bottom
  // hemisphere: one continuous set of rings, so one index pass covers it.
  const total = rings * 2 + 1;
  for (let r = 0; r <= total; r++) {
    let phi;
    let yOffset;
    if (r <= rings) { phi = (r / rings) * (Math.PI / 2); yOffset = half; }
    else { phi = Math.PI / 2 + ((r - rings - 1) / rings) * (Math.PI / 2); yOffset = -half; }
    const y = Math.cos(phi);
    const s = Math.sin(phi);
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = s * Math.cos(theta);
      const z = s * Math.sin(theta);
      p.push(x * radius, y * radius + yOffset, z * radius);
      n.push(x, y, z);
      t.push(i / segments, r / total);
    }
  }
  ringIndices(idx, total, segments);
  return finish(p, n, idx, t);
}

/** A unit square in the xz plane facing +y, centred. */
export function plane() {
  return finish(
    [-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 1, 2, 0, 2, 3],
    [0, 1, 1, 1, 1, 0, 0, 0]
  );
}

/** Triangles between `rings + 1` rows of `segments + 1` vertices, wound outward. */
function ringIndices(idx, rings, segments) {
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < segments; i++) {
      const a = r * (segments + 1) + i;
      const b = a + segments + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
}

function finish(positions, normals, indices, uvs) {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  };
}

const spheres = new WeakMap();

/**
 * The bounding sphere of a geometry in its own space, `{x, y, z, radius}`,
 * computed once and remembered: the centre of its extent and the farthest
 * vertex from it. What the frame culls with.
 */
export function boundingSphere(geometry) {
  let sphere = spheres.get(geometry);
  if (sphere) return sphere;
  const p = geometry.positions;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minY) minY = p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1];
    if (p[i + 2] < minZ) minZ = p[i + 2]; if (p[i + 2] > maxZ) maxZ = p[i + 2];
  }
  const x = (minX + maxX) / 2, y = (minY + maxY) / 2, z = (minZ + maxZ) / 2;
  let r2 = 0;
  for (let i = 0; i < p.length; i += 3) {
    const dx = p[i] - x, dy = p[i + 1] - y, dz = p[i + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  sphere = { x, y, z, radius: Math.sqrt(r2) };
  spheres.set(geometry, sphere);
  return sphere;
}

const unit = new Map();
const capsules = new Map();

/**
 * The geometry for a body shape at a size, with the unit shapes built once
 * and capsules built per proportion (to the millimetre), so a frame full
 * of crates uploads one box. Returns `{ geometry, scale }`: draw the
 * geometry at that scale and it is the body's size.
 */
export function geometryFor(shape, size) {
  if (shape === 'capsule') {
    const radius = size.x / 2;
    const height = size.y;
    const key = `${Math.round(radius * 1000)}:${Math.round(height * 1000)}`;
    let geometry = capsules.get(key);
    if (!geometry) capsules.set(key, geometry = capsule(radius, height));
    return { geometry, scale: { x: 1, y: 1, z: 1 } };
  }
  let geometry = unit.get(shape);
  if (!geometry) {
    geometry = shape === 'sphere' ? sphere() : shape === 'cylinder' ? cylinder() : shape === 'plane' ? plane() : box();
    unit.set(shape, geometry);
  }
  if (shape === 'sphere') {
    const d = size.x;
    return { geometry, scale: { x: d, y: d, z: d } };
  }
  if (shape === 'cylinder') return { geometry, scale: { x: size.x, y: size.y, z: size.x } };
  return { geometry, scale: { x: size.x, y: size.y, z: size.z ?? size.x } };
}
