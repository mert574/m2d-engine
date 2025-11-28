import Matter from 'matter-js';

export class Entity {
  name = 'Entity';

  constructor(body, sprite, game) {
    if (!body) {
      throw new Error('Physics body is required');
    }
    if (!game) {
      throw new Error('Game instance is required');
    }

    this.body = body;
    this.sprite = sprite;
    this.game = game;

    // Link body to entity for collision detection
    body.entity = this;
    this.constraints = new Map();
    this.currentAnim = null;
    this.dead = false;

    this.size = {
      x: body.bounds.max.x - body.bounds.min.x,
      y: body.bounds.max.y - body.bounds.min.y
    };

    this._contacts = new Set();
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
    if (!this.sprite || !this.sprite.width) {
      // Draw a placeholder rectangle if sprite is missing
      this.game.renderer.drawRect({
        x: pos.x - this.size.x/2,
        y: pos.y - this.size.y/2,
        width: this.size.x,
        height: this.size.y,
        fillStyle: '#ff0000'
      });
      return;
    }

    const tileSize = this.sprite.width;
    const tilesNeededX = Math.ceil(this.size.x / tileSize);
    const tilesNeededY = Math.ceil(this.size.y / tileSize);

    for (let i = 0; i < tilesNeededX; i++) {
      for (let j = 0; j < tilesNeededY; j++) {
        const x = pos.x - this.size.x/2 + i * tileSize + tileSize/2;
        const y = pos.y - this.size.y/2 + j * tileSize + tileSize/2;
        
        this.sprite.draw(this.currentAnim, x, y, {
          rotation: this.body.angle
        });
      }
    }

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
    if (!this.sprite) return;
    if (!name || !this.sprite.animations) {
      this.currentAnim = null;
      return;
    }
    if (this.sprite.animations.has(name)) {
      this.currentAnim = name;
    }
  }

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
    const world = this.game.engine.world;
    const contacts = Matter.Query.collides(this.body, Matter.Composite.allBodies(world));
    
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