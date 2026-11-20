import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import { s } from '../core/schema.ts';

/**
 * A prompt that appears over an entity while the player is close, and a
 * yes/no the game can read: `isNear`. The text goes through the world
 * overlay so it stays sharp at any render resolution. `radius` is the
 * distance from the player in px; `text` the prompt, as a string or a
 * function called each frame so it can follow state; `offsetY` sits it
 * above the entity's drawn top.
 */
export class ProximityPrompt extends Constraint {
  static override description = 'A prompt over the entity while the player is near, and an action on the key';
  static override params = {
    radius: s.number({ initial: 110, positive: true, unit: 'px' }),
    text: s.string({ initial: 'E' }),
    offsetY: s.number({ unit: 'px' }),
    color: s.string({ initial: 'rgba(240, 236, 220, 0.95)', editor: 'color' })
  };

  radius: number;
  text: string | (() => string);
  offsetY: number | undefined;
  color: string;

  constructor(entity: Entity, options: { radius?: number; text?: string | (() => string); offsetY?: number; color?: string } = {}) {
    super(entity);
    this.radius = options.radius ?? 110;
    this.text = options.text ?? 'E';
    this.offsetY = options.offsetY;
    this.color = options.color ?? 'rgba(240, 236, 220, 0.95)';
  }

  get isNear(): boolean {
    const player = this.entity.game.player;
    if (!player || player.dead) return false;
    const dx = player.position.x - this.entity.position.x;
    const dy = player.position.y - this.entity.position.y;
    return Math.hypot(dx, dy) < this.radius;
  }

  override draw(): void {
    if (!this.isNear) return;
    const entity = this.entity;
    const pos = entity.renderPosition;
    const text = typeof this.text === 'function' ? this.text() : this.text;
    entity.game.worldOverlay.drawText({
      x: pos.x,
      // Over the figure's head, not over the top of its sheet's cell: see
      // Entity.overhead and a prefab's `footprint.headroom`.
      y: entity.overhead - (this.offsetY ?? 10),
      text,
      fillStyle: this.color,
      fontSize: 13,
      textAlign: 'center',
      textBaseline: 'bottom'
    });
  }
}
