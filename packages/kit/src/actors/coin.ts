import { Entity } from 'm2d-engine/core/entity.js';
import { Hover } from 'm2d-engine/constraints/hover.js';
import { Collectable } from 'm2d-engine/constraints/collectable.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


/** A pickup: `Hover` bobs and spins it, `Collectable` takes it on an avatar's touch. */
export class Coin extends Entity {
  static override description = 'A pickup collected on touch';
  override name = 'Coin';

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
    this.addConstraint('collectable', new Collectable(this));
  }
}
