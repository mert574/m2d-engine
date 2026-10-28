import { Entity } from '../core/entity.js';

export class MovingPlatform extends Entity {
  name = 'MovingPlatform';

  constructor(body, sprite, game, options = {}) {
    body.isStatic = true;
    body.friction = 1;
    body.frictionStatic = 1;
    body.restitution = 0;
    super(body, sprite, game);

    this.points = options.path?.points || [];
    this.speed = options.path?.speed || 3;
    this.waitTime = options.path?.waitTime || 1000;
    this.currentPoint = 0;
    this.waiting = false;
    this.waitStart = 0;
    this.lastPosition = this.points[0] ? { ...this.points[0] } : { x: body.position.x, y: body.position.y };
    this.ridingEntities = new Set();

    if (this.points.length > 0) {
      this.body.setPosition(this.points[0]);
    }
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    
    // Riding means above the platform and horizontally overlapping it: the
    // gap between centres is less than the two half-widths combined.
    const otherHalfWidth = (other.bounds.max.x - other.bounds.min.x) / 2;
    if (other.position.y < this.position.y &&
        Math.abs(other.position.x - this.position.x) < this.size.x / 2 + otherHalfWidth) {
      this.ridingEntities.add(other);
    }
  }

  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    this.ridingEntities.delete(other);
  }

  update(deltaTime) {
    if (this.points.length < 2) return;

    if (this.waiting) {
      const elapsedTime = Date.now() - this.waitStart;
      if (elapsedTime >= this.waitTime) {
        this.waiting = false;
        this.currentPoint = (this.currentPoint + 1) % this.points.length;
      }
      return;
    }

    const target = this.points[this.currentPoint];
    const dx = target.x - this.body.position.x;
    const dy = target.y - this.body.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) {
      this.waiting = true;
      this.waitStart = Date.now();
      this.body.setPosition(target);
      return;
    }

    const actualMove = Math.min(this.speed * deltaTime, distance);
    const vx = (dx / distance) * actualMove;
    const vy = (dy / distance) * actualMove;

    this.lastPosition = { x: this.body.position.x, y: this.body.position.y };

    this.body.setPosition({
      x: this.body.position.x + vx,
      y: this.body.position.y + vy
    });

    const delta = {
      x: this.body.position.x - this.lastPosition.x,
      y: this.body.position.y - this.lastPosition.y
    };

    for (const body of this.ridingEntities) {
      if (body.entity) {
        body.translate(delta);
      }
    }
  }
} 