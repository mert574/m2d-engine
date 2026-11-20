import { Angle } from './math.ts';

/**
 * Sight for the simulation: pure queries over the physics world, so an NPC
 * can ask "do I see that?" inside its `fixedUpdate` and a replay asks the
 * same question of the same world. Nothing here keeps state — a sensing
 * interval or a last-seen position is the caller's, as plain fields a
 * snapshot carries.
 *
 * The view cone and the range live on the ground plane — (x, y) flat,
 * (x, z) in a 3D scene, as movement does — while the blocking test is the
 * world's own ray between the two bodies, so a wall occludes in any
 * dimension.
 */

/** A point's ground coordinates: (x, y) flat, (x, z) in a 3D scene. */
function ground(game, point) {
  return (game.options.dimensions ?? 2) === 3
    ? { x: point.x, y: point.z ?? 0 }
    : { x: point.x, y: point.y };
}

/**
 * Whether nothing blocks the segment between two points.
 *
 * What blocks is the `blockers` collision layers; unset, anything that is
 * not a dynamic body — the walls and platforms of the level, as a turret's
 * sight always worked — so a crowd never hides its quarry by accident.
 * Sensors never block: a trigger volume is not a thing in the world.
 *
 * @param {import('./m2d.js').M2D} game
 * @param {{x: number, y: number, z?: number}} from
 * @param {{x: number, y: number, z?: number}} to
 * @param {Object} [options]
 * @param {string[]} [options.blockers] - Collision layers that block sight;
 *   unset, every non-dynamic body does
 * @param {Array} [options.ignore] - Bodies the ray passes through regardless
 *   (the viewer's own, the target's)
 * @returns {boolean}
 */
export function lineOfSight(game, from, to, { blockers = null, ignore = [] } = {}) {
  const mask = blockers ? game.collisionLayers.mask(blockers) : null;
  const hits = game.physics.raycast(from, to, (body) => {
    if (body.isSensor || ignore.includes(body)) return false;
    return mask === null
      ? body.bodyType !== 'dynamic'
      : (body.collisionFilter.category & mask) !== 0;
  });
  return hits.length === 0;
}

/**
 * Whether `viewer` sees `target`: within `range` on the ground, inside the
 * view cone around `facing`, and with nothing in the way. The viewer's and
 * the target's own bodies never block their own sight line.
 *
 * @param {import('./entity.js').Entity} viewer
 * @param {import('./entity.js').Entity|{x: number, y: number, z?: number}} target
 *   An entity, or a bare point (a last-seen position, a noise)
 * @param {Object} [options]
 * @param {number} [options.range] - Ground distance the sight reaches;
 *   unset, any distance
 * @param {number} [options.cone] - Width of the view cone in radians,
 *   centred on `facing`; the default 2π sees all around
 * @param {number} [options.facing] - The viewer's heading on the ground
 *   plane, radians, 0 facing +x. Only read when `cone` is narrower than 2π
 * @param {string[]} [options.blockers] - As `lineOfSight`
 * @returns {boolean}
 */
export function canSee(viewer, target, { range, cone = Math.PI * 2, facing = 0, blockers = null } = {}) {
  const game = viewer.game;
  const targetBody = target.body ?? null;
  const to = target.position ?? target;
  const a = ground(game, viewer.position);
  const b = ground(game, to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (range !== undefined && Math.hypot(dx, dy) > range) return false;
  if (cone < Math.PI * 2 && !Angle.inArc(Math.atan2(dy, dx), facing, cone)) return false;
  return lineOfSight(game, viewer.position, to, {
    blockers,
    ignore: targetBody ? [viewer.body, targetBody] : [viewer.body]
  });
}
