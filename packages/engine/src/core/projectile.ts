import { Entity } from './entity.ts';
import { Vec2 } from './math.ts';
import type { Vector2 } from './math.ts';
import type { M2D } from './m2d.js';
import type { PhysicsBody } from './physics/index.ts';
import type { SpriteSheet } from './spriteSheet.ts';

/** What a projectile subclass's constructor takes beside the entity's three. */
export interface ProjectileOptions {
  /** The project's layer name for this projectile's category. */
  layer?: string;
  /** Layer names it collides with; `collisionMask` is the raw-bit escape. */
  collidesWith?: string[];
  collisionMask?: number;
  isSensor?: boolean;
  /** px/s. */
  speed?: number;
  damage?: number;
  direction?: Vector2;
  /** Seconds before it removes itself. */
  maxLifetime?: number;
  /** Whose shot it is; never hurt and never collided with. */
  owner?: Entity | null;
  destroyOnWallHit?: boolean;
  destroyOnEntityHit?: boolean;
  /** What it hurts: entity names, or unset, the players' avatars. */
  targetNames?: string[] | null;
}

/**
 * Base class for projectiles (rockets, bullets, arrows, etc.)
 * Handles common projectile behavior: movement, lifetime, collision, and destruction.
 */
export class Projectile extends Entity {
  override name = 'Projectile';
  speed: number;
  damage: number;
  direction: Vector2;
  lifetime: number;
  maxLifetime: number;
  owner: Entity | null;
  destroyOnWallHit: boolean;
  destroyOnEntityHit: boolean;
  targetNames: string[] | null;
  rotation: number;

  constructor(body: PhysicsBody, sprite: SpriteSheet | null, game: M2D, options: ProjectileOptions = {}) {
    // Collision filtering before super(): `layer` and `collidesWith` are
    // the project's layer names; `collisionMask` is the raw-bit escape for
    // code that computed one (the kit's turret excludes its own layer).
    body.setCollisionFilter({
      ...(options.layer !== undefined && { category: game.collisionLayers!.bit(options.layer) }),
      mask: options.collisionMask ?? game.collisionLayers!.mask(options.collidesWith)
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
    // What it hurts; see `ProjectileOptions.targetNames`.
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

  override fixedUpdate(dt: number): void {
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

  override onCollisionStart(other: PhysicsBody): void {
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
  isTarget(entity: Entity): boolean {
    return this.targetNames ? this.targetNames.includes(entity.name) : this.game.players.isAvatar(entity);
  }

  /**
   * Called when projectile hits a target entity.
   * Override to customize hit behavior.
   */
  onHitTarget(entity: Entity): void {
    const health = entity.getConstraint('health');
    if (health) {
      health.takeDamage(this.damage);
    }
  }

  /**
   * Called when projectile hits a wall.
   * Override to add effects like explosions.
   */
  onHitWall(wall: PhysicsBody): void {
    // Override in subclass for custom behavior
  }

  override draw(): void {
    if (this.dead) return;

    // Default draw: simple colored rectangle
    const pos = this.renderPosition;
    const renderer = this.game.renderer;

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: this.rotation });
    renderer.drawRect({ x: -8, y: -2, width: 16, height: 4, fillStyle: '#ff0000' });
    renderer.popTransform();
  }

  override setAnimation(): void {
    // No-op by default, projectiles typically draw themselves
  }
}
