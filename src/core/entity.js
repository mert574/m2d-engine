import { Debug } from '../constraints/debug.js';
import Matter from 'matter-js';

export class Entity {
  static name = 'Entity';

  constructor(context, body, sprite) {
    if (!context || !(context instanceof CanvasRenderingContext2D)) {
      throw new Error('Valid canvas context is required');
    }
    if (!body) {
      throw new Error('Physics body is required');
    }
    if (!sprite) {
      throw new Error('Sprite is required');
    }

    this.context = context;
    this.body = body;
    this.sprite = sprite;
    this.constraints = new Map();
    this.currentAnim = null;
    this.dead = false;

    const { min, max } = this.body.bounds;
    this.size = {
      x: max.x - min.x,
      y: max.y - min.y
    };

    this._contacts = new Set();

    // Add debug constraint by default
    this.addConstraint('debug', new Debug(this));
  }

  addConstraint(name, constraint) {
    this.constraints.set(name, constraint);
  }

  getConstraint(name) {
    return this.constraints.get(name);
  }

  onCollisionStart(other) {
    this._contacts.add(other);
    for (const constraint of this.constraints.values()) {
      constraint.onCollisionStart(other);
    }
  }

  onCollisionEnd(other) {
    this._contacts.delete(other);
    for (const constraint of this.constraints.values()) {
      constraint.onCollisionEnd(other);
    }
  }

  update(deltaTime) {
    if (this.dead) return;

    for (const constraint of this.constraints.values()) {
      constraint.update(deltaTime);
    }
  }

  draw(deltaTime) {
    if (this.dead) return;

    const pos = this.body.position;

    // Handle rotation
    this.context.save();
    this.context.translate(pos.x, pos.y);
    this.context.rotate(this.body.angle);
    this.sprite.draw(this.context, 0, 0, this.currentAnim);
    this.context.restore();

    // Draw constraints
    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }

  get position() {
    return this.body.position;
  }

  get velocity() {
    return this.body.velocity;
  }

  setAnimation(name) {
    if (this.sprite.animations.has(name)) {
      this.currentAnim = name;
    }
  }

  // Physics helper methods
  isFalling(threshold = 0.5) {
    return this.velocity.y > threshold;
  }

  isJumping(threshold = -0.5) {
    return this.velocity.y < threshold;
  }

  isMovingHorizontally(threshold = 0.1) {
    return Math.abs(this.velocity.x) > threshold;
  }

  isMovingLeft(threshold = 0.1) {
    return this.velocity.x < -threshold;
  }

  isMovingRight(threshold = 0.1) {
    return this.velocity.x > threshold;
  }

  isInAir() {
    return !this.isOnGround();
  }

  isOnGround() {
    const contacts = Matter.Query.collides(this.body, 
        Matter.Composite.allBodies(this.game.engine.world)
    );

    for (const { bodyA, bodyB } of contacts) {
        const contact = bodyA === this.body ? bodyB : bodyA;
        if (!contact.entity) continue;
        if (contact.entity.name !== 'Platform') continue;

        const dy = contact.position.y - this.position.y;
        if (dy > 0 && Math.abs(dy) < this.size.y) {
            return true;
        }
    }
    return false;
  }
} 