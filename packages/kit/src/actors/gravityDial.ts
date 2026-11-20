import { s } from 'm2d-engine/schema';
import { Entity, type M2D } from 'm2d-engine';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';

export interface GravityDialOptions {
  /** A plain counter in `world.counters`: the gravity along the axis. */
  counter?: string;
  axis?: 'x' | 'y' | 'z';
}


/**
 * The world's gravity along one axis, following a counter: a rule turns
 * the counter and the fall changes with it, and the HUD can show the same
 * counter as a `{name}` text. Placed like any object, drawn as nothing,
 * colliding with nothing; works in 2D and 3D.
 *
 * Simulation: it sets gravity in its tick, so it runs headless and on a
 * server, and the physics world is only told when the number changed. A
 * rule that turns the counter is felt from the next tick on.
 */
export class GravityDial extends Entity {
  static override description = 'Sets one axis of the world\'s gravity from a counter each tick';
  static override properties = {
    counter: s.ref('counter', { label: 'Counter', description: 'A plain counter in world.counters: the gravity along the axis' }),
    axis: s.enumOf(['x', 'y', 'z'], { initial: 'y' })
  };

  static override tool = { color: '#a78bfa', label: 'gravity' };
  override name = 'GravityDial';

  /** The counter it follows, or null for an object that names none. */
  counter: string | null;
  axis: 'x' | 'y' | 'z';

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: GravityDialOptions = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.counter = options.counter ?? null;
    this.axis = options.axis ?? 'y';
  }

  override fixedUpdate(dt: number): void {
    super.fixedUpdate(dt);
    const counters = this.scene?.counters;
    if (!this.counter || !counters?.has(this.counter)) return;
    const value = counters.get(this.counter);
    const gravity = this.game.physics.gravity;
    if (gravity[this.axis] === value) return;
    this.game.physics.setGravity({ ...gravity, [this.axis]: value });
  }
}
