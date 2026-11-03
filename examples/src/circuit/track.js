/**
 * Track geometry: a closed centreline spline with a width at every point.
 *
 * A map authors a loop of control points `{x, y, w}` (w = half-width of the
 * asphalt). This resamples it into dense, evenly spaced samples carrying
 * position, tangent, normal, width and cumulative distance, and derives
 * everything the game needs from that one source: the road surface to draw,
 * the walls to collide with, where a prop at "60% around, left shoulder"
 * actually sits, and which pieces are near the camera this frame.
 *
 * Everything here is plain geometry computed once per map load — nothing
 * random, nothing per-frame — so a track is identical on every machine,
 * which the replays depend on.
 */

/** Distance between samples along the centreline, px. */
const SAMPLE_SPACING = 22;
/** One wall piece per this many px of edge. */
const WALL_SPACING = 56;
/** Wall collision thickness, px. */
const WALL_THICKNESS = 18;
/** Culling grid cell, px. */
const BUCKET = 256;

/** Catmull-Rom point for segment p1→p2 at parameter u. */
function catmullRom(p0, p1, p2, p3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (a, b, c, d) =>
    0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return {
    x: f(p0.x, p1.x, p2.x, p3.x),
    y: f(p0.y, p1.y, p2.y, p3.y),
    w: f(p0.w, p1.w, p2.w, p3.w)
  };
}

export class Track {
  /**
   * @param {Array<{x: number, y: number, w: number}>} controls - The closed
   *   loop, in driving order. The lap runs from the first point.
   */
  constructor(controls) {
    this.samples = this.#sample(controls);
    this.length = this.samples[this.samples.length - 1].s +
      Math.hypot(this.samples[0].x - this.samples[this.samples.length - 1].x,
        this.samples[0].y - this.samples[this.samples.length - 1].y);

    this.walls = this.#buildWalls();
    this.buckets = this.#bucketize();

    const xs = this.samples.map((p) => p.x);
    const ys = this.samples.map((p) => p.y);
    const w = Math.max(...this.samples.map((p) => p.w));
    this.bounds = {
      left: Math.min(...xs) - w - 400,
      top: Math.min(...ys) - w - 400,
      right: Math.max(...xs) + w + 400,
      bottom: Math.max(...ys) + w + 400
    };
  }

  #sample(controls) {
    const n = controls.length;
    const samples = [];
    let s = 0;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const p0 = controls[(i - 1 + n) % n];
      const p1 = controls[i];
      const p2 = controls[(i + 1) % n];
      const p3 = controls[(i + 2) % n];
      const segLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(2, Math.ceil(segLength / SAMPLE_SPACING));
      for (let k = 0; k < steps; k++) {
        const point = catmullRom(p0, p1, p2, p3, k / steps);
        if (prev) s += Math.hypot(point.x - prev.x, point.y - prev.y);
        samples.push({ ...point, s });
        prev = point;
      }
    }
    // Tangents from neighbours, wrapping; normals point to the right of the
    // driving direction (y-down world, so right of travel is +90°).
    const m = samples.length;
    for (let i = 0; i < m; i++) {
      const a = samples[(i - 1 + m) % m];
      const b = samples[(i + 1) % m];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const sample = samples[i];
      sample.tx = dx / len;
      sample.ty = dy / len;
      sample.nx = -sample.ty;
      sample.ny = sample.tx;
    }
    return samples;
  }

  /** The sample nearest to `s` along the lap, wrapping. */
  at(s) {
    const wrapped = ((s % this.length) + this.length) % this.length;
    // Samples are even enough that a proportional guess lands within a few
    // entries; walk from there.
    let i = Math.min(this.samples.length - 1,
      Math.floor((wrapped / this.length) * this.samples.length));
    while (i > 0 && this.samples[i].s > wrapped) i--;
    while (i < this.samples.length - 1 && this.samples[i + 1].s <= wrapped) i++;
    return this.samples[i];
  }

  /**
   * A world pose on the track: `t` is the lap fraction (0..1 from the start
   * line), `offset` px to the right of the driving direction (negative =
   * left). Props, lamps, gates and grids are all placed with this.
   */
  pose(t, offset = 0) {
    const sample = this.at(t * this.length);
    return {
      x: sample.x + sample.nx * offset,
      y: sample.y + sample.ny * offset,
      angle: Math.atan2(sample.ty, sample.tx),
      width: sample.w,
      sample
    };
  }

  /** Index of the sample nearest a world point (coarse, bucketed). */
  nearest(x, y) {
    const key = `${Math.floor(x / BUCKET)},${Math.floor(y / BUCKET)}`;
    let candidates = this.buckets.samples.get(key);
    if (!candidates) {
      // Off the grid (deep off-road): scan everything, it is rare.
      candidates = this.samples.map((_, i) => i);
    }
    let best = 0;
    let bestD = Infinity;
    for (const i of candidates) {
      const sample = this.samples[i];
      const d = (sample.x - x) ** 2 + (sample.y - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Whether a world point is on the asphalt (within the width). */
  onRoad(x, y, margin = 0) {
    const sample = this.samples[this.nearest(x, y)];
    const d = Math.hypot(sample.x - x, sample.y - y);
    return d <= sample.w + margin;
  }

  #buildWalls() {
    const walls = [];
    for (const side of [-1, 1]) {
      let run = 0;
      let start = null;
      const edge = (sample) => ({
        x: sample.x + sample.nx * side * (sample.w + WALL_THICKNESS / 2),
        y: sample.y + sample.ny * side * (sample.w + WALL_THICKNESS / 2)
      });
      for (let i = 0; i <= this.samples.length; i++) {
        const sample = this.samples[i % this.samples.length];
        if (!start) { start = edge(sample); run = 0; continue; }
        const here = edge(sample);
        run += Math.hypot(here.x - start.x, here.y - start.y);
        if (run >= WALL_SPACING || i === this.samples.length) {
          const cx = (start.x + here.x) / 2;
          const cy = (start.y + here.y) / 2;
          const length = Math.hypot(here.x - start.x, here.y - start.y);
          if (length > 4) {
            walls.push({
              x: cx, y: cy,
              angle: Math.atan2(here.y - start.y, here.x - start.x),
              // A little overlap so corners leave no gaps to escape through.
              length: length + 10,
              side
            });
          }
          start = here;
          run = 0;
        }
      }
    }
    return walls;
  }

  #bucketize() {
    const samples = new Map();
    const walls = new Map();
    const push = (map, x, y, value) => {
      const key = `${Math.floor(x / BUCKET)},${Math.floor(y / BUCKET)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(value);
    };
    // A sample is findable from any cell its width reaches into, so
    // `nearest` works from the shoulder and the walls, not just the line.
    this.samples.forEach((sample, i) => {
      const reach = sample.w + BUCKET / 2;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          push(samples, sample.x + dx * reach, sample.y + dy * reach, i);
        }
      }
    });
    this.walls.forEach((wall, i) => push(walls, wall.x, wall.y, i));
    return { samples, walls };
  }

  /** Indices of samples within `radius` of a point — the draw cull. */
  samplesNear(x, y, radius) {
    const result = new Set();
    const r = Math.ceil(radius / BUCKET);
    const cx = Math.floor(x / BUCKET);
    const cy = Math.floor(y / BUCKET);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const cell = this.buckets.samples.get(`${cx + dx},${cy + dy}`);
        if (cell) for (const i of cell) result.add(i);
      }
    }
    return result;
  }

  /** Walls within `radius` of a point — collision visuals and shadow casters. */
  wallsNear(x, y, radius) {
    const result = [];
    const r = Math.ceil(radius / BUCKET) + 1;
    const cx = Math.floor(x / BUCKET);
    const cy = Math.floor(y / BUCKET);
    const r2 = radius * radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const cell = this.buckets.walls.get(`${cx + dx},${cy + dy}`);
        if (!cell) continue;
        for (const i of cell) {
          const wall = this.walls[i];
          const d2 = (wall.x - x) ** 2 + (wall.y - y) ** 2;
          if (d2 <= r2) result.push(wall);
        }
      }
    }
    return result;
  }
}

export { WALL_THICKNESS };
