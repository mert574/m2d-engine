import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';

/**
 * Click to move: a press on the world sets a destination on the ground, and
 * the entity walks there and stops. With a navmesh loaded (the scene's
 * `assets.navmeshes`; see core/nav/nav.js) the walk follows a route around
 * the walls, and a click that cannot be reached — off the mesh, walled in,
 * or further along the route than `maxPathLength` — does nothing at all.
 * Without one, the walk is the straight line it always was.
 *
 * Reads the tick's input snapshot, so the destination is part of the
 * simulation and a replay walks the same way; the route is a pure function
 * of the baked mesh, so it is too. The snapshot's pointer is already in
 * ground coordinates under a projection, so the same code moves an
 * isometric hero and a top-down one. The path is plain points and an
 * index, so a snapshot carries a walk mid-route.
 *
 * @param {Object} options
 * @param {number} [options.speed=200] - px/s on the ground, or on screen
 *   under a projection with `speedSpace: 'screen'` (the default), so the
 *   walk looks the same pace whichever way it heads
 * @param {number} [options.arrive=8] - Stop within this distance
 * @param {number} [options.button=0] - Which pointer button, as a bit index
 * @param {string} [options.agent] - The nav agent profile to route as; the
 *   project's only one when unset
 * @param {number} [options.maxPathLength] - Refuse a route longer than this
 *   many ground units; unset, any length goes
 * @param {Function} [options.onArrive] - Bound to the entity
 * @param {Function} [options.onMove] - `(dx, dy)` unit direction each tick while moving
 */
export class PointerMove extends Constraint {
  static description = 'Click to move: a press on the world sets a destination to walk to, routed over the navmesh when the scene has one';
  static params = {
    speed: s.number({ initial: 200, positive: true, unit: 'px/s' }),
    speedSpace: s.enumOf(['screen', 'world'], { initial: 'screen' }),
    arrive: s.number({ initial: 8, min: 0, unit: 'px' }),
    button: s.integer({ initial: 0, min: 0, label: 'Pointer button' }),
    agent: s.ref('navAgent', { label: 'Nav agent', description: "The agent profile the route is asked for (m2d.project.json navAgents); the only one when unset" }),
    maxPathLength: s.number({ positive: true, unit: 'px', label: 'Max path length', description: 'A click whose route is longer than this does nothing' })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.speed = options.speed ?? 200;
    this.speedSpace = options.speedSpace ?? 'screen';
    this.arrive = options.arrive ?? 8;
    this.button = options.button ?? 0;
    this.agent = options.agent;
    this.maxPathLength = options.maxPathLength;
    this.onArrive = options.onArrive?.bind(entity);
    this.onMove = options.onMove?.bind(entity);
    this.destination = null;
    /** The route's remaining corners when a navmesh routed the walk, oldest first. @type {{x: number, y: number}[]|null} */
    this.path = null;
    /** How far along `path` the walk is. */
    this.waypoint = 0;
  }

  /**
   * Walk somewhere from code: routed like a click, and ignored like one
   * when no route exists. Returns whether the walk was taken.
   */
  goTo(x, y) {
    return this.#head({ x, y });
  }

  stop() {
    this.destination = null;
    this.path = null;
    this.waypoint = 0;
  }

  get moving() {
    return this.destination !== null;
  }

  /**
   * Set the walk's target: over the navmesh when one is loaded for the
   * agent, straight otherwise. An unreachable or over-budget target leaves
   * the current walk as it was.
   */
  #head(target) {
    const nav = this.entity.game.nav;
    if (nav?.has(this.agent)) {
      const route = nav.findPath(this.entity.position, target, { agent: this.agent, maxLength: this.maxPathLength });
      if (!route) return false;
      this.path = route.points;
      this.waypoint = 1;
      this.destination = route.points[route.points.length - 1];
      return true;
    }
    this.path = null;
    this.waypoint = 0;
    this.destination = { x: target.x, y: target.y };
    return true;
  }

  fixedUpdate(dt) {
    if (this.entity.dead) return;
    const input = this.entity.input;
    const pointer = input.pointer;
    // The press edge carries its buttons, so a click that was released
    // before this tick still counts.
    const pressedMask = pointer.pressedButtons ?? (pointer.pressed ? pointer.buttons : 0);
    if (pressedMask & (1 << this.button)) this.#head({ x: pointer.world.x, y: pointer.world.y });

    if (!this.destination) return;
    const position = this.entity.position;

    // Along the route: a corner reached is the next corner's turn, and the
    // last one is the destination the arrive check below settles.
    while (this.path && this.waypoint < this.path.length - 1) {
      const corner = this.path[this.waypoint];
      if (Math.hypot(corner.x - position.x, corner.y - position.y) > Math.max(this.arrive, 2)) break;
      this.waypoint++;
    }
    const target = this.path ? this.path[Math.min(this.waypoint, this.path.length - 1)] : this.destination;

    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy);
    const last = !this.path || this.waypoint >= this.path.length - 1;
    if (last && distance <= this.arrive) {
      this.stop();
      this.entity.body.setVelocity({ x: 0, y: 0 });
      this.onArrive?.();
      return;
    }
    if (!distance) return;
    const nx = dx / distance;
    const ny = dy / distance;
    const projection = this.entity.game.projection;
    const speed = this.speed * (projection && this.speedSpace === 'screen' ? projection.groundSpeedScale(nx, ny) : 1);
    this.entity.body.setVelocity({ x: nx * speed, y: ny * speed });
    this.onMove?.(nx, ny);
  }
}
