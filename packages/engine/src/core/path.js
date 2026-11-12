/**
 * A named path from a scene's `paths`: control points joined by straight
 * segments, or by a centripetal Catmull-Rom curve through them when
 * `smooth`. Measured by arc length, so a follower moving `d` units moves
 * that far along the drawn line whatever the spacing of the points.
 *
 * The curve is flattened once into a polyline; every query walks that. A
 * straight path's polyline is its points exactly.
 */

const SAMPLES_PER_SEGMENT = 16;

const lerp = (a, b, t) => a + (b - a) * t;

function lerpPoint(a, b, t, hasZ) {
  const point = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  if (hasZ) point.z = lerp(a.z ?? 0, b.z ?? 0, t);
  return point;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
}

/**
 * One centripetal Catmull-Rom span from p1 to p2 (Barry–Goldman), which
 * never cusps or loops on unevenly spaced points as the uniform kind does.
 */
function catmullRom(p0, p1, p2, p3, t, hasZ) {
  const knot = (a, b) => Math.max(Math.sqrt(distance(a, b)), 1e-6);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = lerp(t1, t2, t);
  const span = (a, b, ta, tb) => lerpPoint(a, b, (u - ta) / (tb - ta), hasZ);
  const a1 = span(p0, p1, 0, t1);
  const a2 = span(p1, p2, t1, t2);
  const a3 = span(p2, p3, t2, t3);
  const b1 = span(a1, a2, 0, t2);
  const b2 = span(a2, a3, t1, t3);
  return span(b1, b2, t1, t2);
}

export class Path {
  /**
   * @param {{points: {x: number, y: number, z?: number}[], closed?: boolean, smooth?: boolean}} spec
   */
  constructor({ points, closed = false, smooth = false }) {
    this.points = points.map((point) => ({ ...point }));
    this.closed = closed;
    this.smooth = smooth;
    this.hasZ = this.points.some((point) => point.z !== undefined);
    /** The flattened line and the arc length at each of its vertices. */
    this.line = [];
    this.at = [];
    /** Arc length at each control point. */
    this.stops = [];
    this.#flatten();
  }

  get length() {
    return this.at[this.at.length - 1] ?? 0;
  }

  #flatten() {
    const points = this.points;
    const n = points.length;
    const segments = this.closed ? n : n - 1;
    const control = (i) => (this.closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
    this.line.push({ ...points[0] });
    this.stops.push(0);
    let length = 0;
    this.at.push(0);
    for (let i = 0; i < segments; i++) {
      const steps = this.smooth ? SAMPLES_PER_SEGMENT : 1;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const point = this.smooth
          ? catmullRom(control(i - 1), control(i), control(i + 1), control(i + 2), t, this.hasZ)
          : lerpPoint(control(i), control(i + 1), t, this.hasZ);
        length += distance(this.line[this.line.length - 1], point);
        this.line.push(point);
        this.at.push(length);
      }
      if (i < n - 1) this.stops.push(length);
    }
  }

  /** `d` folded onto the path: around a closed one, clamped to an open one. */
  wrap(d) {
    const length = this.length;
    if (!length) return 0;
    if (this.closed) return ((d % length) + length) % length;
    return Math.max(0, Math.min(length, d));
  }

  /** The point at arc length `d`. */
  pointAt(d) {
    const at = this.at;
    const target = this.wrap(d);
    let lo = 0;
    let hi = at.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = at[hi] - at[lo];
    return lerpPoint(this.line[lo], this.line[hi], span > 0 ? (target - at[lo]) / span : 0, this.hasZ);
  }

  /** The arc length of the point on the path nearest to `point`. */
  nearest(point) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 1; i < this.line.length; i++) {
      const a = this.line[i - 1];
      const b = this.line[i];
      const span = this.at[i] - this.at[i - 1];
      if (span <= 0) continue;
      const t = Math.max(0, Math.min(1,
        ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y) + ((point.z ?? 0) - (a.z ?? 0)) * ((b.z ?? 0) - (a.z ?? 0))) / (span * span)));
      const d = distance(point, lerpPoint(a, b, t, this.hasZ));
      if (d < bestDistance) {
        bestDistance = d;
        best = this.at[i - 1] + span * t;
      }
    }
    return best;
  }
}
