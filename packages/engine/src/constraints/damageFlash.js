import { Constraint } from '../core/constraint.js';

/**
 * Tints an entity for a moment after it is hit. Call `flash()` from a
 * `Health` `onDamage` handler:
 *
 *   health.onDamage = () => this.getConstraint('damageFlash').flash();
 *
 * This is the plainest possible hit read; a game that wants a burst, a
 * ring or a shake draws it with a constraint of its own (see the demos'
 * `HitBurst` in examples/src/shared/effects.js).
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

  // Presentation: the flash is drawn, never consulted by the simulation, so
  // it counts the frame's game-time delta rather than the tick.
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
