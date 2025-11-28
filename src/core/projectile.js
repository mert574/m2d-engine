import { Entity } from './entity.js';
import Matter from 'matter-js';
import { CollisionCategories } from './constants.js';
import { Vec2 } from './math.js';

/**
 * Base class for projectiles (rockets, bullets, arrows, etc.)
 * Handles common projectile behavior: movement, lifetime, collision, and destruction.
 */
export class Projectile extends Entity {
  name = 'Projectile';

  constructor(body, sprite, game, options = {}) {
    // Set up collision filtering before super()
    body.collisionFilter.category = CollisionCategories.projectile;
    // Use 'default' for walls/platforms since Platform doesn't set a specific category
    body.collisionFilter.mask = options.collisionMask ?? (CollisionCategories.player | CollisionCategories.default);
    body.isSensor = options.isSensor ?? false;
    body.frictionAir = 0;
    body.friction = 0;
    body.frictionStatic = 0;

    super(body, sprite, game);

    this.speed = options.speed ?? 4;
    this.damage = options.damage ?? 10;
    this.direction = Vec2.normalize(options.direction ?? { x: 1, y: 0 });
    this.lifetime = 0;
    this.maxLifetime = options.maxLifetime ?? 5;
    this.owner = options.owner ?? null;
    this.destroyOnWallHit = options.destroyOnWallHit ?? true;
    this.destroyOnEntityHit = options.destroyOnEntityHit ?? true;
    this.targetNames = options.targetNames ?? ['Player'];

    // Calculate rotation from direction
    this.rotation = Math.atan2(this.direction.y, this.direction.x);

    // Set initial velocity
    this.applyVelocity();
  }

  applyVelocity() {
    const velocity = Vec2.scale(this.direction, this.speed);
    Matter.Body.setVelocity(this.body, velocity);
  }

  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);

    this.lifetime += deltaTime;
    if (this.lifetime >= this.maxLifetime) {
      this.destroy();
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
    if (other.entity && this.targetNames.includes(other.entity.name)) {
      this.onHitTarget(other.entity);
      if (this.destroyOnEntityHit) {
        this.destroy();
      }
      return;
    }

    // Check if hit a wall/platform
    if (this.destroyOnWallHit && (other.entity?.name === 'Platform' || other.isStatic)) {
      this.onHitWall(other);
      this.destroy();
    }
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

  /**
   * Remove projectile from the game.
   */
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.game.entities.delete(this);
    Matter.Composite.remove(this.game.engine.world, this.body);
  }

  draw() {
    if (this.dead) return;

    // Default draw: simple colored rectangle
    const pos = this.position;
    const ctx = this.game.renderer.worldContext;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(this.rotation);

    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-8, -2, 16, 4);

    ctx.restore();
  }

  setAnimation() {
    // No-op by default, projectiles typically draw themselves
  }
}
