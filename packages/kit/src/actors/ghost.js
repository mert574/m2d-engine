import { Entity } from 'm2d-engine/core/entity.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { ContactDamage } from 'm2d-engine/constraints/contactDamage.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { DamageFlash } from 'm2d-engine/constraints/damageFlash.js';

/**
 * A floating enemy that drifts toward the player: `Health` (100, half a
 * second invulnerable, removed from the world at zero), `ContactDamage`
 * (33, 480 px/s knockback), `Chase` (60 px/s, 36 idle, 400 range) and
 * `DamageFlash`. A scene retunes any of them by slot.
 */
export class Ghost extends Entity {
  static description = 'A floating enemy that drifts toward the player';
  name = 'Ghost';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    this.setAnimation('idle');
    this.addConstraint('damageFlash', new DamageFlash(this));
    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      invulnerableDuration: 0.5,
      whenDead: 'remove',
      // Simulation-side: the pose. The flash and the sound are world
      // events, so they also happen on a client watching this entity.
      onDamage: () => {
        this.setAnimation('idle');
      }
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

  /** The hit sound, wherever the hit was simulated. */
  onWorldEvent(name, data) {
    super.onWorldEvent(name, data);
    if (name === 'damage') this.game.soundManager.playSound('damage');
  }

  // Presentation only. A sheet with named animations plays them from
  // `Entity.update`'s clock at their own `fps`; a sheet without any keeps
  // the old contract: its columns step at 6 fps. Movement, chasing and
  // damage are in the constraints' fixedUpdate.
  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);
    if (!this.currentAnim && this.sprite?.image) {
      const columns = Math.floor(this.sprite.image.width / this.sprite.tileW);
      if (columns > 1) this.sprite.currentFrame = Math.floor(this.animTime * 6) % columns;
    }
  }
}

/** A `Ghost` that hits harder: the same cast with 720 px/s knockback. */
export class Bee extends Ghost {
  static description = 'A flying enemy that bobs and chases';
  name = 'Bee';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.getConstraint('contactDamage').knockbackStrength = 720;
  }
}
