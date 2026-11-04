export const Vec2 = {
  distance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  direction(from, to) {
    return {
      x: to.x - from.x,
      y: to.y - from.y
    };
  },

  normalize(vec) {
    const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    return len > 0 ? { x: vec.x / len, y: vec.y / len } : { x: 0, y: 0 };
  },

  scale(vec, scalar) {
    return {
      x: vec.x * scalar,
      y: vec.y * scalar
    };
  }
};

/**
 * The eight compass names a directional sprite sheet uses, in the order the
 * angle sweeps them with y down: `right` at 0, then clockwise on screen.
 */
export const DIRECTIONS_8 = Object.freeze([
  'right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'
]);

export const Angle = {
  // Returns angle in radians between -PI and PI
  between(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  },

  /** Wrap to (-π, π]. */
  normalize(angle) {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a <= -Math.PI) a += Math.PI * 2;
    return a;
  },

  /**
   * Which of `count` equal sectors an angle falls in, sector 0 centred on
   * angle 0 and the rest following clockwise on screen (y down).
   */
  sector(angle, count = 8) {
    const step = (Math.PI * 2) / count;
    return ((Math.round(angle / step) % count) + count) % count;
  },

  /** The compass name for an angle: `'right'`, `'down_right'`, ... See DIRECTIONS_8. */
  direction8(angle) {
    return DIRECTIONS_8[Angle.sector(angle, 8)];
  },

  /** Whether `angle` lies within `arc` radians centred on `centre`. */
  inArc(angle, centre, arc) {
    return Math.abs(Angle.normalize(angle - centre)) <= arc / 2 + 1e-9;
  },

  // Returns true if angle is within the half circle defined by direction
  inHalfCircle(angle, direction) {
    if (direction > 0) {
      return Math.abs(angle) < Math.PI / 2;
    } else {
      return Math.abs(angle) > Math.PI / 2;
    }
  }
}; 