import { Entity } from 'm2d-engine/core/entity.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';
import { s } from 'm2d-engine/core/schema.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';

export interface MovingPlatformOptions {
  /** The patrol, as `PathFollow`'s own params. */
  path?: Record<string, unknown>;
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

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: MovingPlatformOptions = {}) {
    body.bodyType = 'kinematic';
    body.friction = 1;
    body.restitution = 0;
    super(body, sprite, game);
    this.addConstraint('path', new PathFollow(this, options.path));
  }
}
