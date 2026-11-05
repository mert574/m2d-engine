import { Entity } from '../core/entity.js';
import { Hover } from '../constraints/hover.js';

export class Coin extends Entity {
  name = 'Coin';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    // Any player's avatar collects it: on a server there is one per player.
    if (this.game.players.isAvatar(other.entity)) {
      // TODO: Add score/collection logic
      this.game.entities.delete(this);
      this.game.physics.remove(this.body);
    }
  }
}
