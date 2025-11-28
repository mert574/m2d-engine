import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { Attack } from '../constraints/attack.js';
import { Debug } from '../constraints/debug.js';
import { KeyboardControl } from '../constraints/keyboardControl.js';
import Matter from 'matter-js';

export class TopDownPlayer extends Entity {
  name = 'Player';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    Matter.Body.setMass(body, 1);

    this.facingDirection = 1;
    this.setAnimation('idle');

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      onDeath: () => {
        console.log('Game Over!');
        this.game.gameOver();
      },
      onDamage: (amount) => {
        console.log(`Player took ${amount} damage!`);
        this.game.soundManager.playSound('damage');
      }
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
      acceleration: 50,
      maxSpeed: 3,
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

    this.addConstraint('debug', new Debug(this, {
      boundsColor: '#00ff00',
      boundsFillColor: 'rgba(0, 255, 0, 0.1)',
      centerColor: '#ff0000',
      textColor: '#00ff00',
      healthyColor: '#00ff00',
      lowHealthColor: '#ff0000'
    }));
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);

    if (other.entity?.name === 'Coin') {
      this.game.soundManager.playSound('coin');
    }
  }

  draw() {
    super.draw();

    if (this.game.renderer.isDebugEnabled()) {
      // Draw facing direction
      const directionLength = 20;
      this.game.renderer.drawLine({
        x1: this.position.x,
        y1: this.position.y,
        x2: this.position.x + (directionLength * this.facingDirection),
        y2: this.position.y,
        strokeStyle: '#ff0000',
        lineWidth: 1
      });
    }
  }
}
