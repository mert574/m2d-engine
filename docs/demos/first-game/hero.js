import { Entity } from 'm2d-engine/core/entity.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';

export class Hero extends Entity {
  // The scene stores the entity named 'Player' as game.player and makes
  // the camera follow it.
  name = 'Player';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 2400,       // px/s per second
      maxSpeed: 220,            // px/s
      verticalMovement: false,  // the up and down arrows do nothing in a platformer
      onJump: () => {
        if (!this.isOnGround()) return;
        this.body.setVelocity({ x: this.body.velocity.x, y: -700 });
      }
    }));
  }

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({
      x: x - this.size.x / 2, y: y - this.size.y / 2,
      width: this.size.x, height: this.size.y,
      fillStyle: '#8bc34a', cornerRadius: 6
    });
  }
}
