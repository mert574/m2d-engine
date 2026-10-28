import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { ContactDamage } from '../constraints/contactDamage.js';
import { CollisionCategories } from '../core/constants.js';
import { Vec2 } from '../core/math.js';
import { Debug } from '../constraints/debug.js';

export class Ghost extends Entity {
  name = 'Ghost';

  constructor(body, sprite, game, options = {}) {
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    super(body, sprite, game);
    
    this.speed = 60; // px/s
    this.idleSpeed = 36;
    this.detectionRange = 400;
    this.animTime = 0;
    this.animSpeed = 6; // frames per second
    this.setAnimation('idle');
    this.damageFlashTime = 0;
    this.damageFlashDuration = 0.167; // ~10 frames at 60fps in seconds

    const health = new Health(this, 40);
    health.invulnerableDuration = 0.5; // seconds
    health.onDeath = () => {
      this.game.entities.delete(this);
      this.game.physics.remove(this.body);
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

    this.addConstraint('contactDamage', new ContactDamage(this, {
      damage: 33,
      knockbackStrength: 480
    }));

    this.targetPoint = this.getNewTargetPoint();
    this.targetChangeTime = 0;
    this.targetChangeCooldown = 2; // seconds
  }

  getNewTargetPoint() {
    const range = 50;
    return {
      x: this.position.x + (Math.random() * range * 2 - range),
      y: this.position.y + (Math.random() * range * 2 - range)
    };
  }

  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);

    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= deltaTime;
    }

    if (!this.game.player) return;

    // Don't move while stunned
    const contactDamage = this.getConstraint('contactDamage');
    if (contactDamage?.isStunned()) return;

    const distance = Vec2.distance(this.position, this.game.player.position);

    if (distance < this.detectionRange) {
      const dir = Vec2.direction(this.position, this.game.player.position);
      const velocity = Vec2.scale(Vec2.normalize(dir), this.speed);
      this.body.setVelocity(velocity);
    } else {
      this.targetChangeTime += deltaTime;
      if (this.targetChangeTime >= this.targetChangeCooldown) {
        this.targetPoint = this.getNewTargetPoint();
        this.targetChangeTime = 0;
      }

      const distance = Vec2.distance(this.position, this.targetPoint);
      if (distance > 1) {
        const dir = Vec2.direction(this.position, this.targetPoint);
        const velocity = Vec2.scale(Vec2.normalize(dir), this.idleSpeed);
        this.body.setVelocity(velocity);
      }
    }

    // Only animate if sprite has multiple frames
    if (this.sprite && this.sprite.image) {
      const frameCount = Math.floor(this.sprite.image.width / this.sprite.tileW);
      if (frameCount > 1) {
        this.animTime += this.animSpeed * deltaTime;
        if (this.animTime >= frameCount) {
          this.animTime = 0;
        }
        this.sprite.currentFrame = Math.floor(this.animTime);
      }
    }
  }

  draw() {
    if (this.dead) return;
    super.draw();

    if (this.damageFlashTime > 0) {
      const pos = this.renderPosition;
      this.game.renderer.drawRect({
        x: pos.x - this.size.x / 2,
        y: pos.y - this.size.y / 2,
        width: this.size.x,
        height: this.size.y,
        fillStyle: 'rgba(255, 0, 0, 0.5)'
      });
    }

    if (this.game.renderer.isDebugEnabled()) {
      // The attention radius, its target dot and the lines between them are
      // annotations on top of the game, so they go to the world overlay:
      // world coordinates and world sizes, rasterized at display resolution.
      // The 3-unit target dot in particular would vanish at a low render
      // resolution if it were drawn into the world surface.
      const overlay = this.game.worldOverlay;

      // Draw detection range
      overlay.drawArc({
        x: this.renderPosition.x,
        y: this.renderPosition.y,
        radius: this.detectionRange,
        startAngle: 0,
        endAngle: Math.PI * 2,
        strokeStyle: 'rgba(255, 214, 51, 0.4)',
        lineWidth: 1
      });

      // Draw target point and line to it
      overlay.drawArc({
        x: this.targetPoint.x,
        y: this.targetPoint.y,
        radius: 3,
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillStyle: '#ffd633'
      });

      overlay.drawLine({
        x1: this.renderPosition.x,
        y1: this.renderPosition.y,
        x2: this.targetPoint.x,
        y2: this.targetPoint.y,
        strokeStyle: 'rgba(255, 214, 51, 0.4)',
        lineWidth: 1
      });

      overlay.drawText({
        text: `target: ${this.targetChangeTime}/${this.targetChangeCooldown}`,
        x: this.renderBounds.min.x,
        y: this.renderBounds.max.y,
        offsetY: 5,
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
          overlay.drawLine({
            x1: this.renderPosition.x,
            y1: this.renderPosition.y,
            x2: this.game.player.renderPosition.x,
            y2: this.game.player.renderPosition.y,
            strokeStyle: 'rgba(255, 107, 107, 0.4)',
            lineWidth: 1
          });
        }
      }
    }
  }
} 