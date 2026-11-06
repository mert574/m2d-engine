/**
 * 4x4 matrices as sixteen numbers in a Float32Array, column-major — the
 * layout WGSL reads straight from a buffer, so nothing is transposed on
 * the way to the GPU. Right-handed, y up, looking down -z, clip depth in
 * [0, 1] as WebGPU has it.
 *
 * Every function takes an optional output array so a renderer can keep a
 * few scratch matrices and allocate nothing per frame. Beside the 2D
 * `matrix.js` rather than replacing it; a 2D game's transforms stay six
 * numbers.
 */

export function create() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(out = new Float32Array(16)) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function copy(m, out = new Float32Array(16)) {
  out.set(m);
  return out;
}

/** a * b: apply b first, then a. `out` may alias either input. */
export function multiply(a, b, out = new Float32Array(16)) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

/**
 * A perspective projection with a vertical field of view, in radians.
 * Depth maps to [0, 1].
 */
export function perspective(fovY, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = far / (near - far);
  out[11] = -1;
  out[14] = (near * far) / (near - far);
  return out;
}

/** An orthographic projection of the box [left, right] x [bottom, top] x [near, far]. */
export function orthographic(left, right, bottom, top, near, far, out = new Float32Array(16)) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = 1 / (near - far);
  out[12] = (left + right) / (left - right);
  out[13] = (bottom + top) / (bottom - top);
  out[14] = near / (near - far);
  out[15] = 1;
  return out;
}

/** A view matrix for an eye at `eye` looking at `target`, with `up` roughly up. */
export function lookAt(eye, target, up, out = new Float32Array(16)) {
  let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
  len = Math.hypot(xx, xy, xz);
  if (len < 1e-6) {
    // Looking straight along `up`: pick any perpendicular.
    xx = 1; xy = 0; xz = 0;
    len = 1;
  }
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
  out[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
  out[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
  out[15] = 1;
  return out;
}

/**
 * A model matrix from a translation, a unit quaternion and a scale, in the
 * order scale, rotate, translate.
 */
export function fromTRS(t, q, s, out = new Float32Array(16)) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s.x, sy = s.y, sz = s.z;
  out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx; out[2] = (xz - wy) * sx; out[3] = 0;
  out[4] = (xy - wz) * sy; out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy; out[7] = 0;
  out[8] = (xz + wy) * sz; out[9] = (yz - wx) * sz; out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
  out[12] = t.x; out[13] = t.y; out[14] = t.z; out[15] = 1;
  return out;
}

/** The inverse, or identity when singular. */
export function invert(m, out = new Float32Array(16)) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(out);
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/**
 * The 3x3 normal matrix of a model matrix — the inverse transpose of its
 * upper-left block — written as three padded columns (twelve floats), the
 * layout a WGSL `mat3x3f` has in a buffer. Under a uniform scale this is
 * the rotation; under a non-uniform one it keeps normals perpendicular.
 */
export function normalMatrix(m, out = new Float32Array(12)) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  let det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!det) {
    out.fill(0);
    out[0] = out[5] = out[10] = 1;
    return out;
  }
  det = 1 / det;
  // Inverse, transposed: row i of the inverse becomes column i.
  out[0] = b01 * det; out[1] = (-a22 * a01 + a02 * a21) * det; out[2] = (a12 * a01 - a02 * a11) * det; out[3] = 0;
  out[4] = b11 * det; out[5] = (a22 * a00 - a02 * a20) * det; out[6] = (-a12 * a00 + a02 * a10) * det; out[7] = 0;
  out[8] = b21 * det; out[9] = (-a21 * a00 + a01 * a20) * det; out[10] = (a11 * a00 - a01 * a10) * det; out[11] = 0;
  // That is the inverse in column-major; transposing swaps (r, c).
  const t1 = out[1], t2 = out[2], t6 = out[6];
  out[1] = out[4]; out[4] = t1;
  out[2] = out[8]; out[8] = t2;
  out[6] = out[9]; out[9] = t6;
  return out;
}

/** `m` applied to a point, with the perspective divide. */
export function transformPoint(m, p, out = { x: 0, y: 0, z: 0 }) {
  const x = p.x, y = p.y, z = p.z;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  out.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

/**
 * The six planes of a view-projection's frustum as `[a, b, c, d]` rows,
 * normalised so `a*x + b*y + c*z + d` is the signed distance of a point,
 * positive inside (Gribb and Hartmann's extraction). Order: left, right,
 * bottom, top, near, far.
 */
export function frustumPlanes(m, out = new Float32Array(24)) {
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
    [m[2], m[6], m[10], m[14]],
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]]
  ];
  for (let i = 0; i < 6; i++) {
    const [a, b, c, d] = rows[i];
    const len = Math.hypot(a, b, c) || 1;
    out[i * 4] = a / len; out[i * 4 + 1] = b / len; out[i * 4 + 2] = c / len; out[i * 4 + 3] = d / len;
  }
  return out;
}

/** Whether a sphere is at least partly inside the frustum `planes`. */
export function sphereInFrustum(planes, x, y, z, radius) {
  for (let i = 0; i < 24; i += 4) {
    if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < -radius) return false;
  }
  return true;
}
