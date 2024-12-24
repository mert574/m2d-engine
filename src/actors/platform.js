import { Entity } from '../core/entity.js';

export class Platform extends Entity {
    constructor(context, body, sprite, game) {
        // Make the body static with minimal friction
        body.isStatic = true;
        body.friction = 0.1;
        body.frictionStatic = 0.5;
        body.restitution = 0;
        super(context, body, sprite);
        this.game = game;
        this.visible = !body.render?.visible === false;
    }

    draw(deltaTime) {
        if (!this.visible) return;
        const pos = this.body.position;
        this.sprite.drawStatic(this.context, pos.x, pos.y, 0, 0);
    }
}
