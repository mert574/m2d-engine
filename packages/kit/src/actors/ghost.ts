import { Entity, type M2D } from 'm2d-engine';
import { Health, ContactDamage, Chase, DamageFlash } from 'm2d-engine/constraints';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


/**
 * A floating enemy that drifts toward the player: `Health` (100, half a
 * second invulnerable, removed from the world at zero), `ContactDamage`
 * (33, 480 px/s knockback), `Chase` (60 px/s, 36 idle, 400 range) and
 * `DamageFlash`. A scene retunes any of them by slot.
 */
export class Ghost extends Entity {
  static override description = 'A floating enemy that drifts toward the player';
  override name = 'Ghost';

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D) {
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
  override onWorldEvent(name: string, data: object): void {
    super.onWorldEvent(name, data);
    if (name === 'damage') this.game.soundManager?.playSound('damage');
  }

  // Presentation only. A sheet with named animations plays them from
  // `Entity.update`'s clock at their own `fps`; a sheet without any keeps
  // the old contract: its columns step at 6 fps. Movement, chasing and
  // damage are in the constraints' fixedUpdate.
  override update(deltaTime: number): void {
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
  static override description = 'A flying enemy that bobs and chases';
  override name = 'Bee';

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D) {
    super(body, sprite, game);
    const contact = this.getConstraint('contactDamage') as ContactDamage;
    contact.knockbackStrength = 720;
  }
}
