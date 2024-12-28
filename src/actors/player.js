import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { Attack } from '../constraints/attack.js';
import { Debug } from '../constraints/debug.js';
import { KeyboardControl } from '../constraints/keyboardControl.js';
import Matter from 'matter-js';

export class Player extends Entity {
  name = 'Player';

  constructor(context, body, sprite, game, options = {}) {
    super(context, body, sprite, game);

    Matter.Body.setMass(body, 1);

    this.jumpForce = 0.133;
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
      cooldown: 60,
      onStart: () => {
        this.game.soundManager.playSound('attack');
      }
    }));

    this.addConstraint('control', new KeyboardControl(this, {
      moveForce: 0.006,
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
          Matter.Body.applyForce(this.body, this.position, { x: 0, y: -this.jumpForce });
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

    this.addConstraint('debug', new Debug(this));
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);

    if (other.entity?.name === 'coin') {
      this.game.soundManager.playSound('coin');
    }

    if (other.position.y > this.position.y + (this.size.y / 2)) {
      if (other.entity?.name === 'platform' || other.entity?.name === 'movingPlatform') {
        this.groundContacts.add(other.id);
      }
    }

    if (other.entity?.name === 'bee') {
      const health = this.getConstraint('health');
      if (health) {
        health.takeDamage(33);
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
}
