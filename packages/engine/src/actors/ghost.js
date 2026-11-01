import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { ContactDamage } from '../constraints/contactDamage.js';
import { Chase } from '../constraints/chase.js';
import { DamageFlash } from '../constraints/damageFlash.js';
import { CollisionCategories } from '../core/constants.js';
import { Debug } from '../constraints/debug.js';

export class Ghost extends Entity {
  name = 'Ghost';

  constructor(body, sprite, game, options = {}) {
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    super(body, sprite, game);

    this.animTime = 0;
    this.animSpeed = 6; // frames per second
    this.setAnimation('idle');

    const flash = new DamageFlash(this);
    this.addConstraint('damageFlash', flash);

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      invulnerableDuration: 0.5,
      onDeath: () => {
        this.game.entities.delete(this);
        this.game.physics.remove(this.body);
      },
      onDamage: () => {
        flash.flash();
        this.setAnimation('idle');
        this.game.soundManager.playSound('damage');
      }
    }));

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

    this.addConstraint('chase', new Chase(this, {
      speed: 60,
      idleSpeed: 36,
      detectionRange: 400
    }));
  }

  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);

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
}
