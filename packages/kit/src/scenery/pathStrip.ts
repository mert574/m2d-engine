import { s } from 'm2d-engine/schema';
import { Quat, type M2D, type Quaternion } from 'm2d-engine';
import { Scenery } from './scenery.ts';
import type { ActorBody, ActorSprite, Vec2 } from '../engineTypes.ts';

export interface PathStripOptions {
  /** The scene's path it is laid along, as its centreline. */
  path?: string;
  /** Across the path: px in 2D, metres in 3D. */
  width?: number;
  /** 3D: how far it stands up from the path; 0 lays it flat. */
  height?: number;
  /** 2D: one tile of the sprite along the path; its width by default. */
  repeat?: number;
  /** 2D: the band, with no sprite. */
  color?: string;
}

/** A point of a path's flattened line: on the ground in 2D, in the world in 3D. */
interface LinePoint {
  x: number;
  y?: number;
  z?: number;
}

/** An offset across the line, on the ground plane. */
type Offset = [number, number];

/** A surface normal in the world's three axes. */
type Normal = [number, number, number];

/** The two vertex indices of one rung of a strip: its left and right edge. */
type Edge = [number, number];

/**
 * `array[index]`, where the loop that produced the index guarantees it is
 * there. Checked rather than asserted: this runs once when a strip is
 * built, so a missing point is worth a clear error instead of a NaN that
 * surfaces as a mesh with a hole in it.
 */
function at<T>(array: readonly T[], index: number): T {
  const value = array[index];
  if (value === undefined) throw new Error(`M2D PathStrip: nothing at index ${index}`);
  return value;
}

/** Mesh data the engine draws through `entity.geometry`. */
export interface StripGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** How far a corner's mitre may reach past the strip's half-width before it is cut. */
const MAX_MITRE = 4;

/**
 * A strip laid along one of the scene's paths: a kerb, a fence line, a
 * road edge, a river bank. The path is the strip's centreline, so moving
 * a point in the editor moves the strip.
 *
 * In 2D it tiles its prefab's sprite along the line, one tile `repeat`
 * long and `width` across, turned to each segment; with no sprite it is a
 * band of `color`. In 3D it is a mesh built along the line when first
 * drawn, `width` across and standing `height` up from the path (0 lays it
 * flat), drawn with its prefab's `mesh` block, whose texture follows the
 * world. Either way it collides with nothing: what stops a car at a kerb
 * is the level's collider, not its look.
 */
export class PathStrip extends Scenery {
  static override description = 'A strip laid along one of the scene\'s paths: a kerb, a fence line, a road edge';
  static override properties = {
    path: s.ref('path', { label: 'Path', description: 'The scene\'s path it is laid along, as its centreline' }),
    width: s.number({ positive: true, initial: 16, description: 'Across the path: px in 2D, metres in 3D' }),
    height: s.number({ min: 0, initial: 0, unit: 'm', description: '3D: how far it stands up from the path; 0 lays it flat' }),
    repeat: s.number({ positive: true, unit: 'px', description: '2D: one tile of the sprite along the path; its width by default' }),
    color: s.string({ editor: 'color', initial: '#8b95a3', label: 'Colour', description: '2D: the band, with no sprite' })
  };

  /** A strip laid along nothing draws nothing: it names its path. */
  static override refineProperties(
    properties: PathStripOptions,
    { fail }: { fail: (key: string, message: string) => never }
  ): void {
    if (!properties.path) fail('path', 'a strip is laid along a path: name one of the scene\'s paths');
  }

  override name = 'PathStrip';

  /** The scene path it follows, or null for an object that names none. */
  pathName: string | null;
  width: number;
  height: number;
  /** 2D: one tile along the path, or null for the strip's width. */
  repeat: number | null;
  color: string;
  /** The 3D mesh and the line it was built from: a path edited in the editor is a new line. */
  built: StripGeometry | null;
  builtFrom: LinePoint[] | null;
  /** Its prefab's `mesh` block, kept while scenery keeps none. */
  ownMesh: unknown;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: PathStripOptions = {}) {
    super(body, sprite, game, 0);
    // Under whatever stands on it at its own zIndex.
    this.depth = -Infinity;
    this.pathName = options.path ?? null;
    this.width = options.width ?? 16;
    this.height = options.height ?? 0;
    this.repeat = options.repeat ?? null;
    this.color = options.color ?? '#8b95a3';
    this.built = null;
    this.builtFrom = null;
    if (sprite) this.setAnimation('default');
  }

  /** Its prefab's mesh block, which the 3D strip is drawn with (scenery otherwise keeps none) — once it has a line to be built along. */
  override get mesh(): unknown {
    return this.geometry ? this.ownMesh ?? null : null;
  }

  override set mesh(value: unknown) {
    this.ownMesh = value;
  }

  /** The path's flattened line, or null before the scene is current or when it names none. */
  get line(): LinePoint[] | null {
    const path = this.pathName ? this.scene?.pathFor(this, this.pathName) : null;
    return path?.line.length >= 2 ? path.line : null;
  }

  /** 3D: the strip's mesh in its body's frame, built from the path's line, and again when the line changes. */
  get geometry(): StripGeometry | null {
    if (this.game.physics.dimensions !== 3) return null;
    const line = this.line;
    if (!line) return null;
    if (this.builtFrom !== line) {
      this.built = stripGeometry(line, this.width, this.height, this.body.position, (this.body as { rotation?: unknown }).rotation as Parameters<typeof stripGeometry>[4]);
      this.builtFrom = line;
    }
    return this.built;
  }

  override paint(): void {
    const ground = this.line;
    if (!ground) return;
    // Drawn on the render plane: through the level's projection, as everything placed on the ground is.
    const projection = this.game.projection;
    // 2D path: the line's points carry y here (z is the 3D strip's).
    const line: { x: number; y: number }[] = projection
      ? ground.map((p) => projection.toScreen(p.x, p.y!))
      : (ground as { x: number; y: number }[]);
    const renderer = this.game.renderer;
    if (!this.sprite?.width) {
      renderer.drawPath({ points: line, closed: false, strokeStyle: this.color, lineWidth: this.width });
      return;
    }
    const tile = this.repeat ?? this.width;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= 0) continue;
      const rotation = Math.atan2(b.y - a.y, b.x - a.x);
      const count = Math.max(1, Math.round(length / tile));
      const step = length / count;
      for (let t = 0; t < count; t++) {
        const f = (t + 0.5) / count;
        this.sprite.draw(this.currentAnim, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, {
          rotation, width: step, height: this.width, frame: this.animFrame
        });
      }
    }
  }
}

/**
 * A strip's geometry along a polyline: a flat ribbon, or with `height` a
 * kerb's section — the top, both sides, and the ends — mitred at the
 * corners. Built in world space and carried into the body's frame, so the
 * strip lies on its path wherever its object stands.
 */
export function stripGeometry(
  line: LinePoint[],
  width: number,
  height: number,
  origin: { x: number; y: number; z?: number },
  rotation: Readonly<Quaternion> | null | undefined
): StripGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  const sides: Offset[] = line.map((point, i) => {
    const [sx, sz] = side(line, i);
    return [sx * half, sz * half];
  });
  let along = 0;
  const distances = line.map((point, i) => (along += i ? Math.hypot(point.x - at(line, i - 1).x, (point.z ?? 0) - (at(line, i - 1).z ?? 0)) : 0));
  const y = (point: LinePoint): number => point.y ?? 0;
  const vertex = (point: LinePoint, [sx, sz]: Offset, up: number, normal: Normal, u: number, v: number): number => {
    positions.push(point.x + sx, y(point) + up, (point.z ?? 0) + sz);
    normals.push(...normal);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number): void => { indices.push(a, b, c, a, c, d); };

  // The top (or the whole ribbon): left and right edge along the line.
  const top: Edge[] = line.map((point, i) => {
    const [sx, sz] = at(sides, i);
    return [
      vertex(point, [sx, sz], height, [0, 1, 0], 0, at(distances, i) / width),
      vertex(point, [-sx, -sz], height, [0, 1, 0], 1, at(distances, i) / width)
    ];
  });
  for (let i = 1; i < line.length; i++) {
    quad(at(top, i - 1)[0], at(top, i)[0], at(top, i)[1], at(top, i - 1)[1]);
  }

  if (height > 0) {
    // Each side face, from the ground up, facing out along the side.
    for (const sign of [1, -1]) {
      const wall: Edge[] = line.map((point, i) => {
        const [ox, oz] = at(sides, i);
        const sx = ox * sign;
        const sz = oz * sign;
        const length = Math.hypot(sx, sz) || 1;
        const normal: Normal = [sx / length, 0, sz / length];
        return [
          vertex(point, [sx, sz], 0, normal, at(distances, i) / width, 0),
          vertex(point, [sx, sz], height, normal, at(distances, i) / width, height / width)
        ];
      });
      for (let i = 1; i < line.length; i++) {
        if (sign > 0) quad(at(wall, i - 1)[0], at(wall, i)[0], at(wall, i)[1], at(wall, i - 1)[1]);
        else quad(at(wall, i - 1)[0], at(wall, i - 1)[1], at(wall, i)[1], at(wall, i)[0]);
      }
    }
    // The two ends, facing away along the line.
    for (const [i, j] of [[0, 1], [line.length - 1, line.length - 2]] as const) {
      const end = at(line, i);
      const dx = end.x - at(line, j).x;
      const dz = (end.z ?? 0) - (at(line, j).z ?? 0);
      const length = Math.hypot(dx, dz) || 1;
      const normal: Normal = [dx / length, 0, dz / length];
      const [sx, sz] = at(sides, i);
      const rim: Array<[number, number, number]> = [[sx, sz, 0], [-sx, -sz, 0], [-sx, -sz, height], [sx, sz, height]];
      const corners = rim.map(([cx, cz, up], k) => vertex(end, [cx, cz], up, normal, k === 1 || k === 2 ? 1 : 0, up / width));
      if (i === 0) quad(at(corners, 0), at(corners, 3), at(corners, 2), at(corners, 1));
      else quad(at(corners, 0), at(corners, 1), at(corners, 2), at(corners, 3));
    }
  }

  // Into the body's frame: less its position, turned back by its rotation.
  const back = Quat.conjugate(rotation ?? Quat.identity());
  for (let i = 0; i < positions.length; i += 3) {
    const local = Quat.rotate(back, { x: at(positions, i) - origin.x, y: at(positions, i + 1) - origin.y, z: at(positions, i + 2) - (origin.z ?? 0) });
    positions[i] = local.x; positions[i + 1] = local.y; positions[i + 2] = local.z;
    const n = Quat.rotate(back, { x: at(normals, i), y: at(normals, i + 1), z: at(normals, i + 2) });
    normals[i] = n.x; normals[i + 1] = n.y; normals[i + 2] = n.z;
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  };
}

/**
 * The unit offset to the left of the line at point `i`, on the ground
 * plane, lengthened at a corner so both edges stay `width` apart (the
 * mitre), within reason.
 */
function side(line: LinePoint[], i: number): Offset {
  const normalOf = (a: LinePoint, b: LinePoint): Offset => {
    const dx = b.x - a.x;
    const dz = (b.z ?? 0) - (a.z ?? 0);
    const length = Math.hypot(dx, dz) || 1;
    return [-dz / length, dx / length];
  };
  const before = i > 0 ? normalOf(at(line, i - 1), at(line, i)) : null;
  const after = i < line.length - 1 ? normalOf(at(line, i), at(line, i + 1)) : null;
  // A line of one point has no direction at all; `line` never yields one.
  if (!before) return after ?? [0, 0];
  if (!after) return before;
  const sum: Offset = [before[0] + after[0], before[1] + after[1]];
  const length = Math.hypot(...sum);
  if (length < 1e-6) return after;
  const mitre: Offset = [sum[0] / length, sum[1] / length];
  const reach = Math.min(MAX_MITRE, 1 / Math.max(1e-6, mitre[0] * after[0] + mitre[1] * after[1]));
  return [mitre[0] * reach, mitre[1] * reach];
}
