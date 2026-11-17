import { Entity } from 'm2d-engine/core/entity.js';
import { Constraint } from 'm2d-engine/core/constraint.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { ContactDamage } from 'm2d-engine/constraints/contactDamage.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { DamageFlash } from 'm2d-engine/constraints/damageFlash.js';
import { Hover } from 'm2d-engine/constraints/hover.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';
import { CollisionCategories } from 'm2d-engine/core/constants.js';
import { s } from 'm2d-engine/core/schema.js';

/**
 * The stock cast: gameplay actors that are compositions of the engine's
 * constraints, and the `Pickup` constraint that collects on touch. They
 * came out of the engine (engine-surface, phase 3): the demos extend them
 * — a Thug is a `Ghost` from a street sheet, an Ember a glowing `Coin` —
 * and a new game starts from them or from the prefab templates below,
 * which compose the same behaviours over the engine's `Prop` with no
 * class at all.
 */

type Game = {
  players: { isAvatar(entity: unknown): boolean };
  entities: { delete(entity: unknown): void };
  physics: { remove(body: unknown): void };
  events?: { emit(name: string, data?: Record<string, unknown>): void };
  soundManager: { playSound(key: string): void };
  time: { elapsed: number };
  sceneManager?: { getCurrentScene(): { counters?: { add(name: string, amount: number): void } } | null };
  registerActor(name: string, klass: unknown, options?: { origin?: 'game' | 'kit' }): void;
  registerConstraint(name: string, klass: unknown, options?: { origin?: 'game' | 'kit' }): void;
  registerPrefabTemplate?(name: string, template: unknown, options?: { origin?: 'game' | 'kit' }): void;
};

type Body = { entity?: { name?: string; dead?: boolean } | null; setCollisionFilter(filter: { category: number }): void };

/**
 * A floating enemy that drifts toward the player: `Health` (100, half a
 * second invulnerable, removed from the world at zero), `ContactDamage`
 * (33, 480 px/s knockback), `Chase` (60 px/s, 36 idle, 400 range) and
 * `DamageFlash`. A scene retunes any of them by slot.
 */
export class Ghost extends Entity {
  static override description = 'A floating enemy that drifts toward the player';
  override name = 'Ghost';

  constructor(body: Body, sprite: unknown, game: unknown, options: Record<string, unknown> = {}) {
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
  override onWorldEvent(name: string, data: unknown): void {
    super.onWorldEvent(name, data as object);
    if (name === 'damage') (this.game as Game).soundManager.playSound('damage');
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

  constructor(body: Body, sprite: unknown, game: unknown, options: Record<string, unknown> = {}) {
    super(body, sprite, game, options);
    (this.getConstraint('contactDamage') as { knockbackStrength: number }).knockbackStrength = 720;
  }
}

/** A pickup collected on an avatar's touch; `Hover` bobs and spins it. */
export class Coin extends Entity {
  static override description = 'A pickup collected on touch';
  override name = 'Coin';

  constructor(body: Body, sprite: unknown, game: unknown, options: Record<string, unknown> = {}) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
  }

  override onCollisionStart(other: { entity?: unknown }): void {
    super.onCollisionStart(other);
    const game = this.game as Game;
    // Any player's avatar collects it: on a server there is one per player.
    if (game.players.isAvatar(other.entity)) {
      game.entities.delete(this);
      game.physics.remove(this.body);
    }
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
  static override description = 'A platform that patrols a path, pausing at each point';
  override name = 'MovingPlatform';

  /** The path is the `PathFollow` constraint's own params, set through this actor. */
  static override properties = {
    path: s.object(PathFollow.params, { label: 'Path' })
  };

  constructor(body: Body & { bodyType: string; friction: number; restitution: number }, sprite: unknown, game: unknown, options: Record<string, unknown> = {}) {
    body.bodyType = 'kinematic';
    body.friction = 1;
    body.restitution = 0;
    super(body, sprite, game);
    this.addConstraint('path', new PathFollow(this, options.path as object | undefined));
  }
}

/**
 * Collects its entity on an avatar's touch: the entity leaves the world,
 * `counter` (when named) goes up by one, and the world event `picked` is
 * raised where the touch was simulated — a rule plays the sound
 * (`{ "when": { "event": "emit", "name": "picked" }, ... }`) or shows the
 * count. What `Coin` does as a class, as a constraint any actor can carry;
 * the `pickup` prefab template is `Prop` plus `Hover` plus this.
 */
export class Pickup extends Constraint {
  static override description = 'Collect on an avatar\'s touch: remove the entity, count a counter, raise picked';
  static override params = {
    counter: s.string({ description: 'A plain counter in world.counters to add 1 to when taken' })
  };

  counter: string | null;

  constructor(entity: { game: unknown }, options: { counter?: string } = {}) {
    super(entity);
    this.counter = options.counter ?? null;
  }

  override onCollisionStart(other: { entity?: unknown }): void {
    const entity = this.entity as InstanceType<typeof Entity>;
    const game = entity.game as Game;
    if (!game.players.isAvatar(other.entity)) return;
    game.entities.delete(entity);
    game.physics.remove(entity.body);
    if (this.counter) entity.scene?.counters?.add(this.counter, 1);
    const { x, y } = entity.position;
    game.events?.emit('picked', { id: entity.netId, at: { x: Math.round(x), y: Math.round(y) } });
  }
}

/**
 * Prefab templates: ready-made `prefabs` entries the editor's component
 * library and an agent (through `list_components` and `edit_scene`) copy
 * into a scene. Art-free on purpose — each composes engine constraints
 * over `Prop`, so it plays the moment it lands and a sheet or a light is
 * the scene author's next edit.
 */
export const PREFAB_TEMPLATES: Record<string, { description: string; dimensions: 2; prefab: Record<string, unknown> }> = {
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
        pickup: { type: 'Pickup' }
      }
    }
  }
};

/** Register the cast, `Pickup` and the templates, marked as the kit's for the editor's catalog. */
export function registerKitActors(game: Game): void {
  const kit = { origin: 'kit' as const };
  game.registerActor('Ghost', Ghost, kit);
  game.registerActor('Bee', Bee, kit);
  game.registerActor('Coin', Coin, kit);
  game.registerActor('MovingPlatform', MovingPlatform, kit);
  game.registerConstraint('Pickup', Pickup, kit);
  for (const [name, template] of Object.entries(PREFAB_TEMPLATES)) {
    game.registerPrefabTemplate?.(name, template, kit);
  }
}
