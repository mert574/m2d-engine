import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import { s } from '../core/schema.ts';

/**
 * Tints an entity for a moment after it is hit.
 *
 * It flashes by itself: `Health` raises a `damage` world event, which
 * reaches this constraint wherever the entity is being drawn, so a hit the
 * server simulated flashes on every client that can see it. `flash()` is
 * still there for a game that wants to tint for a reason of its own.
 *
 * This is the plainest possible hit read; a game that wants a burst, a
 * ring or a shake draws it with a constraint of its own (see the demos'
 * `HitBurst` in `m2d-kit/effects`). `duration` is the flash length in
 * seconds; `color` the overlay fill.
 */
export class DamageFlash extends Constraint {
  static override description = 'Tint the entity for a moment after it is hit';
  static override params = {
    duration: s.number({ initial: 0.167, min: 0, unit: 's' }),
    color: s.string({ initial: 'rgba(255, 0, 0, 0.5)', editor: 'color' })
  };

  duration: number;
  color: string;
  timeLeft: number;

  constructor(entity: Entity, options: { duration?: number; color?: string } = {}) {
    super(entity);
    this.duration = options.duration ?? 0.167; // ~10 frames at 60fps
    this.color = options.color ?? 'rgba(255, 0, 0, 0.5)';
    this.timeLeft = 0;
  }

  flash(): void {
    this.timeLeft = this.duration;
  }

  /** A hit, wherever it was simulated. See core/events.js. */
  override onWorldEvent(name: string): void {
    if (name === 'damage') this.flash();
  }

  // Presentation: the flash is drawn, never consulted by the simulation, so
  // it counts the frame's game-time delta rather than the tick.
  override update(deltaTime: number): void {
    if (this.timeLeft > 0) this.timeLeft -= deltaTime;
  }

  override draw(): void {
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
