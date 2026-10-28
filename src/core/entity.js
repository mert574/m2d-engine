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

    this.size = body.size;

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

    const pos = this.renderPosition;
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

    // Tile the sprite across the body's exact footprint: a size that is not a
    // tile multiple squashes the tiles slightly rather than overdrawing past
    // the body, and tile offsets rotate *around the body centre* with the
    // body's angle, so a rotated entity draws as one coherent rotated block
    // in the same place the physics sees it.
    const tileSize = this.sprite.width;
    const cols = Math.max(1, Math.ceil(this.size.x / tileSize));
    const rows = Math.max(1, Math.ceil(this.size.y / tileSize));
    const tileW = this.size.x / cols;
    const tileH = this.size.y / rows;
    const angle = this.renderAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const localX = -this.size.x / 2 + (i + 0.5) * tileW;
        const localY = -this.size.y / 2 + (j + 0.5) * tileH;

        this.sprite.draw(this.currentAnim,
          pos.x + localX * cos - localY * sin,
          pos.y + localX * sin + localY * cos,
          { rotation: angle, width: tileW, height: tileH });
      }
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }

  get position() {
    return this.body.position;
  }

  /**
   * Where to draw this entity, blended between physics steps so motion stays
   * smooth on displays faster than the solver's fixed rate. Use this in
   * `draw`, and `position` everywhere else. See PhysicsBody.renderPosition.
   */
  get renderPosition() {
    return this.body.renderPosition;
  }

  /** The angle to draw this entity at. See `renderPosition`. */
  get renderAngle() {
    return this.body.renderAngle;
  }

  /** Bounds at the drawn position, for edge-anchored annotations. */
  get renderBounds() {
    return this.body.renderBounds;
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

  isFalling(threshold = 30) {
    return this.velocity.y > threshold;
  }

  isJumping(threshold = -30) {
    return this.velocity.y < threshold;
  }

  isMovingHorizontally(threshold = 6) {
    return Math.abs(this.velocity.x) > threshold;
  }

  isMovingLeft(threshold = 6) {
    return this.velocity.x < -threshold;
  }

  isMovingRight(threshold = 6) {
    return this.velocity.x > threshold;
  }

  isInAir() {
    return !this.isOnGround();
  }

  isOnGround() {
    const contacts = this.game.physics.contactsWith(
      this.body,
      (other) => other.entity?.name === 'Platform'
    );

    for (const contact of contacts) {
      const dy = contact.position.y - this.position.y;
      if (dy > 0 && Math.abs(dy) < this.size.y) {
        return true;
      }
    }
    return false;
  }
} 