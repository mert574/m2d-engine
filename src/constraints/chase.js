import { Constraint } from '../core/constraint.js';
import { Vec2 } from '../core/math.js';

/**
 * Enemy movement: chase the player while they are within range, otherwise
 * wander between random points near home. Movement pauses while the
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
  constructor(entity, options = {}) {
    super(entity);
    this.speed = options.speed ?? 60;
    this.idleSpeed = options.idleSpeed ?? this.speed * 0.6;
    this.detectionRange = options.detectionRange ?? 400;
    this.wanderRadius = options.wanderRadius ?? 50;
    this.wanderInterval = options.wanderInterval ?? 2;

    this.wanderTime = 0;
    this.target = this.#newWanderTarget();
  }

  #newWanderTarget() {
    const r = this.wanderRadius;
    const { x, y } = this.entity.position;
    return {
      x: x + (Math.random() * r * 2 - r),
      y: y + (Math.random() * r * 2 - r)
    };
  }

  #playerInRange() {
    const player = this.entity.game.player;
    if (!player) return false;
    return Vec2.distance(this.entity.position, player.position) < this.detectionRange;
  }

  update(deltaTime) {
    const { entity } = this;
    if (!entity.game.player) return;
    if (entity.getConstraint('contactDamage')?.isStunned()) return;

    if (this.#playerInRange()) {
      const dir = Vec2.direction(entity.position, entity.game.player.position);
      entity.body.setVelocity(Vec2.scale(Vec2.normalize(dir), this.speed));
      return;
    }

    this.wanderTime += deltaTime;
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
      text: `target: ${this.wanderTime}/${this.wanderInterval}`,
      x: entity.renderBounds.min.x,
      y: entity.renderBounds.max.y,
      offsetY: 5,
      fillStyle: '#ff9999',
      fontSize: '12px', fontFamily: 'monospace',
      textAlign: 'left', textBaseline: 'top'
    });

    if (this.#playerInRange()) {
      const player = entity.game.player.renderPosition;
      overlay.drawLine({
        x1: pos.x, y1: pos.y, x2: player.x, y2: player.y,
        strokeStyle: 'rgba(255, 107, 107, 0.4)', lineWidth: 1
      });
    }
  }
}
