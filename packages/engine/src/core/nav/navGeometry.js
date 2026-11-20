/**
 * What a navmesh is baked from: the built level's static colliders and its
 * nav volumes, as triangles in nav space. Walking the physics world — not
 * the scene file — means prefab defaults, prop colliders and model bounds
 * are already folded in, and the same walk runs headless, in the browser
 * and in the editor, so the bake and the load-time stamp agree.
 *
 * Nav space is Recast's: metres-like units, y up. A 3D level is already
 * that. A 2D level is flat 3D to it: the world's rectangle as a floor quad
 * at y = 0, each static collider as a box standing on it, the 2D plane's
 * (x, y) laid onto nav (x, z).
 */

import { Quat } from '../math.ts';

/** How tall a 2D collider stands in nav space, relative to the agent. */
const WALL_RISE = 4;
/** The default fall of an agent's unstated fields, relative to its radius. */
export const AGENT_DEFAULTS = (agent) => ({
  radius: agent.radius,
  height: agent.height ?? agent.radius * 4,
  step: agent.step ?? agent.radius / 2,
  slope: agent.slope ?? 45
});

const round = (value) => Math.round(value * 1000) / 1000;

/** Push one transformed box: centre, half sizes, a rotation. */
function pushBox(out, centre, half, rotation) {
  const base = out.positions.length / 3;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const local = { x: sx * half.x, y: sy * half.y, z: sz * half.z };
    const p = rotation ? Quat.rotate(rotation, local) : local;
    out.positions.push(round(centre.x + p.x), round(centre.y + p.y), round(centre.z + p.z));
  }
  // Corners are ordered (x, y, z) sign-major: index = sx * 4 + sy * 2 + sz.
  const faces = [
    [0, 1, 3, 2], [4, 6, 7, 5], // -x, +x
    [0, 4, 5, 1], [2, 3, 7, 6], // -y, +y
    [0, 2, 6, 4], [1, 5, 7, 3]  // -z, +z
  ];
  for (const [a, b, c, d] of faces) {
    out.indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
  }
}

/** A body's half-sizes, from the box its size describes: everything is a box to the bake. */
function halfOf(body) {
  const size = body.size ?? {};
  return { x: (size.x ?? 0) / 2, y: (size.y ?? 0) / 2, z: (size.z ?? size.x ?? 0) / 2 };
}

/** Whether a static body stands in anything's way. */
function obstructs(body) {
  if (body.spec.bodyType !== 'static' || body.isSensor) return false;
  // A body on layer `none` (membership 0) collides with nothing: scenery, markers.
  const category = body.collisionFilter?.category;
  return category === undefined || category !== 0;
}

/**
 * The level's bake inputs, from the built game: flat `positions` (nav
 * space, y up) with `indices`, and the nav `volumes` to mark over them,
 * each `{ x, z, hmin, hmax, halfX, halfZ, area }` (an axis-aligned box in
 * nav space; a turned NavVolume covers its turned footprint's box). The
 * numbers are rounded so the stamp hashes the same in every runtime.
 *
 * @param {import('../m2d.js').M2D} game - With its level scene built.
 * @param {object} agent - An agent profile; sizes the 2D wall rise.
 * @param {import('../scene.js').Scene} [scene] - The built level; the current one when unset.
 * @returns {{positions: number[], indices: number[], volumes: object[], dimensions: number}}
 */
export function navGeometryOf(game, agent, scene = game.sceneManager?.getCurrentScene()) {
  const dimensions = (game.options.dimensions ?? 2) === 3 ? 3 : 2;
  const out = { positions: [], indices: [], volumes: [], dimensions };
  const profile = AGENT_DEFAULTS(agent);
  const rise = profile.height * WALL_RISE;

  // Nav volumes are entities (`NavVolume`), never obstacles themselves.
  const volumeEntities = new Set();
  for (const entity of game.entities) {
    if (entity.constructor?.navArea === undefined) continue;
    volumeEntities.add(entity.body);
    const area = entity.area ?? 'blocked';
    const body = entity.body;
    const { x, y } = body.position;
    const z = body.position.z ?? 0;
    const size = body.size ?? { x: 0, y: 0, z: 0 };
    const volume = dimensions === 3
      ? { x: round(x), z: round(z), hmin: round(y - size.y / 2), hmax: round(y + size.y / 2), halfX: round(size.x / 2), halfZ: round((size.z ?? size.x) / 2), area }
      : { x: round(x), z: round(y), hmin: round(-rise), hmax: round(rise), halfX: round(size.x / 2), halfZ: round(size.y / 2), area };
    out.volumes.push(volume);
    // A blocked volume is also a wall: geometry, so erosion keeps the
    // agent's radius away from it as it does from any obstacle.
    if (area === 'blocked') {
      pushBox(out, { x: volume.x, y: (volume.hmin + volume.hmax) / 2, z: volume.z },
        { x: volume.halfX, y: (volume.hmax - volume.hmin) / 2, z: volume.halfZ }, null);
    }
  }
  out.volumes.sort((a, b) => a.x - b.x || a.z - b.z || (a.area < b.area ? -1 : 1));

  if (dimensions === 2) {
    const world = scene?.config?.world ?? {};
    const width = world.width ?? 0;
    const height = world.height ?? 0;
    if (!width || !height) {
      throw new Error("M2D nav: a 2D level needs world.width and world.height; they are the floor the navmesh is baked over");
    }
    // The floor: the world rectangle at y = 0, nav (x, z) = world (x, y).
    const base = out.positions.length / 3;
    out.positions.push(0, 0, 0, round(width), 0, 0, round(width), 0, round(height), 0, 0, round(height));
    out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  for (const body of game.physics.bodies) {
    if (!obstructs(body) || volumeEntities.has(body)) continue;
    const half = halfOf(body);
    if (dimensions === 3) {
      const { x, y, z } = body.position;
      pushBox(out, { x, y, z: z ?? 0 }, half, body.rotation ?? null);
    } else {
      const { x, y } = body.position;
      const angle = body.angle ?? 0;
      // The 2D plane lies on nav (x, z); a 2D turn is a turn about nav y.
      pushBox(out, { x, y: rise / 2, z: y }, { x: half.x, y: rise / 2, z: half.y },
        angle ? Quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, -angle) : null);
    }
  }
  return out;
}
