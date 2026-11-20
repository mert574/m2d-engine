import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import { s } from '../core/schema.ts';

/** The body as an obstacle box, in world terms; z and halfZ ride along in 3D. */
interface ObstacleBox { x: number; y: number; z?: number; halfX: number; halfY: number; halfZ?: number; angle: number }
/** The members of `game.nav` this constraint drives. */
interface NavCuts {
  addObstacle(box: ObstacleBox): number;
  moveObstacle(id: number, box: ObstacleBox): void;
  removeObstacle(id: number): void;
}

/**
 * The entity cuts the navmesh: a crate dragged across a hall, a gate
 * swung shut, a cart on its rounds. Needs a dynamic nav agent
 * (`m2d.project.json` `navAgents.<name>.dynamic`), whose mesh is a tile
 * cache the cut rebuilds around the body; on a scene without one it is
 * reported once and does nothing.
 *
 * The cut follows the body: when it has moved or turned by more than
 * `granularity`, the old cut heals and a new one lands, before the next
 * tick's routes. Its state is the obstacle's id and the box it last cut —
 * plain fields, so a snapshot carries it with the obstacle list it
 * matches (`game.nav`'s tracked state). `margin` is grown around the body
 * on every side; `granularity` the world units of movement that re-cut.
 */
export class NavObstacle extends Constraint {
  static override description = 'The entity cuts the navmesh around its body as it moves (needs a dynamic nav agent)';
  static override params = {
    margin: s.number({ min: 0, initial: 0, description: 'Grown around the body on every side, world units' }),
    granularity: s.number({ positive: true, initial: 4, description: 'How far the body moves before the cut follows, world units' })
  };

  margin: number;
  granularity: number;
  obstacleId: number;
  lastBox: ObstacleBox | null;
  inert: boolean;

  constructor(entity: Entity, options: { margin?: number; granularity?: number } = {}) {
    super(entity);
    this.margin = options.margin ?? 0;
    this.granularity = options.granularity ?? 4;
    /** The cut's id in `game.nav`, 0 while none stands. */
    this.obstacleId = 0;
    /** The box last cut, to measure movement against. */
    this.lastBox = null;
    /** Set when the scene has no dynamic mesh, so nothing retries every tick. */
    this.inert = false;
  }

  /** The body as an obstacle box, in world terms. */
  #box(): ObstacleBox {
    const body = this.entity.body as {
      position: { x: number; y: number; z?: number };
      size: { x: number; y: number; z?: number };
      angle?: number;
      rotation?: { y: number; w: number } | null;
    };
    const { x, y } = body.position;
    const size = body.size;
    const flat = ((this.entity.game.options as { dimensions?: number }).dimensions ?? 2) !== 3;
    if (flat) {
      return { x, y, halfX: size.x / 2 + this.margin, halfY: size.y / 2 + this.margin, angle: body.angle ?? 0 };
    }
    const q = body.rotation;
    return {
      x, y, z: body.position.z ?? 0,
      halfX: size.x / 2 + this.margin, halfY: size.y / 2 + this.margin, halfZ: (size.z ?? size.x) / 2 + this.margin,
      angle: q ? 2 * Math.atan2(q.y, q.w) : 0
    };
  }

  override fixedUpdate(): void {
    if (this.inert || this.entity.dead) return;
    const nav = this.entity.game.nav as NavCuts;
    const box = this.#box();
    if (!this.obstacleId) {
      this.obstacleId = nav.addObstacle(box);
      if (!this.obstacleId) {
        this.inert = true;
        return;
      }
      this.lastBox = box;
      return;
    }
    const last = this.lastBox!;
    const moved = Math.abs(box.x - last.x) + Math.abs(box.y - last.y) + Math.abs((box.z ?? 0) - (last.z ?? 0));
    const turned = Math.abs((box.angle ?? 0) - (last.angle ?? 0));
    if (moved >= this.granularity || turned >= 0.1) {
      nav.moveObstacle(this.obstacleId, box);
      this.lastBox = box;
    }
  }

  /** The entity goes, the cut heals. */
  override destroy(): void {
    if (this.obstacleId) (this.entity.game.nav as NavCuts).removeObstacle(this.obstacleId);
    this.obstacleId = 0;
  }
}
