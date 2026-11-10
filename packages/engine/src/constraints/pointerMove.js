import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';

/**
 * Click to move: a press on the world sets a destination on the ground, and
 * the entity walks there in a straight line and stops.
 *
 * Reads the tick's input snapshot, so the destination is part of the
 * simulation and a replay walks the same way. The snapshot's pointer is
 * already in ground coordinates under a projection, so the same code moves
 * an isometric hero and a top-down one.
 *
 * @param {Object} options
 * @param {number} [options.speed=200] - px/s on the ground, or on screen
 *   under a projection with `speedSpace: 'screen'` (the default), so the
 *   walk looks the same pace whichever way it heads
 * @param {number} [options.arrive=8] - Stop within this distance
 * @param {number} [options.button=0] - Which pointer button, as a bit index
 * @param {Function} [options.onArrive] - Bound to the entity
 * @param {Function} [options.onMove] - `(dx, dy)` unit direction each tick while moving
 */
export class PointerMove extends Constraint {
  static description = 'Click to move: a press on the world sets a destination to walk to';
  static params = {
    speed: s.number({ initial: 200, positive: true, unit: 'px/s' }),
    speedSpace: s.enumOf(['screen', 'world'], { initial: 'screen' }),
    arrive: s.number({ initial: 8, min: 0, unit: 'px' }),
    button: s.integer({ initial: 0, min: 0, label: 'Pointer button' })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.speed = options.speed ?? 200;
    this.speedSpace = options.speedSpace ?? 'screen';
    this.arrive = options.arrive ?? 8;
    this.button = options.button ?? 0;
    this.onArrive = options.onArrive?.bind(entity);
    this.onMove = options.onMove?.bind(entity);
    this.destination = null;
  }

  /** Walk somewhere from code. */
  goTo(x, y) {
    this.destination = { x, y };
  }

  stop() {
    this.destination = null;
  }

  get moving() {
    return this.destination !== null;
  }

  fixedUpdate(dt) {
    if (this.entity.dead) return;
    const input = this.entity.input;
    const pointer = input.pointer;
    // The press edge carries its buttons, so a click that was released
    // before this tick still counts.
    const pressedMask = pointer.pressedButtons ?? (pointer.pressed ? pointer.buttons : 0);
    if (pressedMask & (1 << this.button)) this.destination = { x: pointer.world.x, y: pointer.world.y };

    if (!this.destination) return;
    const position = this.entity.position;
    const dx = this.destination.x - position.x;
    const dy = this.destination.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= this.arrive) {
      this.destination = null;
      this.entity.body.setVelocity({ x: 0, y: 0 });
      this.onArrive?.();
      return;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const projection = this.entity.game.projection;
    const speed = this.speed * (projection && this.speedSpace === 'screen' ? projection.groundSpeedScale(nx, ny) : 1);
    this.entity.body.setVelocity({ x: nx * speed, y: ny * speed });
    this.onMove?.(nx, ny);
  }
}
