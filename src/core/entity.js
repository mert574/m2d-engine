import Matter from 'matter-js';

export class Entity {
  name = 'Entity';

  constructor(context, body, sprite, game) {
    if (!context || !(context instanceof CanvasRenderingContext2D)) {
      throw new Error('Valid canvas context is required');
    }
    if (!body) {
      throw new Error('Physics body is required');
    }
    if (!game) {
      throw new Error('Game instance is required');
    }

    this.context = context;
    this.body = body;
    this.sprite = sprite;
    this.game = game;
    this.constraints = new Map();
    this.currentAnim = null;
    this.dead = false;

    const { min, max } = this.body.bounds;
    this.size = {
      x: max.x - min.x,
      y: max.y - min.y
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

  draw(ctx) {
    if (this.dead) return;

    const pos = this.body.position;
    const tileSize = this.sprite.width;
    const tilesNeededX = Math.ceil(this.size.x / tileSize);
    const tilesNeededY = Math.ceil(this.size.y / tileSize);

    if (this.body.angle) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(this.body.angle);
    }

    for (let i = 0; i < tilesNeededX; i++) {
      for (let j = 0; j < tilesNeededY; j++) {
        const baseX = this.body.angle ? -this.size.x/2 : pos.x - this.size.x/2;
        const baseY = this.body.angle ? -this.size.y/2 : pos.y - this.size.y/2;
        const x = baseX + i * tileSize + tileSize/2;
        const y = baseY + j * tileSize + tileSize/2;
        this.sprite.draw(ctx, x, y, this.currentAnim);
      }
    }

    if (this.body.angle) {
      ctx.restore();
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(ctx);
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