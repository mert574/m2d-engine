import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import Matter from 'matter-js';
import { CollisionCategories } from '../core/constants.js';
import { Vec2 } from '../core/math.js';

export class Bee extends Entity {
  name = 'Bee';

  constructor(context, body, sprite, game) {
    Matter.Body.setMass(body, 1);
    body.frictionAir = 0.2;
    body.friction = 0.1;
    body.restitution = 0.2;
    body.inertia = Infinity;
    body.collisionFilter.category = CollisionCategories.enemy;

    super(context, body, sprite, game);
    this.speed = 0.5;
    this.idleSpeed = 0.3;
    this.detectionRange = 400;
    this.animTime = 0;
    this.animSpeed = 0.1;
    this.setAnimation('idle');
    this.damageFlashTime = 0;
    this.damageFlashDuration = 10;

    const health = new Health(this, 40);
    health.invulnerableDuration = 30;
    health.onDeath = () => {
      this.game.entities.delete(this);
      Matter.Composite.remove(this.game.engine.world, this.body);
    };
    health.onDamage = () => {
      this.damageFlashTime = this.damageFlashDuration;
      this.setAnimation('idle');
      this.game.soundManager.playSound('damage');
    };
    this.addConstraint('health', health);

    this.targetPoint = this.getNewTargetPoint();
    this.targetChangeTime = 0;
    this.targetChangeCooldown = 120;
  }

  getNewTargetPoint() {
    const range = 50;
    return {
      x: this.position.x + (Math.random() * range * 2 - range),
      y: this.position.y + (Math.random() * range * 2 - range)
    };
  }

  update() {
    if (this.dead) return;
    super.update();

    if (this.damageFlashTime > 0) {
      this.damageFlashTime--;
    }

    if (!this.game.player) return;

    const distance = Vec2.distance(this.position, this.game.player.position);

    if (distance < this.detectionRange) {
      const dir = Vec2.direction(this.position, this.game.player.position);
      const velocity = Vec2.scale(Vec2.normalize(dir), this.speed);
      Matter.Body.setVelocity(this.body, velocity);
    } else {
      this.targetChangeTime++;
      if (this.targetChangeTime >= this.targetChangeCooldown) {
        this.targetPoint = this.getNewTargetPoint();
        this.targetChangeTime = 0;
      }

      const distance = Vec2.distance(this.position, this.targetPoint);
      if (distance > 1) {
        const dir = Vec2.direction(this.position, this.targetPoint);
        const velocity = Vec2.scale(Vec2.normalize(dir), this.idleSpeed);
        Matter.Body.setVelocity(this.body, velocity);
      }
    }

    this.animTime += this.animSpeed;
    if (this.animTime >= 3) {
      this.animTime = 0;
    }
    this.sprite.currentFrame = Math.floor(this.animTime);
  }

  draw(deltaTime) {
    if (this.dead) return;
    super.draw(deltaTime);

    if (this.damageFlashTime > 0) {
      const pos = this.position;
      const ctx = this.context;
      ctx.save();
      ctx.globalAlpha = this.damageFlashTime / this.damageFlashDuration;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.fillRect(
        pos.x - this.size.x / 2,
        pos.y - this.size.y / 2,
        this.size.x,
        this.size.y
      );
      ctx.restore();
    }
  }
} 