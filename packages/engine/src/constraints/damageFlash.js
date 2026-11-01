import { Constraint } from '../core/constraint.js';

/**
 * A brief overlay tint across the entity when it takes a hit. Trigger it
 * from wherever damage is decided (typically `health.onDamage`):
 *
 *   health.onDamage = () => this.getConstraint('damageFlash').flash();
 *
 * @param {object} options
 * @param {number} [options.duration] - Flash length in seconds.
 * @param {string} [options.color] - Overlay fill.
 */
export class DamageFlash extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.duration = options.duration ?? 0.167; // ~10 frames at 60fps
    this.color = options.color ?? 'rgba(255, 0, 0, 0.5)';
    this.timeLeft = 0;
  }

  flash() {
    this.timeLeft = this.duration;
  }

  update(deltaTime) {
    if (this.timeLeft > 0) this.timeLeft -= deltaTime;
  }

  draw() {
    if (this.timeLeft <= 0) return;
    const { entity } = this;
    const pos = entity.renderPosition;
    entity.game.renderer.drawRect({
      x: pos.x - entity.size.x / 2,
      y: pos.y - entity.size.y / 2,
      width: entity.size.x,
      height: entity.size.y,
      fillStyle: this.color
    });
  }
}
