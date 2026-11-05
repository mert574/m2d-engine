import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';

/**
 * Footsteps paced by distance travelled.
 *
 * Every `stride` world units of ground movement plays the next sound in
 * `sounds`, cycling, so a walk is a steady tread and a sprint a quicker
 * one without any per-frame timer. Steps pause in the air (an entity with
 * `isAirborne`, or off the ground for a platformer body) and below
 * `minSpeed`, and a landing plays a step of its own when `onLand` is left
 * to this constraint.
 *
 * Simulation, not presentation: the stride is integrated in `fixedUpdate`
 * from the body's velocity, so the same walk always produces the same
 * steps. The sound is not played there but raised as a `step` world event,
 * so a knight the server walks is heard by the clients watching it rather
 * than by a server with no speakers.
 *
 * @param {Object} options
 * @param {string[]} options.sounds - Sound keys loaded with the engine's `sounds` option
 * @param {number} [options.stride=34] - World units between steps
 * @param {number} [options.minSpeed=30] - Below this, no steps
 * @param {boolean} [options.landing=true] - Play a step when `elevation` returns to 0
 * @param {Function} [options.onStep] - Called with the step index, bound to the entity
 */
export class Footsteps extends Constraint {
  static params = {
    sounds: s.array(s.string({ nonEmpty: true }), { label: 'Sound keys' }),
    stride: s.number({ initial: 34, positive: true, unit: 'px' }),
    minSpeed: s.number({ initial: 30, min: 0, unit: 'px/s' }),
    landing: s.boolean({ initial: true })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.sounds = options.sounds ?? [];
    this.stride = options.stride ?? 34;
    this.minSpeed = options.minSpeed ?? 30;
    this.landing = options.landing ?? true;
    this.onStep = options.onStep?.bind(entity);
    this.travelled = 0;
    this.lastStep = 0;
    this.index = 0;
    this.wasAirborne = false;
  }

  /** Take the next step now: the simulation's half of it. */
  step() {
    const entity = this.entity;
    if (this.sounds.length) {
      const { x, y } = entity.position;
      entity.game.events?.emit('step', {
        id: entity.netId,
        sound: this.sounds[this.index % this.sounds.length],
        at: { x: Math.round(x), y: Math.round(y) }
      });
    }
    this.onStep?.(this.index);
    this.index = (this.index + 1) % Math.max(1, this.sounds.length);
  }

  /** The sound, wherever the step was taken. */
  onWorldEvent(name, data) {
    if (name === 'step' && data.sound) this.entity.game.soundManager.playSound(data.sound);
  }

  get #grounded() {
    const entity = this.entity;
    if ('isAirborne' in entity) return !entity.isAirborne;
    return typeof entity.isOnGround === 'function' ? entity.isOnGround() : true;
  }

  fixedUpdate(dt) {
    if (this.entity.dead) return;
    const grounded = this.#grounded;
    if (this.landing && grounded && this.wasAirborne) this.step();
    this.wasAirborne = !grounded;
    if (!grounded) return;

    const velocity = this.entity.velocity;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed < this.minSpeed) return;
    this.travelled += speed * dt;
    if (this.travelled - this.lastStep >= this.stride) {
      this.lastStep = this.travelled;
      this.step();
    }
  }
}
