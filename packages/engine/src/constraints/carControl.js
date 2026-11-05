import { Constraint } from '../core/constraint.js';

/**
 * Arcade top-down car handling.
 *
 * The model is the classic arcade split of velocity into the car's own
 * axes. Each tick the body's velocity is decomposed along its heading:
 * the *forward* part is what the engine and brakes act on, the *lateral*
 * part is sliding, and grip is simply how fast the lateral part dies.
 * High grip reads as rails; cut it and the car keeps travelling the way
 * it was going while the nose turns — a drift. The handbrake is exactly
 * that cut, plus a yaw kick so the rear steps out, and an oil slick is
 * the same cut applied by the world.
 *
 * The body stays dynamic, so walls, cones and other cars still hit back
 * through the solver: the constraint shapes velocity, it does not own it.
 * Heading is driven through angular velocity, speed-sensitive so the car
 * cannot pivot in place.
 *
 * Runs in `fixedUpdate` and reads `entity.input`, so two runs with
 * the same inputs drive the same path — which is what makes lap replays
 * and ghosts possible. An AI driver sets `controls` instead (see
 * `setControls`).
 *
 * @param {object} options
 * @param {object} [options.keys] - `{ throttle, brake, left, right,
 *   handbrake, nitro }` as physical key codes. Defaults to the arrows,
 *   Space and ShiftLeft, KeyX for nitro.
 * @param {boolean} [options.manual=false] - Ignore the keyboard; an AI (or
 *   a recording) supplies `controls` through `setControls`.
 * @param {number} [options.acceleration=420] - Forward drive, px/s².
 * @param {number} [options.maxSpeed=560] - Forward speed cap, px/s.
 * @param {number} [options.brake=780] - Braking, px/s².
 * @param {number} [options.maxReverse=170] - Reverse speed cap, px/s.
 * @param {number} [options.drag=0.6] - Coasting decay, 1/s. What slows the
 *   car when nothing is pressed.
 * @param {number} [options.grip=18] - Lateral decay, 1/s. How fast sliding
 *   dies; the number that separates rails from ice.
 * @param {number} [options.driftGrip=2.4] - Grip while the handbrake is
 *   held. The gap to `grip` is the drift.
 * @param {number} [options.steer=2.4] - Yaw rate at full steering, rad/s.
 * @param {number} [options.driftSteer=3.6] - Yaw rate while drifting, so
 *   the slide can be steered into and held.
 * @param {number} [options.driftThreshold=90] - Lateral px/s that counts as
 *   drifting, for `drifting` and the callbacks.
 * @param {number} [options.nitroThrust=2.1] - Acceleration multiplier while
 *   the nitro burns.
 * @param {number} [options.nitroBoost=1.35] - Speed-cap multiplier while
 *   the nitro burns.
 * @param {number} [options.nitroDuration=1.1] - Burn, seconds.
 * @param {number} [options.nitroCooldown=5] - Seconds from one ignition to
 *   the next being available.
 * @param {number[]} [options.driftBoost=[0.7, 1.5]] - Seconds of continuous
 *   drifting that charge a release boost: one level per threshold, in
 *   order. Empty disables the mechanic.
 * @param {number[]} [options.driftBoostSpeed=[1.12, 1.26]] - Speed, as a
 *   multiple of `maxSpeed`, the car is shoved to when a drift ends at each
 *   level — the kart-racer mini-turbo.
 * @param {(active: boolean) => void} [options.onDrift] - Drift started or
 *   ended. Called as a method of the constraint.
 * @param {(level: number) => void} [options.onDriftBoost] - A drift ended
 *   with a charge and the boost fired; `level` is 1-based.
 * @param {() => void} [options.onNitro] - Nitro ignited.
 */
export class CarControl extends Constraint {
  constructor(entity, options = {}) {
    super(entity);

    this.keys = {
      throttle: 'ArrowUp',
      brake: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      handbrake: 'Space',
      nitro: 'KeyX',
      ...options.keys
    };
    this.manual = options.manual ?? false;

    this.acceleration = options.acceleration ?? 420;
    this.maxSpeed = options.maxSpeed ?? 560;
    this.brake = options.brake ?? 780;
    this.maxReverse = options.maxReverse ?? 170;
    this.drag = options.drag ?? 0.6;
    // Rails at full lock: steady-state sliding is maxSpeed * steer / grip,
    // and the defaults keep that under driftThreshold — turning hard at top
    // speed grips, and only the handbrake (or oil) breaks it loose.
    this.grip = options.grip ?? 18;
    this.driftGrip = options.driftGrip ?? 2.4;
    this.steer = options.steer ?? 2.4;
    this.driftSteer = options.driftSteer ?? 3.6;
    this.driftThreshold = options.driftThreshold ?? 90;

    this.nitroThrust = options.nitroThrust ?? 2.1;
    this.nitroBoost = options.nitroBoost ?? 1.35;
    this.nitroDuration = options.nitroDuration ?? 1.1;
    this.nitroCooldown = options.nitroCooldown ?? 5;

    this.driftBoost = options.driftBoost ?? [0.7, 1.5];
    this.driftBoostSpeed = options.driftBoostSpeed ?? [1.12, 1.26];

    this.onDrift = options.onDrift ?? null;
    this.onDriftBoost = options.onDriftBoost ?? null;
    this.onNitro = options.onNitro ?? null;

    /**
     * What the world does to the tyres this tick: 1 on asphalt, lower on
     * oil or dirt. The game sets it from its surface sensors each tick; it
     * scales grip, steering authority and drive together, which is why an
     * oil slick is not just slippery but also deaf to the wheel.
     */
    this.surfaceGrip = 1;

    /**
     * The driver's inputs for this tick, when `manual`. Axes clamp to
     * [-1, 1] for `steer`, [0, 1] for the pedals; booleans for the rest.
     */
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

    /** Whether the car is currently sliding past `driftThreshold`. */
    this.drifting = false;
    /** Seconds the current drift has lasted. */
    this.driftTime = 0;
    /** Boost level the current drift has charged (0 = none yet). */
    this.driftLevel = 0;
    /** Seconds of nitro burn left. */
    this.boostLeft = 0;
    /** Seconds until the nitro can ignite again. */
    this.nitroWait = 0;

    // Telemetry, refreshed every tick; what HUDs and skid marks read.
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
  }

  /** Whether the nitro would ignite right now. */
  get nitroReady() {
    return this.nitroWait <= 0;
  }

  /** Speed along the velocity, not the heading. px/s. */
  get speed() {
    const { x, y } = this.entity.body.velocity;
    return Math.hypot(x, y);
  }

  /**
   * Supply this tick's inputs instead of the keyboard — the traffic car's
   * driver, or anything else that is not a player. Only read when the
   * constraint was built with `manual: true`.
   * @param {{throttle?: number, brake?: number, steer?: number,
   *   handbrake?: boolean, nitro?: boolean}} controls
   */
  setControls(controls) {
    this.controls = { ...this.controls, ...controls };
  }

  /** Light the nitro, if off cooldown. Returns whether it ignited. */
  igniteNitro() {
    if (this.nitroWait > 0) return false;
    this.boostLeft = this.nitroDuration;
    this.nitroWait = this.nitroCooldown;
    this.onNitro?.();
    return true;
  }

  /**
   * A shove along the heading up to `speed` px/s — what a boost pad does.
   * Only ever adds: a car already faster keeps its speed.
   * @param {number} speed
   */
  applyBoost(speed) {
    const body = this.entity.body;
    const angle = body.angle;
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    const velocity = body.velocity;
    const forward = velocity.x * fx + velocity.y * fy;
    if (forward >= speed) return;
    body.setVelocity({
      x: velocity.x + (speed - forward) * fx,
      y: velocity.y + (speed - forward) * fy
    });
  }

  #readControls() {
    if (this.manual) return this.controls;
    const input = this.entity.input;
    return {
      throttle: input.isDown(this.keys.throttle) ? 1 : 0,
      brake: input.isDown(this.keys.brake) ? 1 : 0,
      steer: input.axis(this.keys.left, this.keys.right),
      handbrake: input.isDown(this.keys.handbrake),
      nitro: input.justPressed(this.keys.nitro)
    };
  }

  fixedUpdate(dt) {
    const body = this.entity.body;
    if (this.entity.dead) return;

    const c = this.#readControls();
    const throttle = Math.min(1, Math.max(0, c.throttle));
    const braking = Math.min(1, Math.max(0, c.brake));
    const steer = Math.min(1, Math.max(-1, c.steer));

    if (this.nitroWait > 0) this.nitroWait = Math.max(0, this.nitroWait - dt);
    if (c.nitro) this.igniteNitro();
    const boosting = this.boostLeft > 0;
    if (boosting) this.boostLeft = Math.max(0, this.boostLeft - dt);

    // The car's own axes this tick.
    const angle = body.angle;
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    const velocity = body.velocity;
    let forward = velocity.x * fx + velocity.y * fy;
    let lateral = -velocity.x * fy + velocity.y * fx;

    const surface = Math.min(1, Math.max(0.05, this.surfaceGrip));

    // Drive and brakes act on the forward part only. Braking below a
    // walking pace turns into reverse, so one pedal reads naturally.
    const thrust = boosting ? this.acceleration * this.nitroThrust : this.acceleration;
    const cap = boosting ? this.maxSpeed * this.nitroBoost : this.maxSpeed;
    if (throttle > 0) {
      forward += throttle * thrust * surface * dt;
    }
    if (braking > 0) {
      if (forward > 1) {
        forward = Math.max(0, forward - braking * this.brake * dt);
      } else {
        forward -= braking * thrust * 0.6 * surface * dt;
      }
    }
    if (throttle === 0 && braking === 0) {
      // Coasting: exponential so it never overshoots past zero.
      forward *= Math.exp(-this.drag * dt);
    }
    forward = Math.min(cap, Math.max(-this.maxReverse, forward));

    // Grip kills the lateral part. The handbrake swaps in the drift grip;
    // the surface scales either, so oil under a handbrake slide is ice.
    const gripRate = (c.handbrake ? this.driftGrip : this.grip) * surface;
    lateral *= Math.exp(-gripRate * dt);

    // Steering authority rises with speed (no pivoting in place), follows
    // the direction of travel in reverse, and loosens while drifting so
    // the slide can be caught and held.
    const speedFactor = Math.min(1, Math.abs(forward) / 140);
    const rate = (this.drifting || c.handbrake) ? this.driftSteer : this.steer;
    const yaw = steer * rate * speedFactor * Math.sign(forward || 1) * (0.35 + 0.65 * surface);
    body.setAngularVelocity(yaw);

    body.setVelocity({
      x: forward * fx - lateral * fy,
      y: forward * fy + lateral * fx
    });

    this.forwardSpeed = forward;
    this.lateralSpeed = lateral;

    const sliding = Math.abs(lateral) > this.driftThreshold && Math.abs(forward) > 40;
    if (sliding) {
      this.driftTime += dt;
      let level = 0;
      for (const threshold of this.driftBoost) if (this.driftTime >= threshold) level++;
      this.driftLevel = level;
    }
    if (sliding !== this.drifting) {
      this.drifting = sliding;
      this.onDrift?.(sliding);
      if (!sliding) {
        // The mini-turbo: a drift held long enough pays out on release.
        if (this.driftLevel > 0 && forward > 0) {
          const speed = this.maxSpeed * (this.driftBoostSpeed[this.driftLevel - 1] ?? 1);
          this.applyBoost(speed);
          this.onDriftBoost?.(this.driftLevel);
        }
        this.driftTime = 0;
        this.driftLevel = 0;
      }
    }
  }
}
