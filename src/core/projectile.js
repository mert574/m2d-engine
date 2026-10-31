import { Entity } from './entity.js';
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
    body.setCollisionFilter({
      category: CollisionCategories.projectile,
      // 'default' covers walls/platforms, which set no specific category.
      mask: options.collisionMask ?? (CollisionCategories.player | CollisionCategories.default)
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
    this.targetNames = options.targetNames ?? ['Player'];

    // Calculate rotation from direction
    this.rotation = Math.atan2(this.direction.y, this.direction.x);

    // Set initial velocity
    this.applyVelocity();
  }

  applyVelocity() {
    const velocity = Vec2.scale(this.direction, this.speed);
    this.body.setVelocity(velocity);
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

    // Check if hit a wall/platform — scenery, not actors: a character is
    // kinematic under the hood but is a person, not a wall.
    if (this.destroyOnWallHit &&
        (other.entity?.name === 'Platform'
          || other.bodyType === 'static' || other.bodyType === 'kinematic')) {
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
    this.game.physics.remove(this.body);
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
