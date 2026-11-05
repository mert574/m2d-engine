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

    this.setAnimation('idle');

    this.addConstraint('damageFlash', new DamageFlash(this));

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      invulnerableDuration: 0.5,
      onDeath: () => {
        this.game.entities.delete(this);
        this.game.physics.remove(this.body);
      },
      // Simulation-side: the pose. The flash and the sound are world
      // events, so they also happen on a client watching this entity.
      onDamage: () => {
        this.setAnimation('idle');
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

  // Presentation only. A sheet with named animations plays them from
  // `Entity.update`'s clock at their own `fps`. A sheet without any (so no
  // animation was set) keeps the old contract: its columns step at 6 fps.
  // Movement, chasing and damage are in the constraints' fixedUpdate.
  /** The hit sound, wherever the hit was simulated. */
  onWorldEvent(name, data) {
    super.onWorldEvent(name, data);
    if (name === 'damage') this.game.soundManager.playSound('damage');
  }

  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);
    if (!this.currentAnim && this.sprite?.image) {
      const columns = Math.floor(this.sprite.image.width / this.sprite.tileW);
      if (columns > 1) this.sprite.currentFrame = Math.floor(this.animTime * 6) % columns;
    }
  }
}
