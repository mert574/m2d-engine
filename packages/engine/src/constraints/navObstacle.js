import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';

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
 * matches (`game.nav`'s tracked state).
 *
 * @param {object} options
 * @param {number} [options.margin=0] - Grown around the body on every side
 * @param {number} [options.granularity=4] - World units of movement that re-cut
 */
export class NavObstacle extends Constraint {
  static description = 'The entity cuts the navmesh around its body as it moves (needs a dynamic nav agent)';
  static params = {
    margin: s.number({ min: 0, initial: 0, description: 'Grown around the body on every side, world units' }),
    granularity: s.number({ positive: true, initial: 4, description: 'How far the body moves before the cut follows, world units' })
  };

  constructor(entity, options = {}) {
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
  #box() {
    const body = this.entity.body;
    const { x, y } = body.position;
    const size = body.size;
    const flat = (this.entity.game.options.dimensions ?? 2) !== 3;
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

  fixedUpdate() {
    if (this.inert || this.entity.dead) return;
    const nav = this.entity.game.nav;
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
    const last = this.lastBox;
    const moved = Math.abs(box.x - last.x) + Math.abs(box.y - last.y) + Math.abs((box.z ?? 0) - (last.z ?? 0));
    const turned = Math.abs((box.angle ?? 0) - (last.angle ?? 0));
    if (moved >= this.granularity || turned >= 0.1) {
      nav.moveObstacle(this.obstacleId, box);
      this.lastBox = box;
    }
  }

  /** The entity goes, the cut heals. */
  destroy() {
    if (this.obstacleId) this.entity.game.nav.removeObstacle(this.obstacleId);
    this.obstacleId = 0;
  }
}
