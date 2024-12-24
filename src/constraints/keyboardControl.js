import { Constraint } from '../core/constraint.js';
import Matter from 'matter-js';

export class KeyboardControl extends Constraint {
  constructor(entity, options = {}) {
    super(entity);

    this.keys = {
      left: 37,   // ArrowLeft
      right: 39,  // ArrowRight
      up: 38,     // ArrowUp
      down: 40,   // ArrowDown
      jump: 32,   // Space
      attack: 88, // X key
      ...options.keys
    };

    // Movement configuration
    this.moveForce = options.moveForce || 0.01;
    this.maxSpeed = options.maxSpeed || 5;
    this.continuous = options.continuous ?? true; // Whether to apply force continuously or set velocity
    this.verticalMovement = options.verticalMovement ?? true; // Whether to allow up/down movement

    Object.values(this.keys).forEach(key => {
      this.entity.game.keys.addKey(key);
    });

    this.onMove = options.onMove?.bind(entity);
    this.onDirectionChange = options.onDirectionChange?.bind(entity);
    this.onJump = options.onJump?.bind(entity);
    this.onAttack = options.onAttack?.bind(entity);
  }

  update() {
    if (this.entity.dead) return;

    const pressedKeys = this.entity.game.keys.pressedKeys();
    let dx = 0;
    let dy = 0;

    if (pressedKeys.has(this.keys.left)) dx -= 1;
    if (pressedKeys.has(this.keys.right)) dx += 1;
    if (this.verticalMovement) {
      if (pressedKeys.has(this.keys.up)) dy -= 1;
      if (pressedKeys.has(this.keys.down)) dy += 1;
    }

    // Normalize diagonal movement to prevent faster diagonal speed
    if (dx !== 0 && dy !== 0) {
      const norm = Math.sqrt(2);
      dx /= norm;
      dy /= norm;
    }

    if (dx !== 0 || dy !== 0) {
      if (this.continuous) {
        Matter.Body.applyForce(
          this.entity.body,
          this.entity.position,
          {
            x: dx * this.moveForce,
            y: dy * this.moveForce
          }
        );
      } else {
        Matter.Body.setVelocity(
          this.entity.body,
          {
            x: dx * this.maxSpeed,
            y: dy * this.maxSpeed
          }
        );
      }

      if (this.onMove) {
        this.onMove(dx, dy);
      }

      if (this.onDirectionChange && dx !== 0) {
        this.onDirectionChange(dx > 0 ? 1 : -1);
      }
    } else if (this.onMove) {
      this.onMove(0, 0);
    }

    if (pressedKeys.has(this.keys.jump) && this.onJump) {
      this.onJump();
    }

    if (pressedKeys.has(this.keys.attack) && this.onAttack) {
      this.onAttack();
    }

    if (this.continuous) {
      const velocity = this.entity.velocity;
      const speed = Math.abs(velocity.x);
      if (speed > this.maxSpeed) {
        const scale = this.maxSpeed / speed;
        Matter.Body.setVelocity(this.entity.body, {
          x: velocity.x * scale,
          y: velocity.y
        });
      }
    }
  }
} 