import { Entity } from 'm2d-engine/core/entity.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { ContactDamage } from 'm2d-engine/constraints/contactDamage.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { DamageFlash } from 'm2d-engine/constraints/damageFlash.js';
import { Hover } from 'm2d-engine/constraints/hover.js';
import { Collectable } from 'm2d-engine/constraints/collectable.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';
import { CollisionCategories } from 'm2d-engine/core/constants.js';
import { s } from 'm2d-engine/core/schema.js';

/**
 * The stock cast: gameplay actors that are compositions of the engine's
 * capabilities. The engine names what a thing does (`Collectable`,
 * `Chase`, `PathFollow`); the kit names what it is in a game. The demos
 * extend these — a Thug is a `Ghost` from a street sheet, an Ember a
 * glowing `Coin` — and a new game starts from them or from the prefab
 * templates below, which compose the same capabilities over the engine's
 * `Prop` with no class at all.
 */

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
    body.setCollisionFilter({ category: CollisionCategories.enemy });
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

/** A pickup: `Hover` bobs and spins it, `Collectable` takes it on an avatar's touch. */
export class Coin extends Entity {
  static description = 'A pickup collected on touch';
  name = 'Coin';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
    this.addConstraint('collectable', new Collectable(this));
  }
}

/**
 * A platform that patrols a path, pausing at each point.
 *
 * It is a *kinematic* body: game code decides where it goes, but the solver
 * still resolves its contacts, so anything standing on it is carried along
 * by friction and anything in its way is pushed — none of that is tracked
 * here. The movement itself is the reusable PathFollow constraint; this
 * actor is just the body setup.
 */
export class MovingPlatform extends Entity {
  static description = 'A platform that patrols a path, pausing at each point';
  name = 'MovingPlatform';

  /** The path is the `PathFollow` constraint's own params, set through this actor. */
  static properties = {
    path: s.object(PathFollow.params, { label: 'Path' })
  };

  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    body.friction = 1;
    body.restitution = 0;
    super(body, sprite, game);
    this.addConstraint('path', new PathFollow(this, options.path));
  }
}

/**
 * Prefab templates: ready-made `prefabs` entries the editor's component
 * library and an agent (through `list_components` and `edit_scene`) copy
 * into a scene. Art-free on purpose — each composes engine capabilities
 * over `Prop`, so it plays the moment it lands and a sheet or a light is
 * the scene author's next edit.
 */
export const PREFAB_TEMPLATES = {
  mob: {
    description: 'A walking enemy: chases in range, hurts on contact, flashes when hit, dies and is gone',
    dimensions: 2,
    prefab: {
      actor: 'Prop',
      physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.05, category: 'enemy' },
      properties: { color: '#b0455a' },
      constraints: {
        health: { type: 'Health', params: { maxHealth: 60, invulnerableDuration: 0.5, whenDead: 'remove' } },
        chase: { type: 'Chase', params: { speed: 60, idleSpeed: 36, detectionRange: 400 } },
        contactDamage: { type: 'ContactDamage', params: { damage: 25, knockbackStrength: 480 } },
        damageFlash: { type: 'DamageFlash' }
      }
    }
  },
  pickup: {
    description: 'A pickup: bobs, collects on touch, counts a counter and raises picked',
    dimensions: 2,
    prefab: {
      actor: 'Prop',
      physics: { bodyType: 'static', isSensor: true },
      properties: { color: '#ffd75e' },
      constraints: {
        hover: { type: 'Hover', params: { amplitude: 5, frequency: 2 } },
        collectable: { type: 'Collectable' }
      }
    }
  }
};

/** Register the cast and the templates, marked as the kit's for the editor's catalog. */
export function registerKitActors(game) {
  const kit = { origin: 'kit' };
  game.registerActor('Ghost', Ghost, kit);
  game.registerActor('Bee', Bee, kit);
  game.registerActor('Coin', Coin, kit);
  game.registerActor('MovingPlatform', MovingPlatform, kit);
  for (const [name, template] of Object.entries(PREFAB_TEMPLATES)) {
    game.registerPrefabTemplate(name, template, kit);
  }
}
