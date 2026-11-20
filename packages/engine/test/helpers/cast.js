import { Entity } from '../../src/core/entity.ts';
import { Projectile } from '../../src/core/projectile.ts';
import { Health } from '../../src/constraints/health.ts';
import { Attack } from '../../src/constraints/attack.ts';
import { KeyboardControl } from '../../src/constraints/keyboardControl.ts';
import { Chase } from '../../src/constraints/chase.ts';
import { ContactDamage } from '../../src/constraints/contactDamage.ts';
import { DamageFlash } from '../../src/constraints/damageFlash.ts';
import { Hover } from '../../src/constraints/hover.ts';
import { Collectable } from '../../src/constraints/collectable.ts';
import { PathFollow } from '../../src/constraints/pathFollow.ts';
import { ProximityPrompt } from '../../src/constraints/proximityPrompt.ts';
import { Vec2 } from '../../src/core/math.ts';
import { s } from '../../src/core/schema.ts';

/**
 * The engine's test cast: game-shaped actors composed from the engine's
 * own capabilities, so the suites can drive a whole simulation — a
 * controlled body, something that chases, something that shoots, a lift, a
 * pickup, someone to talk to — without depending on the kit, whose pieces
 * these resemble. Class names are the names the fixtures' scenes register
 * them under; `name` fields are what the suites look entities up by.
 */

/** A static body: a floor, a wall. */
export class Platform extends Entity {
  name = 'Platform';
}

/** A side-view body on the keyboard: runs, hits, has health. */
export class Player extends Entity {
  name = 'Player';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setMass(1);
    this.facingDirection = 1;
    this.addConstraint('health', new Health(this, { maxHealth: 100, onDeath: () => this.game.gameOver() }));
    this.addConstraint('attack', new Attack(this, { damage: 65, range: 50, cooldown: 22.5 }));
    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 3000, maxSpeed: 180, continuous: true, verticalMovement: false,
      onDirectionChange: (direction) => { this.facingDirection = direction; },
      onAttack: () => this.getConstraint('attack').startAttack(this.facingDirection)
    }));
  }
}

/** The same body moving in the plane. */
export class TopDownPlayer extends Entity {
  name = 'Player';
  static replicated = ['facingDirection'];
  /** What a client runs early for its own avatar; see net/prediction.js. */
  static predictedConstraints = ['control'];
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setMass(1);
    this.facingDirection = 1;
    this.addConstraint('health', new Health(this, { maxHealth: 100, onDeath: () => this.game.gameOver() }));
    this.addConstraint('attack', new Attack(this, { damage: 65, range: 50, cooldown: 22.5 }));
    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 3000, maxSpeed: 180, continuous: true, verticalMovement: true,
      onDirectionChange: (direction) => { this.facingDirection = direction; },
      onAttack: () => this.getConstraint('attack').startAttack(this.facingDirection)
    }));
  }
}

/** The plane mover with a heading it keeps, which it swings at; always on the ground. */
export class ObliquePlayer extends TopDownPlayer {
  static replicated = ['heading'];
  static predictedFields = ['heading'];
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.heading = Math.PI / 2;
    const control = this.getConstraint('control');
    control.onMove = (dx, dy) => { if (dx !== 0 || dy !== 0) this.heading = Math.atan2(dy, dx); };
    control.onAttack = () => this.getConstraint('attack').startAttack(this.heading);
  }

  /** A plane walker never leaves the ground, so its footsteps count. */
  get isAirborne() { return false; }
}

/** Chases the nearest avatar, hurts on contact, dies and is gone. */
export class Ghost extends Entity {
  name = 'Ghost';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('damageFlash', new DamageFlash(this));
    this.addConstraint('health', new Health(this, { maxHealth: 100, invulnerableDuration: 0.5, whenDead: 'remove' }));
    this.addConstraint('contactDamage', new ContactDamage(this, { damage: 33, knockbackStrength: 480 }));
    this.addConstraint('chase', new Chase(this, { speed: 60, idleSpeed: 36, detectionRange: 400 }));
  }
}

/** A `Ghost` that knocks harder. */
export class Bee extends Ghost {
  name = 'Bee';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.getConstraint('contactDamage').knockbackStrength = 720;
  }
}

/** A projectile that draws nothing: the turret's shot. */
export class Rocket extends Projectile {
  name = 'Rocket';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, { speed: options.speed ?? 480, damage: options.damage ?? 25, maxLifetime: options.maxLifetime ?? 6, ...options });
  }
  draw() {}
}

/** Shoots the nearest avatar in range and in sight, on a cooldown. */
export class Turret extends Entity {
  name = 'Turret';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.detectionRange = options.detectionRange || 350;
    this.fireRate = options.fireRate || 2;
    this.rocketSpeed = options.rocketSpeed || 360;
    this.rocketDamage = options.rocketDamage || 25;
    this.fireCooldown = 0;
    this.aimDirection = { x: 1, y: 0 };
    this.addConstraint('health', new Health(this, { maxHealth: options.health || 80, invulnerableDuration: 0.3, whenDead: 'remove' }));
    this.addConstraint('contactDamage', new ContactDamage(this, { damage: 25, knockbackStrength: 360 }));
    // Its shots are spawned by name, on a server and on its clients alike.
    if (game.actors && !game.actors.has('Rocket')) game.registerActor('Rocket', Rocket);
  }

  fixedUpdate(dt) {
    if (this.dead) return;
    super.fixedUpdate(dt);
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    const target = this.game.players.nearestAvatar(this.position, this.detectionRange);
    if (!target) return;
    this.aimDirection = Vec2.normalize(Vec2.direction(this.position, target.position));
    const blockers = this.game.physics.raycast(this.position, target.position, (body) => body.bodyType === 'static' && body !== this.body);
    if (blockers.length || this.fireCooldown > 0) return;
    // Spawned by name with plain options, so a client can rebuild it from the spawn record.
    this.game.spawn({
      type: 'Rocket', x: this.position.x + this.aimDirection.x * 36, y: this.position.y + this.aimDirection.y * 36, width: 24, height: 8,
      physics: { bodyType: 'dynamic' },
      options: { direction: { ...this.aimDirection }, speed: this.rocketSpeed, damage: this.rocketDamage, maxLifetime: 6 }
    });
    this.fireCooldown = this.fireRate;
  }
}

/** A kinematic body patrolling `properties.path`. */
export class MovingPlatform extends Entity {
  name = 'MovingPlatform';
  static properties = { path: s.object(PathFollow.params, { label: 'Path' }) };
  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    body.friction = 1;
    body.restitution = 0;
    super(body, sprite, game);
    this.addConstraint('path', new PathFollow(this, options.path));
  }
}

/** A pickup: bobs, and is collected on an avatar's touch. */
export class Coin extends Entity {
  name = 'Coin';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
    this.addConstraint('collectable', new Collectable(this));
  }
}

/** Someone to talk to: a prompt within `talkRadius`. */
export class Npc extends Entity {
  name = 'Npc';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.who = options.who ?? null;
    this.addConstraint('prompt', new ProximityPrompt(this, { radius: options.talkRadius ?? 110, text: 'E' }));
  }
}
