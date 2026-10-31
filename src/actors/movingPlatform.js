import { Entity } from '../core/entity.js';
import { PathFollow } from '../constraints/pathFollow.js';

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
  name = 'MovingPlatform';

  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    body.friction = 1;
    body.restitution = 0;
    super(body, sprite, game);

    this.addConstraint('path', new PathFollow(this, options.path));
  }
}
