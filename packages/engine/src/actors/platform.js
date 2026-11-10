import { Entity } from '../core/entity.js';

export class Platform extends Entity {
  static description = 'A static platform or wall';
  name = 'Platform';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.setAnimation('default');
  }
}
