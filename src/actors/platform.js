import { Entity } from '../core/entity.js';

export class Platform extends Entity {
  name = 'Platform';

  constructor(context, body, sprite, game, options = {}) {
    super(context, body, sprite, game);
    this.visible = !body.render?.visible === false;
    this.setAnimation('default');
  }
}
