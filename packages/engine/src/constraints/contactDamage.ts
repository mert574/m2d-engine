import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import type { PhysicsBody } from '../core/physics/index.ts';
import { s } from '../core/schema.ts';

export class ContactDamage extends Constraint {
  static override description = 'Deal damage to whatever this touches';
  static override params = {
    damage: s.number({ initial: 33, min: 0 }),
    knockbackStrength: s.number({ initial: 720, min: 0, unit: 'px/s' }),
    stunDuration: s.number({ initial: 0.5, min: 0, unit: 's' })
  };

  damage: number;
  knockbackStrength: number;
  stunDuration: number;
  stunTime: number;
  collidingEntities: Set<Entity>;

  constructor(entity: Entity, options: { damage?: number; knockbackStrength?: number; stunDuration?: number } = {}) {
    super(entity);
    this.damage = options.damage ?? 33;
    this.knockbackStrength = options.knockbackStrength ?? 720; // px/s
    this.stunDuration = options.stunDuration ?? 0.5;
    this.stunTime = 0;
    this.collidingEntities = new Set();
  }

  override fixedUpdate(dt: number): void {
    if (this.stunTime > 0) {
      this.stunTime -= dt;
    }

    // Apply continuous damage to colliding entities
    for (const otherEntity of this.collidingEntities) {
      if (otherEntity.dead) {
        this.collidingEntities.delete(otherEntity);
        continue;
      }
      this.applyDamage(otherEntity);
    }
  }

  isStunned(): boolean {
    return this.stunTime > 0;
  }

  applyDamage(otherEntity: Entity): void {
    const health = otherEntity.getConstraint('health');
    if (!health || health.isInvulnerable()) return;

    // Don't damage entities that also have contactDamage (enemy vs enemy)
    if (otherEntity.getConstraint('contactDamage')) return;

    health.takeDamage(this.damage);

    // Apply knockback away from this entity
    if (this.knockbackStrength > 0) {
      const dx = otherEntity.position.x - this.entity.position.x;
      const dy = otherEntity.position.y - this.entity.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      // Push target away
      otherEntity.body.setVelocity({
        x: dirX * this.knockbackStrength,
        y: dirY * this.knockbackStrength
      });

      // Stun self after hitting
      if (this.entity.body.bodyType === 'dynamic') {
        this.stunTime = this.stunDuration;
      }
    }
  }

  override onCollisionStart(other: PhysicsBody): void {
    const otherEntity = other.entity;
    if (!otherEntity) return;

    // Track colliding entity for continuous damage
    if (!otherEntity.getConstraint('contactDamage')) {
      this.collidingEntities.add(otherEntity);
    }

    this.applyDamage(otherEntity);
  }

  override onCollisionEnd(other: PhysicsBody): void {
    const otherEntity = other.entity;
    if (otherEntity) {
      this.collidingEntities.delete(otherEntity);
    }
  }
}
