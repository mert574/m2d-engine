import { s } from 'm2d-engine/core/schema.js';
import { Quat } from 'm2d-engine/core/math.js';
import { Scenery } from './scenery.js';

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
  static description = 'A strip laid along one of the scene\'s paths: a kerb, a fence line, a road edge';
  static properties = {
    path: s.ref('path', { label: 'Path', description: 'The scene\'s path it is laid along, as its centreline' }),
    width: s.number({ positive: true, initial: 16, description: 'Across the path: px in 2D, metres in 3D' }),
    height: s.number({ min: 0, initial: 0, unit: 'm', description: '3D: how far it stands up from the path; 0 lays it flat' }),
    repeat: s.number({ positive: true, unit: 'px', description: '2D: one tile of the sprite along the path; its width by default' }),
    color: s.string({ editor: 'color', initial: '#8b95a3', label: 'Colour', description: '2D: the band, with no sprite' })
  };

  /** A strip laid along nothing draws nothing: it names its path. */
  static refineProperties(properties, { fail }) {
    if (!properties.path) fail('path', 'a strip is laid along a path: name one of the scene\'s paths');
  }

  name = 'PathStrip';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, 0);
    // Under whatever stands on it at its own zIndex.
    this.depth = -Infinity;
    this.pathName = options.path ?? null;
    this.width = options.width ?? 16;
    this.height = options.height ?? 0;
    this.repeat = options.repeat ?? null;
    this.color = options.color ?? '#8b95a3';
    /** The 3D mesh and the line it was built from: a path edited in the editor is a new line. */
    this.built = null;
    this.builtFrom = null;
    if (sprite) this.setAnimation('default');
  }

  /** Its prefab's mesh block, which the 3D strip is drawn with (scenery otherwise keeps none) — once it has a line to be built along. */
  get mesh() {
    return this.geometry ? this.ownMesh ?? null : null;
  }

  set mesh(value) {
    this.ownMesh = value;
  }

  /** The path's flattened line, or null before the scene is current or when it names none. */
  get line() {
    const path = this.pathName ? this.scene?.pathFor(this, this.pathName) : null;
    return path?.line.length >= 2 ? path.line : null;
  }

  /** 3D: the strip's mesh in its body's frame, built from the path's line, and again when the line changes. */
  get geometry() {
    if (this.game.physics.dimensions !== 3) return null;
    const line = this.line;
    if (!line) return null;
    if (this.builtFrom !== line) {
      this.built = stripGeometry(line, this.width, this.height, this.body.position, this.body.rotation);
      this.builtFrom = line;
    }
    return this.built;
  }

  paint() {
    const ground = this.line;
    if (!ground) return;
    // Drawn on the render plane: through the level's projection, as everything placed on the ground is.
    const projection = this.game.projection;
    const line = projection ? ground.map((p) => projection.toScreen(p.x, p.y)) : ground;
    const renderer = this.game.renderer;
    if (!this.sprite?.width) {
      renderer.drawPath({ points: line, closed: false, strokeStyle: this.color, lineWidth: this.width });
      return;
    }
    const tile = this.repeat ?? this.width;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
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
export function stripGeometry(line, width, height, origin, rotation) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const half = width / 2;
  const sides = line.map((point, i) => side(line, i).map((v) => v * half));
  let along = 0;
  const distances = line.map((point, i) => (along += i ? Math.hypot(point.x - line[i - 1].x, (point.z ?? 0) - (line[i - 1].z ?? 0)) : 0));
  const y = (point) => point.y ?? 0;
  const vertex = (point, [sx, sz], up, normal, u, v) => {
    positions.push(point.x + sx, y(point) + up, (point.z ?? 0) + sz);
    normals.push(...normal);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);

  // The top (or the whole ribbon): left and right edge along the line.
  const top = line.map((point, i) => [
    vertex(point, sides[i], height, [0, 1, 0], 0, distances[i] / width),
    vertex(point, [-sides[i][0], -sides[i][1]], height, [0, 1, 0], 1, distances[i] / width)
  ]);
  for (let i = 1; i < line.length; i++) quad(top[i - 1][0], top[i][0], top[i][1], top[i - 1][1]);

  if (height > 0) {
    // Each side face, from the ground up, facing out along the side.
    for (const sign of [1, -1]) {
      const wall = line.map((point, i) => {
        const [sx, sz] = sides[i].map((v) => v * sign);
        const length = Math.hypot(sx, sz) || 1;
        const normal = [sx / length, 0, sz / length];
        return [vertex(point, [sx, sz], 0, normal, distances[i] / width, 0), vertex(point, [sx, sz], height, normal, distances[i] / width, height / width)];
      });
      for (let i = 1; i < line.length; i++) {
        if (sign > 0) quad(wall[i - 1][0], wall[i][0], wall[i][1], wall[i - 1][1]);
        else quad(wall[i - 1][0], wall[i - 1][1], wall[i][1], wall[i][0]);
      }
    }
    // The two ends, facing away along the line.
    for (const [i, j] of [[0, 1], [line.length - 1, line.length - 2]]) {
      const dx = line[i].x - line[j].x;
      const dz = (line[i].z ?? 0) - (line[j].z ?? 0);
      const length = Math.hypot(dx, dz) || 1;
      const normal = [dx / length, 0, dz / length];
      const [sx, sz] = sides[i];
      const corners = [[sx, sz, 0], [-sx, -sz, 0], [-sx, -sz, height], [sx, sz, height]]
        .map(([cx, cz, up], k) => vertex(line[i], [cx, cz], up, normal, k === 1 || k === 2 ? 1 : 0, up / width));
      if (i === 0) quad(corners[0], corners[3], corners[2], corners[1]);
      else quad(corners[0], corners[1], corners[2], corners[3]);
    }
  }

  // Into the body's frame: less its position, turned back by its rotation.
  const back = Quat.conjugate(rotation ?? Quat.identity());
  for (let i = 0; i < positions.length; i += 3) {
    const local = Quat.rotate(back, { x: positions[i] - origin.x, y: positions[i + 1] - origin.y, z: positions[i + 2] - (origin.z ?? 0) });
    positions[i] = local.x; positions[i + 1] = local.y; positions[i + 2] = local.z;
    const n = Quat.rotate(back, { x: normals[i], y: normals[i + 1], z: normals[i + 2] });
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
function side(line, i) {
  const normalOf = (a, b) => {
    const dx = b.x - a.x;
    const dz = (b.z ?? 0) - (a.z ?? 0);
    const length = Math.hypot(dx, dz) || 1;
    return [-dz / length, dx / length];
  };
  const before = i > 0 ? normalOf(line[i - 1], line[i]) : null;
  const after = i < line.length - 1 ? normalOf(line[i], line[i + 1]) : null;
  if (!before) return after;
  if (!after) return before;
  const sum = [before[0] + after[0], before[1] + after[1]];
  const length = Math.hypot(...sum);
  if (length < 1e-6) return after;
  const mitre = [sum[0] / length, sum[1] / length];
  const reach = Math.min(MAX_MITRE, 1 / Math.max(1e-6, mitre[0] * after[0] + mitre[1] * after[1]));
  return [mitre[0] * reach, mitre[1] * reach];
}
