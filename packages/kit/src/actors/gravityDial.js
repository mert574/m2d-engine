import { s } from 'm2d-engine/core/schema.js';
import { Entity } from 'm2d-engine/core/entity.js';

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
  static description = 'Sets one axis of the world\'s gravity from a counter each tick';
  static properties = {
    counter: s.ref('counter', { label: 'Counter', description: 'A plain counter in world.counters: the gravity along the axis' }),
    axis: s.enumOf(['x', 'y', 'z'], { initial: 'y' })
  };

  static tool = { color: '#a78bfa', label: 'gravity' };
  name = 'GravityDial';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.counter = options.counter ?? null;
    this.axis = options.axis ?? 'y';
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const counters = this.scene?.counters;
    if (!this.counter || !counters?.has(this.counter)) return;
    const value = counters.get(this.counter);
    const gravity = this.game.physics.gravity;
    if (gravity[this.axis] === value) return;
    this.game.physics.setGravity({ ...gravity, [this.axis]: value });
  }
}
