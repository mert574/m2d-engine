import { Entity } from 'm2d-engine/core/entity.js';
import { Hover } from 'm2d-engine/constraints/hover.js';
import { Collectable } from 'm2d-engine/constraints/collectable.js';

/** A pickup: `Hover` bobs and spins it, `Collectable` takes it on an avatar's touch. */
export class Coin extends Entity {
  static description = 'A pickup collected on touch';
  name = 'Coin';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
    this.addConstraint('collectable', new Collectable(this));
  }
}
