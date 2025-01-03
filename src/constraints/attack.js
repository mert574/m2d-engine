import { Constraint } from '../core/constraint.js';
import Matter from 'matter-js';
import { CollisionCategories } from '../core/constants.js';
import { Angle } from '../core/math.js';

export class Attack extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.damage = options.damage || 10;
    this.range = options.range || 40;
    this.cooldown = options.cooldown || 30; // frames
    this.knockback = options.knockback || 0.02;
    this.onStart = options.onStart;

    this.isAttacking = false;
    this.currentCooldown = 0;
    this.direction = 1; // 1 for right, -1 for left
    this.hits = new Set();
    this.attackDuration = 10;
    this.attackTime = 0;
    this.attackAnimEndTime = 20;

    this.hitCircle = Matter.Bodies.circle(0, 0, this.range, {
      isSensor: true,
      isStatic: true,
      collisionFilter: { category: CollisionCategories.enemy }
    });

    Matter.Composite.add(this.entity.game.engine.world, this.hitCircle);
  }

  update() {
    if (this.currentCooldown > 0) {
      this.currentCooldown--;
    }

    Matter.Body.setPosition(this.hitCircle, this.entity.position);

    if (this.isAttacking) {
      this.attackTime++;
      // Check for hits only on first frame
      if (this.attackTime === 1) {
        this.checkHits();
      }
      if (this.attackTime >= this.attackDuration) {
        this.isAttacking = false;
        this.attackTime = 0;
      }
      if (this.attackTime >= this.attackAnimEndTime && this.entity.currentAnim.includes('attack')) {
        this.entity.setAnimation('idle');
      }
    }
  }

  checkHits() {
    const collisions = Matter.Query.collides(this.hitCircle,
      Matter.Composite.allBodies(this.entity.game.engine.world)
        .filter(body => body.collisionFilter.category === CollisionCategories.enemy)
    );

    for (const collision of collisions) {
      const body = collision.bodyA === this.hitCircle ? collision.bodyB : collision.bodyA;
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
          Matter.Body.applyForce(body, body.position,
            { x: this.direction * 0.5, y: -0.3 });
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
    const pos = this.entity.position;

    // Draw full circle in light blue
    this.entity.game.renderer.drawArc({
      x: pos.x,
      y: pos.y,
      radius: this.range,
      startAngle: 0,
      endAngle: Math.PI * 2,
      strokeStyle: 'rgba(0, 150, 255, 0.3)',
      fill: false
    });

    // Draw active half in red when attacking
    if (this.isAttacking) {
      this.entity.game.renderer.drawArc({
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