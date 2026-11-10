import { Constraint, KEY_BINDINGS } from '../core/constraint.js';
import { s } from '../core/schema.js';

/**
 * Default bindings, as physical key codes (see keyboardControl.js).
 */
const DEFAULT_KEYS = Object.freeze({
  thrust: 'ArrowUp',
  reverse: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  fire: 'KeyX',
  boost: 'KeyC'
});

/**
 * A ship's handling: turn with the left and right keys, thrust along the
 * nose, brake or reverse against it, and coast with a little drag.
 *
 * The body is dynamic with rotation free; the constraint drives angular
 * velocity for the turn and applies thrust as a velocity change along the
 * heading, so collisions still shove the ship about. `heading` is the
 * body's angle, 0 pointing along +x. Runs in `fixedUpdate` on the tick's
 * input snapshot, so the same inputs always fly the same path.
 *
 * @param {Object} options
 * @param {Object} [options.keys]
 * @param {number} [options.thrust=520] - Acceleration along the nose, px/s²
 * @param {number} [options.reverse=260] - Braking and reverse thrust, px/s²
 * @param {number} [options.maxSpeed=420] - Speed cap, px/s
 * @param {number} [options.turn=3.2] - Yaw rate at full stick, rad/s
 * @param {number} [options.drag=0.35] - Coasting decay, 1/s
 * @param {number} [options.boostThrust=2.2] - Thrust multiplier while boosting
 * @param {number} [options.boostSpeed=1.6] - Speed-cap multiplier while boosting
 * @param {number} [options.boostDuration=1] - Seconds a boost lasts
 * @param {number} [options.boostCooldown=5] - Seconds between boosts
 * @param {Function} [options.onFire] - Called while the fire key is held, bound to the entity
 * @param {Function} [options.onBoost] - Called when a boost ignites
 */
export class ThrustControl extends Constraint {
  static description = 'Keyboard thrust and turn for a ship or a rocket';
  static params = {
    thrust: s.number({ initial: 520, positive: true, unit: 'px/s²' }),
    reverse: s.number({ initial: 260, min: 0, unit: 'px/s²' }),
    maxSpeed: s.number({ initial: 420, positive: true, unit: 'px/s' }),
    turn: s.number({ initial: 3.2, positive: true, unit: 'rad/s' }),
    drag: s.number({ initial: 0.35, min: 0 }),
    boostThrust: s.number({ initial: 2.2, positive: true, label: 'Boost thrust multiplier' }),
    boostSpeed: s.number({ initial: 1.6, positive: true, label: 'Boost speed multiplier' }),
    boostDuration: s.number({ initial: 1, positive: true, unit: 's' }),
    boostCooldown: s.number({ initial: 5, min: 0, unit: 's' }),
    keys: KEY_BINDINGS
  };

  constructor(entity, options = {}) {
    super(entity);
    this.keys = { ...DEFAULT_KEYS, ...options.keys };
    this.thrust = options.thrust ?? 520;
    this.reverse = options.reverse ?? 260;
    this.maxSpeed = options.maxSpeed ?? 420;
    this.turn = options.turn ?? 3.2;
    this.drag = options.drag ?? 0.35;
    this.boostThrust = options.boostThrust ?? 2.2;
    this.boostSpeed = options.boostSpeed ?? 1.6;
    this.boostDuration = options.boostDuration ?? 1;
    this.boostCooldown = options.boostCooldown ?? 5;
    this.onFire = options.onFire?.bind(entity);
    this.onBoost = options.onBoost?.bind(entity);
    /** 0..1: how hard the engine is pushing this tick, for the flame. */
    this.throttle = 0;
    /** -1..1: the turn this tick, for banking the sprite. */
    this.steer = 0;
    this.boostLeft = 0;
    this.boostWait = 0;
  }

  /** `keys` merges over the bindings already in place, never replaces them. */
  configure(params) {
    const { keys, ...rest } = params;
    super.configure(rest);
    if (keys) this.keys = { ...this.keys, ...keys };
  }

  get boosting() {
    return this.boostLeft > 0;
  }

  get boostReady() {
    return this.boostWait <= 0 && this.boostLeft <= 0;
  }

  fixedUpdate(dt) {
    const entity = this.entity;
    if (entity.dead) return;
    const input = entity.input;
    const body = entity.body;

    this.boostWait = Math.max(0, this.boostWait - dt);
    if (this.boostLeft > 0) this.boostLeft -= dt;
    if (input.justPressed(this.keys.boost) && this.boostReady) {
      this.boostLeft = this.boostDuration;
      this.boostWait = this.boostCooldown;
      this.onBoost?.();
    }

    this.steer = input.axis(this.keys.left, this.keys.right);
    body.setAngularVelocity(this.steer * this.turn);

    const angle = body.angle;
    const nose = { x: Math.cos(angle), y: Math.sin(angle) };
    const forward = input.isDown(this.keys.thrust) ? 1 : 0;
    const back = input.isDown(this.keys.reverse) ? 1 : 0;
    const boost = this.boosting ? this.boostThrust : 1;
    this.throttle = Math.max(forward * (this.boosting ? 1 : 0.8), this.boosting ? 1 : 0);

    let v = body.velocity;
    // Coast: a little drag so letting go settles the ship.
    const decay = Math.exp(-this.drag * dt);
    v = { x: v.x * decay, y: v.y * decay };
    v.x += nose.x * (forward * this.thrust * boost - back * this.reverse) * dt;
    v.y += nose.y * (forward * this.thrust * boost - back * this.reverse) * dt;
    const cap = this.maxSpeed * (this.boosting ? this.boostSpeed : 1);
    const speed = Math.hypot(v.x, v.y);
    if (speed > cap) { v.x *= cap / speed; v.y *= cap / speed; }
    body.setVelocity(v);

    if (input.isDown(this.keys.fire)) this.onFire?.();
  }
}
