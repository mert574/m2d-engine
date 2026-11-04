import { Constraint } from '../core/constraint.js';

/**
 * A prompt that appears over an entity while the player is close, and a
 * yes/no the game can read: `isNear`. The text goes through the world
 * overlay so it stays sharp at any render resolution.
 *
 * @param {Object} options
 * @param {number} [options.radius=110] - Distance from the player, px
 * @param {string|(() => string)} [options.text] - The prompt; a function is
 *   called each frame so it can follow state
 * @param {number} [options.offsetY] - Above the entity's drawn top; defaults
 *   to a little over the frame
 * @param {string} [options.color]
 */
export class ProximityPrompt extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.radius = options.radius ?? 110;
    this.text = options.text ?? 'E';
    this.offsetY = options.offsetY;
    this.color = options.color ?? 'rgba(240, 236, 220, 0.95)';
  }

  get isNear() {
    const player = this.entity.game.player;
    if (!player || player.dead) return false;
    const dx = player.position.x - this.entity.position.x;
    const dy = player.position.y - this.entity.position.y;
    return Math.hypot(dx, dy) < this.radius;
  }

  draw() {
    if (!this.isNear) return;
    const entity = this.entity;
    const pos = entity.renderPosition;
    const text = typeof this.text === 'function' ? this.text() : this.text;
    entity.game.worldOverlay.drawText({
      x: pos.x,
      y: pos.y - entity.size.y / 2 - (this.offsetY ?? 10),
      text,
      fillStyle: this.color,
      fontSize: 13,
      textAlign: 'center',
      textBaseline: 'bottom'
    });
  }
}
