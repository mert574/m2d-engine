import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { Attack } from '../constraints/attack.js';
import { Debug } from '../constraints/debug.js';
import { KeyboardControl } from '../constraints/keyboardControl.js';
import Matter from 'matter-js';

export class Player extends Entity {
  name = 'Player';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    Matter.Body.setMass(body, 1);

    this.jumpVelocity = 12;
    this.facingDirection = 1;
    this.setAnimation('idle');
    this.groundContacts = new Set();

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
      verticalMovement: false,
      onMove: (dx, dy) => {
        if (dx !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange: (direction) => {
        this.facingDirection = direction;
      },
      onJump: () => {
        if (this.isOnGround()) {
          Matter.Body.setVelocity(this.body, { x: this.body.velocity.x, y: -this.jumpVelocity });
          this.setAnimation('jump');
          this.game.soundManager.playSound('jump');
        }
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

    if (other.position.y > this.position.y + (this.size.y / 2)) {
      if (other.entity?.name === 'Platform' || other.entity?.name === 'MovingPlatform') {
        this.groundContacts.add(other.id);
      }
    }
  }

  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    this.groundContacts.delete(other.id);
  }

  isOnGround() {
    return this.groundContacts.size > 0;
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

      // Draw ground state
      this.game.renderer.drawText({
        text: `ground: ${this.isOnGround()}`,
        x: this.body.bounds.min.x,
        y: this.body.bounds.max.y + 5,
        fillStyle: '#00ff00',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });
    }
  }
}
