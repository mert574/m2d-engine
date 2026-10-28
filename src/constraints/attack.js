import { Constraint } from '../core/constraint.js';
import { CollisionCategories } from '../core/constants.js';
import { Angle } from '../core/math.js';

export class Attack extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.damage = options.damage || 10;
    this.range = options.range || 40;
    this.cooldown = (options.cooldown || 30) / 60; // convert frames to seconds (assuming 60fps baseline)
    this.knockback = options.knockback || 0.02;
    this.onStart = options.onStart;

    this.isAttacking = false;
    this.currentCooldown = 0;
    this.direction = 1; // 1 for right, -1 for left
    this.hits = new Set();
    this.attackDuration = 0.167; // ~10 frames at 60fps in seconds
    this.attackTime = 0;
    this.attackAnimEndTime = 0.333; // ~20 frames at 60fps in seconds
    this.hasCheckedHits = false;

    this.hitCircle = this.entity.game.physics.createCircle({
      x: 0, y: 0, radius: this.range,
      isSensor: true,
      isStatic: true,
      category: CollisionCategories.enemy
    });

    this.entity.game.physics.add(this.hitCircle);
  }

  update(deltaTime) {
    if (this.currentCooldown > 0) {
      this.currentCooldown -= deltaTime;
    }

    this.hitCircle.setPosition(this.entity.position);

    if (this.isAttacking) {
      // Check for hits only on first update of attack
      if (!this.hasCheckedHits) {
        this.checkHits();
        this.hasCheckedHits = true;
      }
      this.attackTime += deltaTime;
      if (this.attackTime >= this.attackDuration) {
        this.isAttacking = false;
        this.attackTime = 0;
        this.hasCheckedHits = false;
      }
      if (this.attackTime >= this.attackAnimEndTime && this.entity.currentAnim?.includes('attack')) {
        this.entity.setAnimation('idle');
      }
    }
  }

  checkHits() {
    const hits = this.entity.game.physics.contactsWith(
      this.hitCircle,
      (body) => body.collisionFilter.category === CollisionCategories.enemy
    );

    for (const body of hits) {
      if (!body.entity || body.entity === this.entity || this.hits.has(body.entity)) continue;

      // Check if enemy is in the correct half of the circle
      const attackPoint = {
        x: this.entity.position.x + this.direction * this.entity.size.x / 2,
        y: this.entity.position.y
      };
      const angle = Angle.between(attackPoint, body.position);

      if (Angle.inHalfCircle(angle, this.direction)) {
        this.hits.add(body.entity);
        const health = body.entity.getConstraint('health');
        if (health && !health.isInvulnerable()) {
          health.takeDamage(this.damage);
          // Values measured from the applyForce this replaced, so the
          // knockback fling feels identical.
          body.applyImpulse({ x: this.direction * 8140, y: -4880 });
        }

      }
    }
  }

  startAttack(direction) {
    if (this.currentCooldown > 0) return;

    this.isAttacking = true;
    this.direction = direction;
    this.hits.clear();
    this.currentCooldown = this.cooldown;
    this.attackTime = 0;
    this.entity.setAnimation(direction > 0 ? 'attackRight' : 'attackLeft');
    
    if (this.onStart) {
      this.onStart();
    }
  }

  draw() {
    const pos = this.entity.renderPosition;
    // Attack range is an annotation on top of the game: it describes a world
    // region but is not world content, so it goes to the overlay and is
    // rasterized at display resolution instead of blurring with the world.
    const overlay = this.entity.game.worldOverlay;

    // The passive range ring is a diagnostic, not gameplay feedback, so it
    // only shows in debug mode. The attack flash below stays unconditional.
    if (this.entity.game.renderer.isDebugEnabled()) {
      overlay.drawArc({
        x: pos.x,
        y: pos.y,
        radius: this.range,
        startAngle: 0,
        endAngle: Math.PI * 2,
        strokeStyle: 'rgba(0, 150, 255, 0.3)',
        fill: false
      });
    }

    // Draw active half in red when attacking
    if (this.isAttacking) {
      overlay.drawArc({
        x: pos.x,
        y: pos.y,
        radius: this.range,
        startAngle: this.direction > 0 ? -Math.PI / 2 : Math.PI / 2,
        endAngle: this.direction > 0 ? Math.PI / 2 : 3 * Math.PI / 2,
        fillStyle: 'rgba(255, 0, 0, 0.2)',
        strokeStyle: 'rgba(255, 0, 0, 0.5)'
      });
    }
  }
} 