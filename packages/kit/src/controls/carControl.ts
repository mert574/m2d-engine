import { Constraint, KEY_BINDINGS } from 'm2d-engine/core/constraint.js';
import { s } from 'm2d-engine/core/schema.js';
import type { Entity } from 'm2d-engine/core/entity.js';

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
 */

/** The actions a car binds a key to. */
type Action = 'throttle' | 'brake' | 'left' | 'right' | 'handbrake' | 'nitro';

/** One tick's driving, as a player's keys or an AI's decision. */
export interface CarControls {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1..1 */
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export interface CarControlOptions {
  /**
   * `{ throttle, brake, left, right, handbrake, nitro }` as physical key
   * codes. Defaults to the arrows, Space, and KeyX for nitro.
   */
  keys?: Partial<Record<Action, string>>;
  /** Ignore the keyboard; an AI (or a recording) supplies `controls` through `setControls`. */
  manual?: boolean;
  /**
   * The throttle is held for the driver: full drive whenever the brake is
   * not, so the player steers and drifts and never lifts off. The throttle
   * key is then ignored.
   */
  autoThrottle?: boolean;
  /**
   * Speed the handbrake takes off while held, 1/s: a drift that costs a
   * little pace, so one button can both slow the car and set it sliding.
   */
  handbrakeDrag?: number;
  /** Forward drive, px/s². */
  acceleration?: number;
  /** Forward speed cap, px/s. */
  maxSpeed?: number;
  /** Braking, px/s². */
  brake?: number;
  /** Reverse speed cap, px/s. */
  maxReverse?: number;
  /** Coasting decay, 1/s. What slows the car when nothing is pressed. */
  drag?: number;
  /** Lateral decay, 1/s. How fast sliding dies; the number that separates rails from ice. */
  grip?: number;
  /** Grip while the handbrake is held. The gap to `grip` is the drift. */
  driftGrip?: number;
  /** Yaw rate at full steering, rad/s. */
  steer?: number;
  /** Yaw rate while drifting, so the slide can be steered into and held. */
  driftSteer?: number;
  /** Lateral px/s that counts as drifting, for `drifting` and the callbacks. */
  driftThreshold?: number;
  /** Acceleration multiplier while the nitro burns. */
  nitroThrust?: number;
  /** Speed-cap multiplier while the nitro burns. */
  nitroBoost?: number;
  /** Burn, seconds. */
  nitroDuration?: number;
  /** Seconds from one ignition to the next being available. */
  nitroCooldown?: number;
  /**
   * Seconds of continuous drifting that charge a release boost: one level
   * per threshold, in order. Empty disables the mechanic.
   */
  driftBoost?: number[];
  /**
   * Speed, as a multiple of `maxSpeed`, the car is shoved to when a drift
   * ends at each level — the kart-racer mini-turbo.
   */
  driftBoostSpeed?: number[];
  /**
   * How fast speed above the cap bleeds away, 1/s: a boost pad or a
   * mini-turbo carries the car past `maxSpeed` and it settles back over
   * about a second.
   */
  overspeedDecay?: number;
  /** Drift started or ended. Called as a method of the constraint. */
  onDrift?: (active: boolean) => void;
  /** A drift ended with a charge and the boost fired; `level` is 1-based. */
  onDriftBoost?: (level: number) => void;
  /** Nitro ignited. */
  onNitro?: () => void;
}

export class CarControl extends Constraint {
  static override description = 'Arcade top-down car handling: throttle, steering, drift';
  static override params = {
    manual: s.boolean({ initial: false, label: 'Manual drift' }),
    autoThrottle: s.boolean({ initial: false, label: 'Auto throttle', description: 'Full drive whenever the brake is not held; the throttle key is ignored' }),
    handbrakeDrag: s.number({ initial: 0, min: 0, unit: '1/s', label: 'Handbrake drag', description: 'Speed the handbrake takes off while held' }),
    acceleration: s.number({ initial: 420, positive: true, unit: 'px/s²' }),
    maxSpeed: s.number({ initial: 560, positive: true, unit: 'px/s' }),
    brake: s.number({ initial: 780, positive: true, unit: 'px/s²' }),
    maxReverse: s.number({ initial: 170, min: 0, unit: 'px/s' }),
    drag: s.number({ initial: 0.6, min: 0 }),
    grip: s.number({ initial: 18, min: 0 }),
    driftGrip: s.number({ initial: 2.4, min: 0 }),
    steer: s.number({ initial: 2.4, positive: true, unit: 'rad/s' }),
    driftSteer: s.number({ initial: 3.6, positive: true, unit: 'rad/s' }),
    driftThreshold: s.number({ initial: 90, min: 0, unit: 'px/s' }),
    nitroThrust: s.number({ initial: 2.1, positive: true }),
    nitroBoost: s.number({ initial: 1.35, positive: true }),
    nitroDuration: s.number({ initial: 1.1, positive: true, unit: 's' }),
    nitroCooldown: s.number({ initial: 5, min: 0, unit: 's' }),
    driftBoost: s.tuple([s.number(), s.number()], { label: 'Drift boost thresholds, seconds' }),
    driftBoostSpeed: s.tuple([s.number(), s.number()], { label: 'Drift boost speed multipliers' }),
    overspeedDecay: s.number({ initial: 1.4, min: 0, description: 'How fast speed above the cap bleeds away, 1/s' }),
    keys: KEY_BINDINGS
  };

  declare entity: Entity;

  keys: Record<Action, string>;
  manual: boolean;
  autoThrottle: boolean;
  handbrakeDrag: number;
  acceleration: number;
  maxSpeed: number;
  brake: number;
  maxReverse: number;
  drag: number;
  grip: number;
  driftGrip: number;
  steer: number;
  driftSteer: number;
  driftThreshold: number;
  nitroThrust: number;
  nitroBoost: number;
  nitroDuration: number;
  nitroCooldown: number;
  driftBoost: number[];
  driftBoostSpeed: number[];
  onDrift: ((active: boolean) => void) | null;
  onDriftBoost: ((level: number) => void) | null;
  onNitro: (() => void) | null;
  overspeedDecay: number;
  /**
   * What the world does to the tyres this tick: 1 on asphalt, lower on
   * oil or dirt. The game sets it from its surface sensors each tick; it
   * scales grip, steering authority and drive together, which is why an
   * oil slick is not just slippery but also deaf to the wheel.
   */
  surfaceGrip: number;
  /**
   * What the surface takes off the speed this tick, 1/s: 0 on asphalt.
   * Set per tick like `surfaceGrip`; a slick that should cost a little
   * speed as well as grip sets both.
   */
  surfaceDrag: number;
  /**
   * The driver's inputs for this tick, when `manual`. Axes clamp to
   * [-1, 1] for `steer`, [0, 1] for the pedals; booleans for the rest.
   */
  controls: CarControls;
  /** Whether the car is currently sliding past `driftThreshold`. */
  drifting: boolean;
  /** Seconds the current drift has lasted. */
  driftTime: number;
  /** Boost level the current drift has charged (0 = none yet). */
  driftLevel: number;
  /** Seconds of nitro burn left. */
  boostLeft: number;
  /** Seconds until the nitro can ignite again. */
  nitroWait: number;
  /** Telemetry, refreshed every tick; what HUDs and skid marks read. */
  forwardSpeed: number;
  lateralSpeed: number;

  constructor(entity: Entity, options: CarControlOptions = {}) {
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
    this.autoThrottle = options.autoThrottle ?? false;
    this.handbrakeDrag = options.handbrakeDrag ?? 0;

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
    this.overspeedDecay = options.overspeedDecay ?? 1.4;

    this.surfaceGrip = 1;
    this.surfaceDrag = 0;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

    this.drifting = false;
    this.driftTime = 0;
    this.driftLevel = 0;
    this.boostLeft = 0;
    this.nitroWait = 0;

    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
  }

  /** `keys` merges over the bindings already in place, never replaces them. */
  override configure(params: CarControlOptions): void {
    const { keys, ...rest } = params;
    super.configure(rest);
    if (keys) this.keys = { ...this.keys, ...keys };
  }

  /** Whether the nitro would ignite right now. */
  get nitroReady(): boolean {
    return this.nitroWait <= 0;
  }

  /** Speed along the velocity, not the heading. px/s. */
  get speed(): number {
    const { x, y } = this.entity.body.velocity;
    return Math.hypot(x, y);
  }

  /**
   * Supply this tick's inputs instead of the keyboard — the traffic car's
   * driver, or anything else that is not a player. Only read when the
   * constraint was built with `manual: true`.
   */
  setControls(controls: Partial<CarControls>): void {
    this.controls = { ...this.controls, ...controls };
  }

  /** Light the nitro, if off cooldown. Returns whether it ignited. */
  igniteNitro(): boolean {
    if (this.nitroWait > 0) return false;
    this.boostLeft = this.nitroDuration;
    this.nitroWait = this.nitroCooldown;
    this.onNitro?.();
    return true;
  }

  /**
   * A shove along the heading up to `speed` px/s — what a boost pad does.
   * Only ever adds: a car already faster keeps its speed.
   */
  applyBoost(speed: number): void {
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

  /** Over the cap, speed bleeds back to it rather than stopping dead there; the engine adds none. */
  #capped(forward: number, cap: number, dt: number): number {
    if (forward < -this.maxReverse) return -this.maxReverse;
    if (forward <= cap) return forward;
    return cap + (forward - cap) * Math.exp(-this.overspeedDecay * dt);
  }

  #readControls(): CarControls {
    const controls = this.manual ? { ...this.controls } : this.#keyboardControls();
    if (this.autoThrottle) controls.throttle = controls.brake > 0 ? 0 : 1;
    return controls;
  }

  #keyboardControls(): CarControls {
    const input = this.entity.input;
    return {
      throttle: input.isDown(this.keys.throttle) ? 1 : 0,
      brake: input.isDown(this.keys.brake) ? 1 : 0,
      steer: input.axis(this.keys.left, this.keys.right),
      handbrake: input.isDown(this.keys.handbrake),
      nitro: input.justPressed(this.keys.nitro)
    };
  }

  override fixedUpdate(dt: number): void {
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
    if (throttle > 0 && forward < cap) {
      forward = Math.min(cap, forward + throttle * thrust * surface * dt);
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
    if (this.surfaceDrag > 0) forward *= Math.exp(-this.surfaceDrag * dt);
    if (c.handbrake && this.handbrakeDrag > 0 && forward > 0) forward *= Math.exp(-this.handbrakeDrag * dt);
    forward = this.#capped(forward, cap, dt);

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
