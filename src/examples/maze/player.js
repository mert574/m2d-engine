import { Entity } from '../../core/entity.js';
import { KeyboardControl } from '../../constraints/keyboardControl.js';

export class Player extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);

    const control = new KeyboardControl(this, {
      moveForce: 0.01,
      maxSpeed: 3,
      continuous: false, // Use direct velocity for top-down movement
      onMove: (dx, dy) => {
        if (dx !== 0 || dy !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange: (direction) => {
        this.sprite.flipX = direction < 0;
      }
    });
    this.addConstraint('control', control);
  }
} 