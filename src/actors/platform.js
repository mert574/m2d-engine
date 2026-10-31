import { Entity } from '../core/entity.js';

export class Platform extends Entity {
  name = 'Platform';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.setAnimation('default');
  }
}
