import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import Matter from 'matter-js';
import { CollisionCategories } from '../core/constants.js';
import { Vec2 } from '../core/math.js';
import { drawVelocityDebug, drawHealthDebug, drawBoundsDebug, drawCenterDebug } from '../core/debug.js';
import { Debug } from '../constraints/debug.js';

export class Bee extends Entity {
  name = 'Bee';

  constructor(body, sprite, game, options = {}) {
    body.collisionFilter.category = CollisionCategories.enemy;
    super(body, sprite, game);
    
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

    this.addConstraint('debug', new Debug(this, {
      boundsColor: '#ff6b6b',
      boundsFillColor: 'rgba(255, 107, 107, 0.1)',
      centerColor: '#ff6b6b',
      textColor: '#ff9999',
      healthyColor: '#ff9999',
      lowHealthColor: '#ff4d4d',
      lowHealthThreshold: 15
    }));

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

  draw() {
    if (this.dead) return;
    super.draw();

    if (this.damageFlashTime > 0) {
      const pos = this.position;
      this.game.renderer.drawRect({
        x: pos.x - this.size.x / 2,
        y: pos.y - this.size.y / 2,
        width: this.size.x,
        height: this.size.y,
        fillStyle: 'rgba(255, 0, 0, 0.5)'
      });
    }

    if (this.game.renderer.isDebugEnabled()) {
      // Draw detection range
      this.game.renderer.drawArc({
        x: this.position.x,
        y: this.position.y,
        radius: this.detectionRange,
        startAngle: 0,
        endAngle: Math.PI * 2,
        strokeStyle: 'rgba(255, 214, 51, 0.4)',
        lineWidth: 1
      });

      // Draw target point and line to it
      this.game.renderer.drawArc({
        x: this.targetPoint.x,
        y: this.targetPoint.y,
        radius: 3,
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillStyle: '#ffd633'
      });

      this.game.renderer.drawLine({
        x1: this.position.x,
        y1: this.position.y,
        x2: this.targetPoint.x,
        y2: this.targetPoint.y,
        strokeStyle: 'rgba(255, 214, 51, 0.4)',
        lineWidth: 1
      });

      // Draw target change timer
      this.game.renderer.drawText({
        text: `target: ${this.targetChangeTime}/${this.targetChangeCooldown}`,
        x: this.body.bounds.min.x,
        y: this.body.bounds.max.y + 5,
        fillStyle: '#ff9999',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });

      // If player is in range, draw line to player
      if (this.game.player) {
        const distance = Vec2.distance(this.position, this.game.player.position);
        if (distance < this.detectionRange) {
          this.game.renderer.drawLine({
            x1: this.position.x,
            y1: this.position.y,
            x2: this.game.player.position.x,
            y2: this.game.player.position.y,
            strokeStyle: 'rgba(255, 107, 107, 0.4)',
            lineWidth: 1
          });
        }
      }
    }
  }
} 