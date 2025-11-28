import { Constraint } from '../core/constraint.js';
import Matter from 'matter-js';

export class ContactDamage extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.damage = options.damage ?? 33;
    this.knockbackStrength = options.knockbackStrength ?? 12;
    this.stunDuration = options.stunDuration ?? 0.5;
    this.stunTime = 0;
    this.collidingEntities = new Set();
  }

  update(deltaTime) {
    if (this.stunTime > 0) {
      this.stunTime -= deltaTime;
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

  isStunned() {
    return this.stunTime > 0;
  }

  applyDamage(otherEntity) {
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
      Matter.Body.setVelocity(otherEntity.body, {
        x: dirX * this.knockbackStrength,
        y: dirY * this.knockbackStrength
      });

      // Stun self after hitting
      if (!this.entity.body.isStatic) {
        this.stunTime = this.stunDuration;
      }
    }
  }

  onCollisionStart(other) {
    const otherEntity = other.entity;
    if (!otherEntity) return;

    // Track colliding entity for continuous damage
    if (!otherEntity.getConstraint('contactDamage')) {
      this.collidingEntities.add(otherEntity);
    }

    this.applyDamage(otherEntity);
  }

  onCollisionEnd(other) {
    const otherEntity = other.entity;
    if (otherEntity) {
      this.collidingEntities.delete(otherEntity);
    }
  }
}
