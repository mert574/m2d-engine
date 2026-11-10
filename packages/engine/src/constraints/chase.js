import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';
import { Vec2 } from '../core/math.js';

/**
 * Enemy movement: chase the nearest player while one is within range,
 * otherwise wander between random points near home. "The player" is any
 * of `game.players.avatars`: alone that is `game.player`; on a server it
 * is every connected player's avatar. Movement pauses while the
 * entity's `contactDamage` constraint reports it stunned, so a knockback
 * can play out instead of being immediately steered against.
 *
 * In debug view it draws its own working state — detection radius, the
 * current wander target and the pursuit line — through the world overlay.
 *
 * @param {object} options
 * @param {number} [options.speed] - Pursuit speed, px/s.
 * @param {number} [options.idleSpeed] - Wander speed, px/s.
 * @param {number} [options.detectionRange] - Pursuit radius, px.
 * @param {number} [options.wanderRadius] - How far a wander target may land
 *   from the current position, px.
 * @param {number} [options.wanderInterval] - Seconds between wander targets.
 */
export class Chase extends Constraint {
  static description = 'Chase the nearest player while one is in range, else wander or stand';
  static params = {
    speed: s.number({ initial: 60, positive: true, unit: 'px/s', label: 'Pursuit speed' }),
    idleSpeed: s.number({ positive: true, unit: 'px/s', label: 'Wander speed', description: 'Defaults to 60% of speed' }),
    detectionRange: s.number({ initial: 400, positive: true, unit: 'px' }),
    wanderRadius: s.number({ initial: 50, positive: true, unit: 'px' }),
    wanderInterval: s.number({ initial: 2, positive: true, unit: 's' })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.speed = options.speed ?? 60;
    this.idleSpeed = options.idleSpeed ?? this.speed * 0.6;
    this.idleSpeedSet = options.idleSpeed !== undefined;
    this.detectionRange = options.detectionRange ?? 400;
    this.wanderRadius = options.wanderRadius ?? 50;
    this.wanderInterval = options.wanderInterval ?? 2;

    this.wanderTime = 0;
    this.target = this.#newWanderTarget();
  }

  /**
   * `idleSpeed` follows `speed` unless it was set explicitly, so a scene
   * that retunes `speed` alone does not leave a stale `idleSpeed` behind.
   */
  configure(params) {
    super.configure(params);
    if (params.idleSpeed !== undefined) this.idleSpeedSet = true;
    else if (params.speed !== undefined && !this.idleSpeedSet) this.idleSpeed = this.speed * 0.6;
  }

  #newWanderTarget() {
    const r = this.wanderRadius;
    const { x, y } = this.entity.position;
    // Seeded: a wander target is simulation state, and a restart with the
    // same seed has to pick the same one.
    const rng = this.entity.game.rng;
    return {
      x: x + rng.range(-r, r),
      y: y + rng.range(-r, r)
    };
  }

  /** The avatar to hunt: the nearest one inside the detection range, or null. */
  #quarry() {
    const { entity } = this;
    // Strictly inside the range, as the distance test always was.
    const quarry = entity.game.players.nearestAvatar(entity.position, this.detectionRange);
    return quarry && Vec2.distance(entity.position, quarry.position) < this.detectionRange ? quarry : null;
  }

  fixedUpdate(dt) {
    const { entity } = this;
    if (entity.getConstraint('contactDamage')?.isStunned()) return;

    const quarry = this.#quarry();
    if (quarry) {
      const dir = Vec2.direction(entity.position, quarry.position);
      entity.body.setVelocity(Vec2.scale(Vec2.normalize(dir), this.speed));
      return;
    }

    this.wanderTime += dt;
    if (this.wanderTime >= this.wanderInterval) {
      this.target = this.#newWanderTarget();
      this.wanderTime = 0;
    }
    if (Vec2.distance(entity.position, this.target) > 1) {
      const dir = Vec2.direction(entity.position, this.target);
      entity.body.setVelocity(Vec2.scale(Vec2.normalize(dir), this.idleSpeed));
    }
  }

  draw() {
    const { entity } = this;
    if (!entity.game.renderer.isDebugEnabled()) return;

    // Annotations on top of the game, so they go to the world overlay:
    // world coordinates and sizes, rasterized at display resolution. The
    // 3-unit target dot in particular would vanish at a low render
    // resolution if it were drawn into the world surface.
    const overlay = entity.game.worldOverlay;
    const pos = entity.renderPosition;

    overlay.drawArc({
      x: pos.x, y: pos.y, radius: this.detectionRange,
      startAngle: 0, endAngle: Math.PI * 2,
      strokeStyle: 'rgba(255, 214, 51, 0.4)', lineWidth: 1
    });

    overlay.drawArc({
      x: this.target.x, y: this.target.y, radius: 3,
      startAngle: 0, endAngle: Math.PI * 2, fillStyle: '#ffd633'
    });
    overlay.drawLine({
      x1: pos.x, y1: pos.y, x2: this.target.x, y2: this.target.y,
      strokeStyle: 'rgba(255, 214, 51, 0.4)', lineWidth: 1
    });

    overlay.drawText({
      text: `target: ${this.wanderTime.toFixed(2)}/${this.wanderInterval}`,
      x: entity.renderBounds.min.x,
      y: entity.renderBounds.max.y,
      offsetY: 5,
      fillStyle: '#ff9999',
      fontSize: '12px', fontFamily: 'monospace',
      textAlign: 'left', textBaseline: 'top'
    });

    const quarry = this.#quarry();
    if (quarry) {
      const player = quarry.renderPosition;
      overlay.drawLine({
        x1: pos.x, y1: pos.y, x2: player.x, y2: player.y,
        strokeStyle: 'rgba(255, 107, 107, 0.4)', lineWidth: 1
      });
    }
  }
}
