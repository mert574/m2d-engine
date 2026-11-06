import { Angle, DIRECTIONS_8 as DIRECTIONS } from './math.js';

export class Entity {
  name = 'Entity';

  /**
   * Fields a server sends to clients when they change, beside the
   * transform. A subclass adds its own with a `static replicated` array of
   * its own; the lists of every class in the chain are joined. Values must
   * be plain data. See net/replication.js.
   */
  static replicated = ['elevation', 'visible', 'dead'];

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

    /**
     * A stable id for networking, allocated in creation order and reset
     * with the scene, so a server and a client that build the same scene
     * agree on it. Null in a game object without the allocator (tests).
     * @type {number|null}
     */
    this.netId = game.allocateNetId?.(this) ?? null;
    /**
     * The `id` of the scene object this entity was placed from, or null for
     * an entity spawned during play. Author-chosen and stable across edits
     * and reloads, unlike `netId`, which is allocated in creation order.
     * Look one up with `scene.entitiesById`.
     * @type {string|null}
     */
    this.sceneId = null;
    /**
     * The player whose input drives this entity, by id, or null for the
     * local player. See core/players.js.
     * @type {string|null}
     */
    this.playerId = null;

    // Link body to entity for collision detection
    body.entity = this;
    this.constraints = new Map();
    this.currentAnim = null;
    /**
     * How the sprite covers the body. `false` tiles the frame across the
     * size at its natural scale, right for a platform or a wall. `true`
     * stretches one frame to the size, right for a character whose frame
     * *is* its drawn size.
     */
    this.spriteFit = false;
    /**
     * The drawn size under `spriteFit`, when it differs from the body's
     * size: an isometric block whose ground footprint is 64 by 64 draws as
     * a 128 by 128 image. Null means the entity's `size`.
     * @type {{x: number, y: number}|null}
     */
    this.spriteSize = null;
    /** Seconds into the current animation; `update` advances it. */
    this.animTime = 0;
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

    /**
     * Draw order within the scene. Entities draw in ascending `zIndex`, and
     * within one `zIndex` by `depth`. Tile layers share the scale: the
     * background layer sits at -1, so an entity at -2 draws under the
     * floor and one at 10 draws over a canopy layer at 5.
     */
    this.zIndex = 0;

    /**
     * Height above the ground plane, in world units, for perspectives that
     * fake a third axis: a top-down jump, a beat 'em up's leap, a flight.
     * Simulation state — set it in `fixedUpdate`, where a hit test can ask
     * "is this thing in the air" — but one the physics body never sees: the
     * collider stays on the ground and only the drawn sprite rises. Drawing
     * reads `renderElevation`, blended between ticks like the position.
     */
    this.elevation = 0;
    this._previousElevation = 0;

    /**
     * The drawn frame when it is not the collider. `createEntity` sets
     * `body.frame` for a prefab with a `footprint`: the body is the feet,
     * a short box at the bottom of the object, and the sprite stands above
     * it, so a character can walk behind a tree whose trunk is the only
     * solid part. `size` is then the frame, and `frameOffset` is where its
     * centre sits relative to the body's.
     */
    const frame = body.frame;
    this.size = frame ? { x: frame.width, y: frame.height } : body.size;
    this.frameOffset = frame ? { x: frame.offsetX ?? 0, y: frame.offsetY ?? 0 } : { x: 0, y: 0 };

    this._contacts = new Set();
  }

  /**
   * The sort key within a `zIndex`: entities with a smaller depth draw
   * first, so a larger one is nearer the viewer. By default the bottom edge
   * of the body — the feet — at the drawn position, which is the one rule
   * every 3/4 and isometric game shares: whatever stands lower on the
   * ground is in front. Assign a number to pin an entity's depth instead.
   */
  get depth() {
    if (this._depth !== undefined) return this._depth;
    const pos = this.body.renderPosition;
    const feetY = pos.y + this.body.size.y / 2;
    const projection = this.game.projection;
    return projection ? projection.toScreen(pos.x, feetY).y : feetY;
  }

  set depth(value) {
    this._depth = value;
  }

  addConstraint(name, constraint) {
    this.constraints.set(name, constraint);
  }

  getConstraint(name) {
    return this.constraints.get(name);
  }

  /**
   * Release everything the entity's constraints registered elsewhere.
   *
   * Most constraints only read and write the entity, and have nothing to
   * give back. The ones that register with an engine-wide service — an
   * `Interactive` entity sits in the input router's hit-test set — must be
   * torn down, or the router keeps hit-testing an entity that no longer
   * exists and clicks land on empty space.
   */
  /**
   * The owning player, or null when the local player drives this entity
   * (or the game has no players registry).
   */
  get player() {
    return this.playerId === null ? null : (this.game.players?.get(this.playerId) ?? null);
  }

  /**
   * This tick's input for this entity: the owning player's snapshot, or
   * the game's own. Constraints read this and never `game.input` directly,
   * so one actor serves a single-player game and every player on a server.
   */
  get input() {
    return (this.player ?? this.game.players?.local)?.snapshot ?? this.game.input.snapshot;
  }

  destroy() {
    for (const constraint of this.constraints.values()) {
      constraint.destroy?.();
    }
    this.constraints.clear();
    this.dead = true;
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

  /**
   * One simulation tick. Runs once per fixed step, before physics, with the
   * constant `dt`; this is where movement, cooldowns, damage and spawning
   * belong. The base method ticks the constraints. Call `super.fixedUpdate`
   * when overriding.
   * @param {number} dt - Seconds; always `game.time.fixedTimestep`.
   */
  fixedUpdate(dt) {
    if (this.dead) return;

    // The baseline `renderElevation` blends from. Taken here, before the
    // constraints and the subclass change the value, which is why an
    // override should call `super.fixedUpdate` first.
    this._previousElevation = this.elevation;

    for (const constraint of this.constraints.values()) {
      constraint.fixedUpdate(dt);
    }
  }

  /**
   * One frame of presentation, with the frame's game-time delta: animation
   * cycles, flashes, anything visual that is not the physics body. The base
   * method updates the constraints. Nothing here should change what the
   * simulation sees; that is `fixedUpdate`.
   * @param {number} deltaTime - Seconds of game time this frame.
   */
  update(deltaTime) {
    if (this.dead) return;

    this.animTime += deltaTime;
    for (const constraint of this.constraints.values()) {
      constraint.update(deltaTime);
    }
  }

  /** The frame of the current animation to draw now. */
  get animFrame() {
    if (!this.sprite || !this.currentAnim) return 0;
    return this.sprite.frameAt(this.currentAnim, this.animTime);
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

    if (this.spriteFit) {
      const size = this.spriteSize ?? this.size;
      this.sprite.draw(this.currentAnim, pos.x, pos.y, {
        rotation: this.renderAngle, width: size.x, height: size.y, frame: this.animFrame
      });
      for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
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
    const frame = this.animFrame;

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const localX = -this.size.x / 2 + (i + 0.5) * tileW;
        const localY = -this.size.y / 2 + (j + 0.5) * tileH;

        this.sprite.draw(this.currentAnim,
          pos.x + localX * cos - localY * sin,
          pos.y + localX * sin + localY * cos,
          { rotation: angle, width: tileW, height: tileH, frame });
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
    const position = this.renderAnchor;
    const offset = this.renderOffset;
    const frame = this.frameOffset;
    const lift = this.renderElevation;
    if (offset.x === 0 && offset.y === 0 && frame.x === 0 && frame.y === 0 && lift === 0) {
      return position;
    }
    return {
      x: position.x + offset.x + frame.x,
      y: position.y + offset.y + frame.y - lift
    };
  }

  /**
   * The body's interpolated position on the render plane: through the
   * scene's projection when there is one, otherwise the position itself.
   * No offsets and no elevation, so it is what a camera follows and what a
   * ground shadow is drawn at.
   */
  get renderAnchor() {
    const position = this.body.renderPosition;
    const projection = this.game.projection;
    return projection ? projection.toScreen(position.x, position.y) : position;
  }

  /**
   * `elevation` blended between the previous and current tick, so a jump
   * rises as smoothly as the body moves. See PhysicsBody.renderPosition.
   */
  get renderElevation() {
    const current = this.elevation;
    const previous = this._previousElevation;
    if (current === previous) return current;
    const alpha = this.game.physics?.interpolation ?? 1;
    if (alpha >= 1) return current;
    return previous + (current - previous) * alpha;
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

  /**
   * Switch animations. The cycle restarts when the name changes and keeps
   * its place when it does not, so calling this every frame with the same
   * name is safe.
   * @param {string|null} name
   * @param {Object} [options]
   * @param {boolean} [options.restart=false] - Restart even if unchanged
   */
  setAnimation(name, { restart = false } = {}) {
    if (!this.sprite) return;
    if (!name || !this.sprite.animations) {
      this.currentAnim = null;
      return;
    }
    if (this.sprite.animations.has(name)) {
      if (name !== this.currentAnim || restart) this.animTime = 0;
      this.currentAnim = name;
    }
  }

  /**
   * Switch to the facing variant of an animation: `${base}_${direction}`
   * with the direction one of the eight compass names (`'down_right'`, see
   * DIRECTIONS_8), falling back to the base name when the sheet has no such
   * variant. A sheet with four facings can define only `down`, `up`,
   * `left` and `right`; the diagonals fall back to the nearest cardinal.
   * @param {string} base - Animation family, e.g. `'run'`
   * @param {number} angle - Facing in radians on the ground plane, y down;
   *   mapped to the screen under a projection
   */
  setDirectionalAnimation(base, angle, options) {
    if (!this.sprite) return;
    // The sheet's facings are what the viewer sees, so a ground heading is
    // turned into its on-screen angle under a projection.
    const projection = this.game.projection;
    const facing = projection ? projection.screenAngle(angle) : angle;
    const sector = Angle.sector(facing, 8);
    const names = [DIRECTIONS[sector]];
    if (sector % 2 === 1) {
      // A diagonal: prefer the vertical cardinal, then the horizontal.
      names.push(DIRECTIONS[(sector + 1) % 8], DIRECTIONS[(sector + 7) % 8]);
    }
    for (const direction of names) {
      const name = `${base}_${direction}`;
      if (this.sprite.has(name)) { this.setAnimation(name, options); return; }
    }
    this.setAnimation(base, options);
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