/**
 * Rotations as the editor shows them and as a scene stores them.
 *
 * A 3D object's `rotation` is a unit quaternion `[x, y, z, w]` — what the
 * physics reads, with no convention to argue about and no gimbal lock. A
 * person reads yaw, pitch and roll, so the inspector converts at the
 * boundary, as Unity's does: the document never holds Euler angles.
 *
 * The convention, fixed here and nowhere else: yaw turns about +y (up),
 * pitch about +x, roll about +z, applied roll first, then pitch, then
 * yaw — `q = yaw · pitch · roll` in Hamilton's product, rotating a vector
 * as `q v q*`. That is the order a camera-like object is posed in: face a
 * heading, tilt, then bank.
 */

export type Quaternion = [number, number, number, number];
export interface Vector3 { x: number; y: number; z: number }
/** Radians. */
export interface Euler { yaw: number; pitch: number; roll: number }

export const IDENTITY: Quaternion = [0, 0, 0, 1];

/** Hamilton product: rotating by `b`, then by `a`. */
export function multiply(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function normalize(q: Quaternion): Quaternion {
  const length = Math.hypot(...q);
  if (length < 1e-12) return [...IDENTITY];
  // One hemisphere for one orientation: w ≥ 0, so a value does not flip sign under edits.
  const sign = q[3] < 0 ? -1 : 1;
  return q.map((c) => (c / length) * sign) as Quaternion;
}

/** A turn of `angle` radians about `axis` (need not be unit). */
export function fromAxisAngle(axis: Vector3, angle: number): Quaternion {
  const length = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const s = Math.sin(angle / 2) / length;
  return [axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2)];
}

/** `v` rotated by `q`. */
export function rotate(q: Quaternion, v: Vector3): Vector3 {
  const [x, y, z, w] = q;
  // t = 2 (q.xyz × v); v' = v + w t + q.xyz × t
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx)
  };
}

export function conjugate([x, y, z, w]: Quaternion): Quaternion {
  return [-x, -y, -z, w];
}

export function fromEuler({ yaw, pitch, roll }: Euler): Quaternion {
  return normalize(multiply(
    multiply(fromAxisAngle({ x: 0, y: 1, z: 0 }, yaw), fromAxisAngle({ x: 1, y: 0, z: 0 }, pitch)),
    fromAxisAngle({ x: 0, y: 0, z: 1 }, roll)
  ));
}

/**
 * Yaw, pitch and roll for a quaternion, the inverse of `fromEuler`. At
 * pitch ±90° yaw and roll describe the same turn; roll is then reported
 * as zero.
 */
export function toEuler(q: Quaternion): Euler {
  const [x, y, z, w] = normalize(q);
  // The rotation matrix entries this decomposition needs, for R = Ry Rx Rz.
  const r12 = 2 * (y * z - w * x);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r12)));
  if (Math.abs(r12) > 0.999999) {
    const r20 = 2 * (x * z - w * y);
    const r00 = 1 - 2 * (y * y + z * z);
    return { yaw: Math.atan2(-r20, r00), pitch, roll: 0 };
  }
  const r02 = 2 * (x * z + w * y);
  const r22 = 1 - 2 * (x * x + y * y);
  const r10 = 2 * (x * y + w * z);
  const r11 = 1 - 2 * (x * x + z * z);
  return { yaw: Math.atan2(r02, r22), pitch, roll: Math.atan2(r10, r11) };
}

/** A quaternion in the scene's form: normalized, rounded so a file stays readable. */
export function forScene(q: Quaternion, digits = 6): Quaternion {
  const scale = 10 ** digits;
  return normalize(q).map((c) => Math.round(c * scale) / scale || 0) as Quaternion;
}
