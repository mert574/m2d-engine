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
    this.visible = true;

    /**
     * Purely visual displacement and rotation, added on top of the body's
     * interpolated transform when drawing. For decoration — a pickup's bob,
     * a marker's spin — that must never touch the physics body: writing a
     * body's position every frame means the solver, the queries and the
     * interpolation baseline all see scenery wobble. See the Hover
     * constraint for the packaged version.
     */
    this.renderOffset = { x: 0, y: 0 };
    this.renderAngleOffset = 0;

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
    if (this.dead || !this.visible) return;

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
    const position = this.body.renderPosition;
    const offset = this.renderOffset;
    if (offset.x === 0 && offset.y === 0) return position;
    return { x: position.x + offset.x, y: position.y + offset.y };
  }

  /** The angle to draw this entity at. See `renderPosition`. */
  get renderAngle() {
    return this.body.renderAngle + this.renderAngleOffset;
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

  /**
   * Whether something solid is holding this entity up.
   *
   * A character body already knows — its controller computes grounding as
   * part of every move. For everything else it is decided by contact
   * normals, not by where the other body's centre happens to sit: the
   * normal points from this body towards what it is touching, so a surface
   * underneath gives a normal pointing down (+y) and a wall gives a
   * sideways one. `GROUND_NORMAL_Y` is the cutoff, and at 0.5 it accepts
   * slopes up to 60° while still rejecting walls.
   */
  isOnGround() {
    return this.groundBody !== null;
  }

  /**
   * The body currently holding this entity up, or null.
   *
   * Worth having rather than just a yes/no: standing on something that
   * moves means the ground is a moving frame of reference, and input that
   * ignores that fights the ride instead of adding to it.
   */
  get groundBody() {
    const GROUND_NORMAL_Y = 0.5;
    if (this.body.bodyType === 'character') return this.body.groundBody;

    const surface = this.game.physics
      .surfacesWith(this.body, (other) => !other.isSensor)
      .find(({ normal }) => normal.y > GROUND_NORMAL_Y);
    return surface ? surface.body : null;
  }
} 