import { Entity } from './entity.js';
import { Vec2 } from './math.ts';

/**
 * Base class for projectiles (rockets, bullets, arrows, etc.)
 * Handles common projectile behavior: movement, lifetime, collision, and destruction.
 */
export class Projectile extends Entity {
  name = 'Projectile';

  constructor(body, sprite, game, options = {}) {
    // Collision filtering before super(): `layer` and `collidesWith` are
    // the project's layer names; `collisionMask` is the raw-bit escape for
    // code that computed one (the kit's turret excludes its own layer).
    body.setCollisionFilter({
      ...(options.layer !== undefined && { category: game.collisionLayers.bit(options.layer) }),
      mask: options.collisionMask ?? game.collisionLayers.mask(options.collidesWith)
    });
    body.isSensor = options.isSensor ?? false;
    // Projectiles are the fast movers; CCD stops them tunneling through thin
    // walls.
    body.bullet = true;
    body.frictionAir = 0;
    body.friction = 0;

    super(body, sprite, game);

    this.speed = options.speed ?? 480; // px/s
    this.damage = options.damage ?? 10;
    this.direction = Vec2.normalize(options.direction ?? { x: 1, y: 0 });
    this.lifetime = 0;
    this.maxLifetime = options.maxLifetime ?? 5;
    this.owner = options.owner ?? null;
    this.destroyOnWallHit = options.destroyOnWallHit ?? true;
    this.destroyOnEntityHit = options.destroyOnEntityHit ?? true;
    /**
     * What it hurts: entity names, or, when none are given, the players'
     * avatars (`game.players.isAvatar`), which is what a turret's shot means
     * alone and on a server alike.
     * @type {string[]|null}
     */
    this.targetNames = options.targetNames ?? null;

    // Calculate rotation from direction
    this.rotation = Math.atan2(this.direction.y, this.direction.x);

    // Set initial velocity
    this.applyVelocity();
  }

  applyVelocity() {
    const velocity = Vec2.scale(this.direction, this.speed);
    this.body.setVelocity(velocity);
  }

  fixedUpdate(dt) {
    if (this.dead) return;
    super.fixedUpdate(dt);

    this.lifetime += dt;
    if (this.lifetime >= this.maxLifetime) {
      this.game.removeEntity(this);
      return;
    }

    // Maintain constant velocity (override physics drag)
    this.applyVelocity();
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);

    // Skip collision with owner
    if (this.owner && other.entity === this.owner) {
      return;
    }

    // Check if hit a target entity
    if (other.entity && this.isTarget(other.entity)) {
      this.onHitTarget(other.entity);
      if (this.destroyOnEntityHit) this.game.removeEntity(this);
      return;
    }

    // Check if hit scenery: a static or kinematic body that is not a target.
    if (this.destroyOnWallHit && (other.bodyType === 'static' || other.bodyType === 'kinematic')) {
      this.onHitWall(other);
      this.game.removeEntity(this);
    }
  }

  /** Whether `entity` is something this projectile hurts. */
  isTarget(entity) {
    return this.targetNames ? this.targetNames.includes(entity.name) : this.game.players.isAvatar(entity);
  }

  /**
   * Called when projectile hits a target entity.
   * Override to customize hit behavior.
   */
  onHitTarget(entity) {
    const health = entity.getConstraint('health');
    if (health) {
      health.takeDamage(this.damage);
    }
  }

  /**
   * Called when projectile hits a wall.
   * Override to add effects like explosions.
   */
  onHitWall(wall) {
    // Override in subclass for custom behavior
  }

  draw() {
    if (this.dead) return;

    // Default draw: simple colored rectangle
    const pos = this.renderPosition;
    const renderer = this.game.renderer;

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: this.rotation });
    renderer.drawRect({ x: -8, y: -2, width: 16, height: 4, fillStyle: '#ff0000' });
    renderer.popTransform();
  }

  setAnimation() {
    // No-op by default, projectiles typically draw themselves
  }
}
