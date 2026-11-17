import { Entity } from 'm2d-engine/core/entity.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { Attack } from 'm2d-engine/constraints/attack.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';

export class TopDownPlayer extends Entity {
  static description = 'The top-down player, moved by the keyboard in the plane';
  name = 'Player';
  static replicated = ['facingDirection'];
  /**
   * What a client may run for itself, a round trip before the server
   * confirms it: the keys that move this player, and nothing else. The
   * swing, the health and the abilities are the server's. See
   * net/prediction.js.
   */
  static predictedConstraints = ['control'];
  static predictedFields = ['facingDirection'];

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    body.setMass(1);

    this.facingDirection = 1;
    this.setAnimation('idle');

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      onDeath: () => this.game.gameOver(),
      onDamage: () => this.game.soundManager.playSound('damage')
    }));

    this.addConstraint('attack', new Attack(this, {
      damage: 65,
      range: 50,
      cooldown: 22.5,
      onStart: () => {
        this.game.soundManager.playSound('attack');
      }
    }));

    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 3000,
      maxSpeed: 180,
      continuous: true,
      verticalMovement: true, // Enable vertical movement for top-down
      onMove: (dx, dy) => {
        if (dx !== 0 || dy !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange: (direction) => {
        this.facingDirection = direction;
      },
      onAttack: () => {
        const attack = this.getConstraint('attack');
        if (attack) {
          attack.startAttack(this.facingDirection);
        }
      }
    }));
  }


  draw() {
    super.draw();

    if (this.game.renderer.isDebugEnabled()) {
      // Draw facing direction, as a sharp overlay annotation rather than
      // into the world surface.
      const directionLength = 20;
      this.game.worldOverlay.drawLine({
        x1: this.renderPosition.x,
        y1: this.renderPosition.y,
        x2: this.renderPosition.x + (directionLength * this.facingDirection),
        y2: this.renderPosition.y,
        strokeStyle: '#ff0000',
        lineWidth: 1
      });
    }
  }
}
