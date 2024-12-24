import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { Attack } from '../constraints/attack.js';
import { KeyboardControl } from '../constraints/keyboardControl.js';
import Matter from 'matter-js';

export class Player extends Entity {
  static name = 'Player';

  constructor(context, body, sprite, game) {
    // Low friction values for smooth player movement, slight air resistance for better control
    body.friction = 0.001;
    body.frictionStatic = 0.001;
    body.frictionAir = 0.05;
    body.restitution = 0;
    body.inertia = Infinity;
    Matter.Body.setMass(body, 1);

    super(context, body, sprite);
    this.game = game;
    this.jumpForce = 0.15;
    this.setAnimation('idle');

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      onDeath() {
        console.log('Game Over!');
        this.game.gameOver();
      },
      onDamage(amount) {
        console.log(`Player took ${amount} damage!`);
      }
    }));

    this.addConstraint('attack', new Attack(this, {
      damage: 15,
      range: 50,
      cooldown: 20
    }));

    this.addConstraint('control', new KeyboardControl(this, {
      moveForce: 0.01,
      maxSpeed: 5,
      continuous: true,
      verticalMovement: false,
      onMove(dx, dy) {
        if (dx !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange(direction) {
        this.facingDirection = direction;
      },
      onJump() {
        if (this.isOnGround()) {
          Matter.Body.applyForce(this.body, this.position, { x: 0, y: -this.jumpForce });
          this.setAnimation('jump');
        }
      },
      onAttack() {
        const attack = this.getConstraint('attack');
        if (attack) {
          attack.startAttack(this.facingDirection);
        }
      }
    }));
    this.facingDirection = 1;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);

    if (other.entity?.name === 'Bee') {
      const health = this.getConstraint('health');
      if (health) {
        health.takeDamage(10);
      }
    }
  }
}
