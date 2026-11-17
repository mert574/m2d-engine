import { Entity } from '../../src/core/entity.js';
import { Health } from '../../src/constraints/health.js';
import { ContactDamage } from '../../src/constraints/contactDamage.js';
import { Chase } from '../../src/constraints/chase.js';
import { Hover } from '../../src/constraints/hover.js';
import { Collectable } from '../../src/constraints/collectable.js';
import { PathFollow } from '../../src/constraints/pathFollow.js';
import { CollisionCategories } from '../../src/core/constants.js';
import { s } from '../../src/core/schema.js';

/**
 * Stand-ins for the kit's stock cast (m2d-kit/actors), which these tests
 * exercised when it lived in the engine. The engine cannot depend on the
 * kit, so the compositions are duplicated here: what matters to the suites
 * is the behaviour over the engine's own constraints — seeded wander
 * targets, contact damage, collect-on-touch, a patrolling kinematic — not
 * the classes' home.
 */

export class Ghost extends Entity {
  name = 'Ghost';
  constructor(body, sprite, game, options = {}) {
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    super(body, sprite, game);
    this.addConstraint('health', new Health(this, { maxHealth: 100, invulnerableDuration: 0.5, whenDead: 'remove' }));
    this.addConstraint('contactDamage', new ContactDamage(this, { damage: 33, knockbackStrength: 480 }));
    this.addConstraint('chase', new Chase(this, { speed: 60, idleSpeed: 36, detectionRange: 400 }));
  }
}

export class Bee extends Ghost {
  name = 'Bee';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.getConstraint('contactDamage').knockbackStrength = 720;
  }
}

export class Coin extends Entity {
  name = 'Coin';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('hover', new Hover(this, { amplitude: 5, frequency: 2, spin: 2 }));
    this.addConstraint('collectable', new Collectable(this));
  }
}

export class MovingPlatform extends Entity {
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
