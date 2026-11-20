import { Angle } from './math.ts';
import type { M2D } from './m2d.js';
import type { Entity } from './entity.ts';
import type { PhysicsBody } from './physics/index.ts';

/** A point either dimension's world hands around. */
interface Point3ish { x: number; y: number; z?: number }

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
function ground(game: M2D, point: Point3ish): { x: number; y: number } {
  return ((game.options as { dimensions?: number }).dimensions ?? 2) === 3
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
 * `blockers` is the collision layers that block sight (unset, every
 * non-dynamic body does); `ignore` the bodies the ray passes through
 * regardless (the viewer's own, the target's).
 */
export function lineOfSight(game: M2D, from: Point3ish, to: Point3ish, { blockers = null, ignore = [] }: { blockers?: string[] | null; ignore?: PhysicsBody[] } = {}): boolean {
  const mask = blockers ? game.collisionLayers!.mask(blockers) : null;
  // The union's raycast signatures disagree on the point type until phase
  // 10; the receiver is cast, never the method — detached, it loses `this`.
  const physics = game.physics as unknown as {
    raycast(from: Point3ish, to: Point3ish, keep: (body: PhysicsBody) => boolean): unknown[];
  };
  const hits = physics.raycast(from, to, (body) => {
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
 * `target` is an entity, or a bare point (a last-seen position, a noise).
 * `range` is the ground distance the sight reaches (unset, any distance);
 * `cone` the width of the view cone in radians centred on `facing` (the
 * default 2π sees all around); `facing` the viewer's heading on the ground
 * plane, radians, 0 facing +x, read only when `cone` is narrower than 2π;
 * `blockers` as `lineOfSight`.
 */
export function canSee(viewer: Entity, target: Entity | Point3ish, { range, cone = Math.PI * 2, facing = 0, blockers = null }: { range?: number; cone?: number; facing?: number; blockers?: string[] | null } = {}): boolean {
  const game = viewer.game;
  const targetBody = 'body' in target ? target.body : null;
  const to: Point3ish = 'position' in target ? target.position : target;
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
