/**
 * Picking: the geometry and the ranking behind `Viewport.pick`.
 *
 * What a click should select is what the eye sees under it, so a 3D pick
 * tests each object's *visible* volume — a model's scaled bounds, a
 * shape's real sphere or cylinder — never a trigger box the renderer
 * does not draw at that size. The hits are then ranked: a visible thing
 * over a hidden one, a direct hit over a near miss, and a backdrop (the
 * floor, a sky-sized slab) after everything else, so a pixel's miss on a
 * crate selects the crate and not the ground behind it.
 *
 * Pure functions, in the box's own frame (axis-aligned, centred on the
 * origin); the viewport brings the ray there.
 */

export interface V3 { x: number; y: number; z: number }

export type Shape = 'box' | 'sphere' | 'cylinder' | 'capsule';

/** One object's hit by one ray, as the ranking weighs it. */
export interface Hit {
  id: string;
  /** Distance along the ray. */
  t: number;
  /** 0: drawn; 1: hidden (`mesh.visible: false`, or a 2D body with nothing to draw). */
  tier: 0 | 1;
  /** Whether the object is a backdrop: a floor or a wall the whole view sits on. */
  backdrop: boolean;
  /** Whether the hit came from the pointer's own ray, or from a ray in the slop ring around it. */
  direct: boolean;
}

/** Distance along a ray to an axis-aligned box of half extents `half` at the origin, or null for a miss. */
export function rayBox(origin: V3, direction: V3, half: V3): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const lo = -half[axis];
    const hi = half[axis];
    const d = direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
      continue;
    }
    let t1 = (lo - origin[axis]) / d;
    let t2 = (hi - origin[axis]) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  // An eye inside the box (a low camera in the ground slab) is not a pick of it.
  return near >= 0 ? near : null;
}

/** Distance along a ray to a sphere of `radius` at the origin, or null. */
export function raySphere(origin: V3, direction: V3, radius: number): number | null {
  const b = origin.x * direction.x + origin.y * direction.y + origin.z * direction.z;
  const c = origin.x * origin.x + origin.y * origin.y + origin.z * origin.z - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/**
 * Distance along a ray to a vertical cylinder (radius `radius`, half
 * height `halfHeight`, about the y axis at the origin), caps included, or
 * null. A capsule is tested as this cylinder: its rounded ends are a
 * detail no click can tell apart.
 */
export function rayCylinder(origin: V3, direction: V3, radius: number, halfHeight: number): number | null {
  let best: number | null = null;
  const take = (t: number | null) => { if (t !== null && t >= 0 && (best === null || t < best)) best = t; };
  // The curved side: solve in the xz plane.
  const a = direction.x * direction.x + direction.z * direction.z;
  const b = origin.x * direction.x + origin.z * direction.z;
  const c = origin.x * origin.x + origin.z * origin.z - radius * radius;
  if (a > 1e-12) {
    const disc = b * b - a * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      for (const t of [(-b - root) / a, (-b + root) / a]) {
        if (Math.abs(origin.y + direction.y * t) <= halfHeight) take(t);
      }
    }
  }
  // The caps.
  if (Math.abs(direction.y) > 1e-12) {
    for (const y of [-halfHeight, halfHeight]) {
      const t = (y - origin.y) / direction.y;
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      if (x * x + z * z <= radius * radius) take(t);
    }
  }
  return best;
}

/** The hit for a shape of `size` (full extents) at the origin, by its kind. */
export function rayShape(origin: V3, direction: V3, shape: Shape, size: V3): number | null {
  if (shape === 'sphere') return raySphere(origin, direction, size.x / 2);
  if (shape === 'cylinder' || shape === 'capsule') return rayCylinder(origin, direction, size.x / 2, size.y / 2);
  return rayBox(origin, direction, { x: size.x / 2, y: size.y / 2, z: size.z / 2 });
}

/**
 * Whether a 3D object is a backdrop from where it was hit: both of its
 * horizontal extents reach many times further than the hit is away, so
 * the view sits on it rather than looks at it. A floor from ten metres
 * up is; a plaza seen whole from across the lot is not.
 */
export function isBackdrop3D(size: V3, t: number): boolean {
  return size.x >= 8 * t && size.z >= 8 * t;
}

/**
 * The pick among hits: drawn before hidden, a direct hit before a near
 * miss, the nearest first — and a backdrop only when nothing else was
 * hit at all.
 */
export function bestHit(hits: readonly Hit[]): string | null {
  let best: Hit | null = null;
  for (const hit of hits) {
    if (!best || compareHits(hit, best) < 0) best = hit;
  }
  return best?.id ?? null;
}

function compareHits(a: Hit, b: Hit): number {
  if (a.backdrop !== b.backdrop) return a.backdrop ? 1 : -1;
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.direct !== b.direct) return a.direct ? -1 : 1;
  return a.t - b.t;
}

/**
 * The offsets, in client pixels, of the rays cast around the pointer: the
 * pointer's own, then a ring at `radius`. A small thing is hard to land
 * on exactly; a near miss within the ring still finds it.
 */
export function slopOffsets(radius: number): Array<{ dx: number; dy: number; direct: boolean }> {
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring.push({ dx: Math.cos(a) * radius, dy: Math.sin(a) * radius, direct: false });
  }
  return [{ dx: 0, dy: 0, direct: true }, ...ring];
}
