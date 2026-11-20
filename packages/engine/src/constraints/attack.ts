import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import type { PhysicsBody } from '../core/physics/index.ts';
import { s } from '../core/schema.ts';
import { Angle } from '../core/math.ts';

/** One chain step, overriding the base values for that swing. */
export interface ComboStep {
  damage?: number;
  knockback?: number;
  arc?: number;
  [key: string]: unknown;
}

/**
 * Knockback, in px·mass/s. Carried over from the mass-independent velocity
 * change this replaced (8140, -4880 px/s) scaled by the mass of the 32x32
 * enemies the games ship with (~1.024), so the fling looks the same as
 * before — but a heavier enemy now shrugs it off, which is the point of
 * using a real impulse.
 */
const KNOCKBACK_IMPULSE = { x: 8335, y: -4997 };

/**
 * A melee attack: once per cooldown, everything hostile within `range` and
 * inside the swing's arc takes damage and is knocked back.
 *
 * `startAttack` takes either a side (`1` right, `-1` left), the
 * side-scroller's contract, or an angle in radians, which is what a
 * top-down or 3/4 game needs — a swing that only knows left and right
 * cannot reach anything above or below. The arc is centred on that
 * direction and is `arc` radians wide: π (the default) is the half circle
 * the side view always used, 2π hits everything in range.
 *
 * `cooldown` and `windup` arrive in 60 Hz frames. The windup telegraphs
 * before the swing: `startAttack` commits the direction and starts it; the
 * swing itself — the hit check, the animation, `onStart` — happens when it
 * runs out, so the telegraph is dodgeable and a mid-windup snapshot
 * resumes it (`isWindingUp`/`windupTime` replicate for a drawn telegraph).
 * `knockback` is the impulse along the swing, defaulting to the side
 * view's fling, 0 disabling it. `combo` chains steps: a swing started
 * within `comboWindow` seconds of the last one landing advances the chain,
 * otherwise it restarts; the cooldown still gates every swing. `targets`
 * names the collision layers the swing hits — unset, anything with
 * `Health` that is not a player's avatar. `onStart(step)` runs on every
 * swing; `onHit(entity, step)` for every target one lands on.
 */
export class Attack extends Constraint {
  static override description = 'A melee or ranged attack on a key, with damage, reach and knockback';
  static override params = {
    damage: s.number({ initial: 10, min: 0 }),
    range: s.number({ initial: 40, positive: true, unit: 'px' }),
    cooldown: s.number({ initial: 30, min: 0, unit: 'frames at 60fps' }),
    windup: s.number({ initial: 0, min: 0, unit: 'frames at 60fps', description: 'Telegraph before the swing; the direction commits when it starts' }),
    arc: s.number({ initial: Math.PI, min: 0, unit: 'rad' }),
    knockback: s.number({ min: 0, unit: 'px/s' }),
    comboWindow: s.number({ initial: 0.8, min: 0, unit: 's' }),
    targets: s.array(s.ref('layer'), { label: 'Targets', description: "Layers the swing hits; unset, anything with Health that is not a player's avatar" })
    // `combo` steps may carry their own callbacks, so they stay code.
  };

  /**
   * `swings` counts every swing, so a client can tell a new one from the
   * same one still in progress and run `onStart` for it (its look, its
   * sound) without running the simulation. See `replicaUpdated`.
   */
  static override replicated: string[] = ['swings', 'step', 'angle', 'direction', 'sideways', 'isAttacking', 'attackTime', 'isWindingUp', 'windupTime'] satisfies (keyof Attack)[];

  damage: number;
  range: number;
  cooldown: number;
  windup: number;
  arc: number;
  knockback: number | undefined;
  combo: ComboStep[] | null;
  targets: string[] | null;
  comboWindow: number;
  onStart: ((step: number) => void) | undefined;
  onHit: ((entity: Entity, step: number) => void) | undefined;
  step: number;
  sinceSwing: number;
  swings: number;
  isAttacking: boolean;
  isWindingUp: boolean;
  windupTime: number;
  currentCooldown: number;
  direction: number;
  angle: number;
  hits: Set<Entity>;
  attackDuration: number;
  attackTime: number;
  attackAnimEndTime: number;
  hasCheckedHits: boolean;
  /** Whether the current swing was started with the side-view contract (±1). */
  sideways = false;

  constructor(entity: Entity, options: {
    damage?: number;
    range?: number;
    cooldown?: number;
    windup?: number;
    arc?: number;
    knockback?: number;
    combo?: ComboStep[] | null;
    targets?: string[] | null;
    comboWindow?: number;
    onStart?: (step: number) => void;
    onHit?: (entity: Entity, step: number) => void;
  } = {}) {
    super(entity);
    this.damage = options.damage || 10;
    this.range = options.range || 40;
    this.cooldown = (options.cooldown || 30) / 60; // convert frames to seconds (assuming 60fps baseline)
    this.windup = (options.windup || 0) / 60;
    this.arc = options.arc ?? Math.PI;
    this.knockback = options.knockback;
    this.combo = options.combo ?? null;
    this.targets = options.targets ?? null;
    this.comboWindow = options.comboWindow ?? 0.8;
    this.onStart = options.onStart;
    this.onHit = options.onHit;
    /** Which combo step the current swing is; -1 between chains. */
    this.step = -1;
    /** Seconds since the last swing ended, for the chain window. */
    this.sinceSwing = Infinity;
    /** Swings started, ever. Replicated, so a client sees each new one. */
    this.swings = 0;

    this.isAttacking = false;
    /** Mid-telegraph: the direction is committed, the swing not yet made. */
    this.isWindingUp = false;
    /** Seconds into the windup, for a telegraph drawn by progress. */
    this.windupTime = 0;
    this.currentCooldown = 0;
    this.direction = 1; // 1 for right, -1 for left
    /** The swing's centre, radians, y down. 0 is right. */
    this.angle = 0;
    this.hits = new Set();
    this.attackDuration = 0.167; // ~10 frames at 60fps in seconds
    this.attackTime = 0;
    this.attackAnimEndTime = 0.333; // ~20 frames at 60fps in seconds
    this.hasCheckedHits = false;
  }

  /**
   * The frame-counted times arrive in frames (from a scene retuning this
   * constraint) but are kept in seconds, as the constructor keeps them.
   */
  override configure(params: Record<string, unknown>): void {
    const { cooldown, windup, ...rest } = params;
    super.configure(rest);
    if (cooldown !== undefined) this.cooldown = (cooldown as number) / 60;
    if (windup !== undefined) this.windup = (windup as number) / 60;
  }

  override fixedUpdate(dt: number): void {
    if (this.currentCooldown > 0) {
      this.currentCooldown -= dt;
    }
    if (!this.isAttacking) this.sinceSwing += dt;

    if (this.isWindingUp) {
      this.windupTime += dt;
      // With a hair of slack: n frames of accumulated dt land a few ulps
      // under n/60, and a 12-frame windup should swing on its 12th tick.
      if (this.windupTime >= this.windup - 1e-9) {
        this.isWindingUp = false;
        this.windupTime = 0;
        this.#swing();
      }
    }

    if (this.isAttacking) {
      // Check for hits only on the first tick of the attack
      if (!this.hasCheckedHits) {
        this.checkHits();
        this.hasCheckedHits = true;
      }
      this.attackTime += dt;
      if (this.attackTime >= this.attackDuration) {
        this.isAttacking = false;
        this.attackTime = 0;
        this.hasCheckedHits = false;
      }
      if (this.attackTime >= this.attackAnimEndTime && this.entity.currentAnim?.includes('attack')) {
        this.entity.setAnimation('idle');
      }
    }
  }

  checkHits(): void {
    // A one-shot shape query: the reach is a question, not an object. It
    // used to be a sensor body parked in the world and teleported onto the
    // attacker every frame, which also meant every enemy in range collected
    // collision callbacks from an invisible circle.
    const position = this.entity.position;
    const game = this.entity.game;
    const mask = this.targets ? game.collisionLayers!.mask(this.targets) : null;
    // The union's overlaps signatures disagree on the shape until phase 10;
    // the receiver is cast, never the method — detached, it loses `this`.
    const physics = game.physics as unknown as {
      overlaps(shape: { x: number; y: number; radius: number }, keep: (body: PhysicsBody) => boolean): PhysicsBody[];
    };
    const hits = physics.overlaps(
      { x: position.x, y: position.y, radius: this.range },
      (body) => (mask === null
        ? Boolean(body.entity?.getConstraint?.('health')) && !game.players!.isAvatar(body.entity!)
        : (body.collisionFilter.category & mask) !== 0)
    );

    for (const body of hits) {
      if (!body.entity || body.entity === this.entity || this.hits.has(body.entity)) continue;

      // Inside the swing? Measured from the edge of the attacker on the
      // swing's side, so something pressed against it still counts. The
      // edge is the *body's*: on a character whose sprite stands on a
      // small footprint, `size` is the sheet's cell, and a point half a
      // cell ahead would put everything in reach behind the swing.
      const reach = this.entity.body.size.x / 2;
      const attackPoint = {
        x: position.x + Math.cos(this.angle) * reach,
        y: position.y + Math.sin(this.angle) * reach
      };
      const angle = Angle.between(attackPoint, body.position);

      const step = this.combo ? this.combo[this.step] : null;
      const arc = step?.arc ?? this.arc;
      const damage = step?.damage ?? this.damage;
      const knockback = step?.knockback ?? this.knockback;
      if (Angle.inArc(angle, this.angle, arc)) {
        this.hits.add(body.entity);
        const health = body.entity.getConstraint('health');
        if (health && !health.isInvulnerable()) {
          health.takeDamage(damage);
          if (knockback === undefined) {
            // The side view's fling: along the swing and upward.
            body.applyImpulse({
              x: Math.cos(this.angle) * KNOCKBACK_IMPULSE.x,
              y: this.sideways ? KNOCKBACK_IMPULSE.y : Math.sin(this.angle) * KNOCKBACK_IMPULSE.x
            });
          } else if (knockback > 0) {
            body.applyImpulse({
              x: Math.cos(this.angle) * knockback,
              y: Math.sin(this.angle) * knockback
            });
          }
          this.onHit?.(body.entity, Math.max(0, this.step));
        }

      }
    }
  }

  /**
   * Swing — or, with a `windup`, commit the direction and telegraph first.
   * `direction` is `1` or `-1` for a side-view swing to the right or left,
   * or any other number as an angle in radians.
   */
  startAttack(direction: number): void {
    if (this.currentCooldown > 0 || this.isWindingUp) return;

    // ±1 exactly is the side-view contract; anything else is an angle.
    this.sideways = direction === 1 || direction === -1;
    this.angle = this.sideways ? (direction > 0 ? 0 : Math.PI) : direction;
    this.direction = Math.cos(this.angle) >= 0 ? 1 : -1;
    if (this.windup > 0) {
      this.isWindingUp = true;
      this.windupTime = 0;
      return;
    }
    this.#swing();
  }

  /** Drop a telegraph without swinging: a stun, a death, a change of mind. */
  cancelWindup(): void {
    this.isWindingUp = false;
    this.windupTime = 0;
  }

  /** The swing itself: the windup's end, or `startAttack` with none. */
  #swing(): void {
    // Advance the chain when this swing follows the last closely enough.
    if (this.combo) {
      this.step = this.sinceSwing <= this.comboWindow ? (this.step + 1) % this.combo.length : 0;
    }
    this.sinceSwing = 0;
    this.swings++;
    this.isAttacking = true;
    this.hits.clear();
    this.currentCooldown = this.cooldown;
    this.attackTime = 0;
    this.entity.setAnimation(this.direction > 0 ? 'attackRight' : 'attackLeft');

    if (this.onStart) {
      this.onStart(Math.max(0, this.step));
    }
  }

  /** On a client: a new swing arrived from the server. */
  replicaUpdated(changed: Set<string>): void {
    if (!changed.has('swings')) return;
    this.entity.setAnimation(this.direction > 0 ? 'attackRight' : 'attackLeft');
    this.onStart?.(Math.max(0, this.step));
  }

  /**
   * The attack has no look of its own: what a swing is depends on the game
   * and its perspective. Games draw one with a constraint of their own that
   * hooks `onStart` (the kit's `AttackSwing`, `m2d-kit/effects`).
   * The range ring is a diagnostic and only shows in debug mode.
   */
  override draw(): void {
    if (!this.entity.game.renderer.isDebugEnabled()) return;
    const pos = this.entity.renderPosition;
    // World coordinates, rasterized at display resolution on the overlay.
    this.entity.game.worldOverlay.drawArc({
      x: pos.x,
      y: pos.y,
      radius: this.range,
      startAngle: 0,
      endAngle: Math.PI * 2,
      strokeStyle: 'rgba(0, 150, 255, 0.3)',
      fill: false
    });
    // A telegraph in progress: the committed arc closing in as it runs out.
    if (this.isWindingUp && this.windup > 0) {
      const left = 1 - this.windupTime / this.windup;
      this.entity.game.worldOverlay.drawArc({
        x: pos.x,
        y: pos.y,
        radius: Math.max(2, this.range * left),
        startAngle: this.angle - this.arc / 2,
        endAngle: this.angle + this.arc / 2,
        strokeStyle: 'rgba(255, 160, 60, 0.7)',
        lineWidth: 1.5,
        fill: false
      });
    }
  }
}
