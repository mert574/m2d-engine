import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import type { PhysicsBody } from '../core/physics/index.ts';
import { s } from '../core/schema.ts';

/**
 * Collected on an avatar's touch: the entity leaves the world, `counter`
 * (a plain counter in `world.counters`, when named) goes up by one, and the
 * world event `picked` is raised where the touch was simulated — a rule
 * answers it (`{ "when": { "event": "emit", "name": "picked" }, ... }`)
 * with a sound or a notice, so nothing here is presentation.
 *
 * What a coin, a key or a health pack has in common, as a capability any
 * actor carries; the kit's `Coin` is `Hover` plus this. On a server every
 * player's avatar collects, and the removal replicates like any other.
 */
export class Collectable extends Constraint {
  static override description = "Collected on an avatar's touch: the entity is gone, a counter counts it, picked is raised";
  static override params = {
    counter: s.ref('counter', { label: 'Counter', description: 'A plain counter in world.counters to add 1 to when taken' })
  };

  counter: string | null;

  constructor(entity: Entity, options: { counter?: string | null } = {}) {
    super(entity);
    this.counter = options.counter ?? null;
  }

  override onCollisionStart(other: PhysicsBody): void {
    const entity = this.entity;
    const game = entity.game;
    if (!other.entity || !game.players!.isAvatar(other.entity) || !game.entities.has(entity)) return;
    const { x, y } = entity.position;
    game.removeEntity(entity);
    if (this.counter) entity.scene?.counters?.add(this.counter, 1);
    game.events?.emit('picked', { id: entity.netId, at: { x: Math.round(x), y: Math.round(y) } });
  }
}
