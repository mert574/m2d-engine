import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';

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
 * With `path` naming one of the scene's `paths`, the body travels along
 * that line by arc length instead: from the point on it nearest to where
 * the body was placed, around a closed path, back and forth along an open
 * one, pausing at each control point unless `stopAtPoints` is false.
 *
 * @param {object} options
 * @param {{x: number, y: number}[]} options.points - Patrol points, visited
 *   in order and then from the top. Fewer than two means stay put.
 * @param {string} [options.path] - A path in the scene's `paths`; wins over `points`.
 * @param {boolean} [options.stopAtPoints] - With `path`: pause at every control point (default), or only at an open path's ends.
 * @param {number} [options.speed] - Cruise speed, px/s.
 * @param {number} [options.waitTime] - Pause at each point, in ms (the unit
 *   scene JSON has always used).
 * @param {number} [options.acceleration] - Ramp rate, px/s²; defaults to
 *   reaching cruise speed in half a second.
 */
export class PathFollow extends Constraint {
  static description = 'Patrol a path of points, pausing at each';
  static params = {
    points: s.array(s.object({ x: s.number({ required: true }), y: s.number({ required: true }) }),
      { label: 'Path points' }),
    path: s.ref('path', { label: 'Path', description: "One of the scene's paths, followed along its line; wins over the points" }),
    stopAtPoints: s.boolean({ initial: true, description: "With a path: pause at each of its points, or only at an open path's ends" }),
    speed: s.number({ initial: 3, positive: true }),
    waitTime: s.number({ initial: 1000, min: 0, unit: 'ms' }),
    acceleration: s.number({ positive: true, description: 'Defaults to twice the speed' })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.points = options.points || [];
    this.path = options.path ?? null;
    this.stopAtPoints = options.stopAtPoints ?? true;
    this.speed = options.speed || 3;
    this.waitTime = (options.waitTime ?? 1000) / 1000;
    this.acceleration = options.acceleration ?? this.speed * 2;
    this.accelerationSet = options.acceleration !== undefined;
    this.currentSpeed = 0;
    this.currentPoint = 0;
    /** Seconds of pause left; counted in game time, so pausing pauses it. */
    this.waitLeft = 0;
    /**
     * With `path`: the resolved Path (on the first tick, as the entity's
     * scene id is set after its constructor), the arc length travelled,
     * the direction along it and where the next pause is. Public, so a
     * snapshot captures them.
     */
    this.route = null;
    this.distance = 0;
    this.direction = 1;
    this.goal = 0;

    if (!this.path && this.points.length > 0) {
      entity.body.setPosition({ x: this.points[0].x, y: this.points[0].y });
    }
  }

  /**
   * `acceleration` follows `speed` unless it was set explicitly, so a scene
   * that retunes `speed` alone does not leave a stale `acceleration` behind.
   */
  configure(params) {
    super.configure(params);
    if (params.waitTime !== undefined) this.waitTime = params.waitTime / 1000;
    if (params.path !== undefined || params.stopAtPoints !== undefined) this.route = null;
    if (params.acceleration !== undefined) this.accelerationSet = true;
    else if (params.speed !== undefined && !this.accelerationSet) this.acceleration = this.speed * 2;
  }

  /** Hold position, keeping riders steady rather than sliding out. */
  #halt() {
    this.currentSpeed = 0;
    this.entity.body.setVelocity({ x: 0, y: 0 });
  }

  fixedUpdate(dt) {
    if (this.path) {
      this.#followPath(dt);
      return;
    }
    if (this.points.length < 2) return;

    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
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
      this.currentSpeed + this.acceleration * dt,
      Math.sqrt(2 * this.acceleration * distance)
    );
    this.entity.body.setVelocity({
      x: (dx / distance) * this.currentSpeed,
      y: (dy / distance) * this.currentSpeed
    });
  }

  #followPath(dt) {
    if (!this.route) {
      const route = this.entity.game.sceneManager.getCurrentScene()?.pathFor(this.entity, this.path);
      if (!route?.length) return;
      this.route = route;
      this.distance = route.nearest(this.entity.body.position);
      this.direction = 1;
      this.goal = this.#nextGoal();
    }
    const route = this.route;

    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      if (this.waitLeft <= 0) this.goal = this.#nextGoal();
      this.#halt();
      return;
    }

    const remaining = Math.abs(this.goal - this.distance);
    if (remaining < ARRIVE_DISTANCE) {
      this.distance = route.wrap(this.goal);
      if (!route.closed && (this.distance <= 0 || this.distance >= route.length)) this.direction = -this.direction;
      this.waitLeft = this.waitTime;
      this.#halt();
      this.entity.body.setNextPosition(route.pointAt(this.distance));
      if (this.waitLeft <= 0) this.goal = this.#nextGoal();
      return;
    }

    this.currentSpeed = Math.min(
      this.speed,
      this.currentSpeed + this.acceleration * dt,
      Math.sqrt(2 * this.acceleration * remaining)
    );
    this.distance += this.direction * Math.min(this.currentSpeed * dt, remaining);
    if (route.closed && this.distance >= route.length) {
      this.distance -= route.length;
      this.goal -= route.length;
    }
    const target = route.pointAt(this.distance);
    const position = this.entity.body.position;
    const velocity = { x: (target.x - position.x) / dt, y: (target.y - position.y) / dt };
    if (route.hasZ) velocity.z = (target.z - (position.z ?? 0)) / dt;
    this.entity.body.setVelocity(velocity);
  }

  /** The arc length of the next place to pause, in the direction of travel; Infinity round a closed path that never pauses. */
  #nextGoal() {
    const route = this.route;
    const d = this.distance;
    const ahead = ARRIVE_DISTANCE / 2;
    if (route.closed) {
      if (!this.stopAtPoints) return Infinity;
      return route.stops.find((stop) => stop > d + ahead) ?? route.stops[0] + route.length;
    }
    const stops = this.stopAtPoints ? route.stops : [0, route.length];
    return this.direction > 0
      ? stops.find((stop) => stop > d + ahead) ?? route.length
      : stops.findLast((stop) => stop < d - ahead) ?? 0;
  }
}
