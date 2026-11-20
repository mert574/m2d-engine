import { Entity, type M2D } from 'm2d-engine';
import { Health, Attack, KeyboardControl } from 'm2d-engine/constraints';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


export class TopDownPlayer extends Entity {
  static override description = 'The top-down player, moved by the keyboard in the plane';
  override name = 'Player';
  static override replicated = ['facingDirection'];
  /**
   * What a client may run for itself, a round trip before the server
   * confirms it: the keys that move this player, and nothing else. The
   * swing, the health and the abilities are the server's. See
   * net/prediction.js.
   */
  static predictedConstraints = ['control'];
  static predictedFields = ['facingDirection'];

  /** 1 facing right, -1 facing left; replicated. */
  facingDirection: number;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D) {
    super(body, sprite, game);

    body.setMass(1);

    this.facingDirection = 1;
    this.setAnimation('idle');

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      onDeath: () => this.game.gameOver(),
      onDamage: () => this.game.soundManager?.playSound('damage')
    }));

    this.addConstraint('attack', new Attack(this, {
      damage: 65,
      range: 50,
      cooldown: 22.5,
      onStart: () => {
        this.game.soundManager?.playSound('attack');
      }
    }));

    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 3000,
      maxSpeed: 180,
      continuous: true,
      verticalMovement: true, // Enable vertical movement for top-down
      onMove: (dx: number, dy: number) => {
        if (dx !== 0 || dy !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange: (direction: number) => {
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


  override draw(deltaTime: number): void {
    super.draw(deltaTime);

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
