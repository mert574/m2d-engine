import { Constraint } from '../core/constraint.js';

/** How close to a path point counts as arrived, in px. */
const ARRIVE_DISTANCE = 1;

/**
 * Patrols a kinematic body along a list of points, pausing at each one.
 *
 * Speed follows a trapezoid: ramp up, cruise, then brake so it reaches zero
 * exactly at the point (the braking cap is the speed from which
 * `acceleration` can still stop within the remaining distance). The profile
 * is what makes the body safe to stand on — a hard stop hands every rider
 * the body's full velocity as a parting gift (300 px/s up is a 45px
 * launch), and a hard start downward drops them into free fall.
 *
 * The body is commanded by *velocity*, which the physics world integrates
 * once per step, so motion is identical however the frames fall; see the
 * kinematic notes in core/physics/index.js.
 *
 * @param {object} options
 * @param {{x: number, y: number}[]} options.points - Patrol points, visited
 *   in order and then from the top. Fewer than two means stay put.
 * @param {number} [options.speed] - Cruise speed, px/s.
 * @param {number} [options.waitTime] - Pause at each point, in ms (the unit
 *   scene JSON has always used).
 * @param {number} [options.acceleration] - Ramp rate, px/s²; defaults to
 *   reaching cruise speed in half a second.
 */
export class PathFollow extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.points = options.points || [];
    this.speed = options.speed || 3;
    this.waitTime = (options.waitTime ?? 1000) / 1000;
    this.acceleration = options.acceleration ?? this.speed * 2;
    this.currentSpeed = 0;
    this.currentPoint = 0;
    /** Seconds of pause left; counted in game time, so pausing pauses it. */
    this.waitLeft = 0;

    if (this.points.length > 0) {
      entity.body.setPosition({ x: this.points[0].x, y: this.points[0].y });
    }
  }

  /** Hold position, keeping riders steady rather than sliding out. */
  #halt() {
    this.currentSpeed = 0;
    this.entity.body.setVelocity({ x: 0, y: 0 });
  }

  update(deltaTime) {
    if (this.points.length < 2) return;

    if (this.waitLeft > 0) {
      this.waitLeft -= deltaTime;
      if (this.waitLeft <= 0) {
        this.currentPoint = (this.currentPoint + 1) % this.points.length;
      }
      this.#halt();
      return;
    }

    const target = this.points[this.currentPoint];
    const position = this.entity.body.position;
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < ARRIVE_DISTANCE) {
      this.waitLeft = this.waitTime;
      this.#halt();
      this.entity.body.setNextPosition(target);
      return;
    }

    this.currentSpeed = Math.min(
      this.speed,
      this.currentSpeed + this.acceleration * deltaTime,
      Math.sqrt(2 * this.acceleration * distance)
    );
    this.entity.body.setVelocity({
      x: (dx / distance) * this.currentSpeed,
      y: (dy / distance) * this.currentSpeed
    });
  }
}
