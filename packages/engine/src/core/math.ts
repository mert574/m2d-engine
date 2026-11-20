/** A point or a vector in two dimensions. Anything with `x` and `y` will do. */
export interface Vector2 {
  x: number;
  y: number;
}

/** A point or a vector in three dimensions. */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** A rotation as a unit quaternion, the form Rapier reads and writes. */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** A compass name a directional sprite sheet uses; see `DIRECTIONS_8`. */
export type Direction8 = (typeof DIRECTIONS_8)[number];

export const Vec2 = {
  distance(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  direction(from: Readonly<Vector2>, to: Readonly<Vector2>): Vector2 {
    return {
      x: to.x - from.x,
      y: to.y - from.y
    };
  },

  normalize(vec: Readonly<Vector2>): Vector2 {
    const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    return len > 0 ? { x: vec.x / len, y: vec.y / len } : { x: 0, y: 0 };
  },

  scale(vec: Readonly<Vector2>, scalar: number): Vector2 {
    return {
      x: vec.x * scalar,
      y: vec.y * scalar
    };
  }
};

/**
 * The three-dimensional Vec2, with the same four operations plus the ones
 * that only mean something with a third axis.
 *
 * Kept beside `Vec2` rather than replacing it: a 2D game's vectors stay
 * two numbers, which is what its physics, its renderer and its sprite
 * maths all want. See `knowledge-base/projects/3d/3d-and-editor.md` for why the engine
 * runs two dimensions rather than one.
 */
export const Vec3 = {
  distance(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  },

  direction(from: Readonly<Vector3>, to: Readonly<Vector3>): Vector3 {
    return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  },

  length(v: Readonly<Vector3>): number {
    return Math.hypot(v.x, v.y, v.z);
  },

  normalize(v: Readonly<Vector3>): Vector3 {
    const len = Math.hypot(v.x, v.y, v.z);
    return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
  },

  scale(v: Readonly<Vector3>, scalar: number): Vector3 {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
  },

  add(a: Readonly<Vector3>, b: Readonly<Vector3>): Vector3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  },

  subtract(a: Readonly<Vector3>, b: Readonly<Vector3>): Vector3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  },

  dot(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  },

  /** The vector perpendicular to both, right-handed. */
  cross(a: Readonly<Vector3>, b: Readonly<Vector3>): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
};

/**
 * A rotation in three dimensions, as a unit quaternion `{x, y, z, w}` —
 * the form Rapier reads and writes, so nothing has to convert at the
 * boundary.
 *
 * Euler angles are not offered. Three angles do not compose without a
 * convention to argue about, and they gimbal lock; a quaternion does
 * neither, and `fromAxisAngle` covers what game code actually wants to
 * say.
 */
export const Quat = {
  identity(): Quaternion {
    return { x: 0, y: 0, z: 0, w: 1 };
  },

  /** A rotation of `angle` radians about `axis`, which need not be unit. */
  fromAxisAngle(axis: Readonly<Vector3>, angle: number): Quaternion {
    const unit = Vec3.normalize(axis);
    const half = angle / 2;
    const sin = Math.sin(half);
    return { x: unit.x * sin, y: unit.y * sin, z: unit.z * sin, w: Math.cos(half) };
  },

  /** `a` then `b`, in that order. */
  multiply(a: Readonly<Quaternion>, b: Readonly<Quaternion>): Quaternion {
    return {
      x: b.w * a.x + b.x * a.w + b.y * a.z - b.z * a.y,
      y: b.w * a.y - b.x * a.z + b.y * a.w + b.z * a.x,
      z: b.w * a.z + b.x * a.y - b.y * a.x + b.z * a.w,
      w: b.w * a.w - b.x * a.x - b.y * a.y - b.z * a.z
    };
  },

  /** The rotation that undoes this one. Unit quaternions only. */
  conjugate(q: Readonly<Quaternion>): Quaternion {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  },

  normalize(q: Readonly<Quaternion>): Quaternion {
    const len = Math.hypot(q.x, q.y, q.z, q.w);
    return len > 0
      ? { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
      : Quat.identity();
  },

  /** `v` turned by `q`. */
  rotate(q: Readonly<Quaternion>, v: Readonly<Vector3>): Vector3 {
    // v + 2q_v x (q_v x v + wv), the usual expansion: no matrix, no
    // intermediate quaternion.
    const u = { x: q.x, y: q.y, z: q.z };
    const t = Vec3.scale(Vec3.cross(u, v), 2);
    return Vec3.add(Vec3.add(v, Vec3.scale(t, q.w)), Vec3.cross(u, t));
  },

  /**
   * The rotation `t` of the way from `a` to `b`, along the shorter arc.
   *
   * This is the third axis's answer to `shortestTurn`: interpolating two
   * rotations naively takes the long way round whenever they are more than
   * half a turn apart, which reads as a model snapping through itself for
   * one frame. Near-parallel rotations fall back to a straight blend,
   * where the arc is too short for the division to be worth its precision.
   */
  slerp(a: Readonly<Quaternion>, b: Readonly<Quaternion>, t: number): Quaternion {
    let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let end: Readonly<Quaternion> = b;
    if (cos < 0) {
      // The two unit quaternions a rotation has; this is the near one.
      end = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
      cos = -cos;
    }
    if (cos > 0.9995) {
      return Quat.normalize({
        x: a.x + (end.x - a.x) * t,
        y: a.y + (end.y - a.y) * t,
        z: a.z + (end.z - a.z) * t,
        w: a.w + (end.w - a.w) * t
      });
    }
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    const from = Math.sin((1 - t) * angle) / sin;
    const to = Math.sin(t * angle) / sin;
    return {
      x: a.x * from + end.x * to,
      y: a.y * from + end.y * to,
      z: a.z * from + end.z * to,
      w: a.w * from + end.w * to
    };
  }
};

/**
 * The eight compass names a directional sprite sheet uses, in the order the
 * angle sweeps them with y down: `right` at 0, then clockwise on screen.
 */
export const DIRECTIONS_8 = Object.freeze([
  'right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'
] as const);

export const Angle = {
  // Returns angle in radians between -PI and PI
  between(from: Readonly<Vector2>, to: Readonly<Vector2>): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  },

  /** Wrap to (-π, π]. */
  normalize(angle: number): number {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a <= -Math.PI) a += Math.PI * 2;
    return a;
  },

  /**
   * Which of `count` equal sectors an angle falls in, sector 0 centred on
   * angle 0 and the rest following clockwise on screen (y down).
   */
  sector(angle: number, count = 8): number {
    const step = (Math.PI * 2) / count;
    return ((Math.round(angle / step) % count) + count) % count;
  },

  /** The compass name for an angle: `'right'`, `'down_right'`, ... See DIRECTIONS_8. */
  direction8(angle: number): Direction8 {
    // `sector` is in [0, 8), so the index is always one of the eight.
    return DIRECTIONS_8[Angle.sector(angle, 8)] as Direction8;
  },

  /** Whether `angle` lies within `arc` radians centred on `centre`. */
  inArc(angle: number, centre: number, arc: number): boolean {
    return Math.abs(Angle.normalize(angle - centre)) <= arc / 2 + 1e-9;
  },

  // Returns true if angle is within the half circle defined by direction
  inHalfCircle(angle: number, direction: number): boolean {
    if (direction > 0) {
      return Math.abs(angle) < Math.PI / 2;
    } else {
      return Math.abs(angle) > Math.PI / 2;
    }
  }
}; 