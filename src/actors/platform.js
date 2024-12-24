import { Entity } from '../core/entity.js';

export class Platform extends Entity {
  name = 'Platform';

  constructor(context, body, sprite, game) {
    body.isStatic = true;
    body.friction = 0.65;
    body.frictionStatic = 0.1;
    body.restitution = 0;
    super(context, body, sprite, game);
    this.visible = !body.render?.visible === false;
  }

  draw(deltaTime) {
    if (!this.visible) return;
    const pos = this.body.position;
    this.sprite.drawStatic(this.context, pos.x, pos.y, 0, 0);
  }
}
