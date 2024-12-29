import { Entity } from '../core/entity.js';

export class Trigger extends Entity {
  name = 'Trigger';

  constructor(context, body, sprite, game, options = {}) {
    super(context, body, sprite, game);

    this.active = options.active || false;
    this.visible = options.visible || false;
    this.triggers = options.triggers || [];
    this.debugColor = options.debugColor || '#e7693166';
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (!this.active) return;

    if (other.entity?.name === 'Player') {
      if (this.category === 'levelComplete') {
        this.game.soundManager.playSound('levelComplete');
      }
      if (this.onEnter) {
        this.onEnter(other.entity, this.data);
      }
    }
  }

  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    
    if (!this.active) return;

    if (other.entity?.name === 'Player' && this.onExit) {
      this.onExit(other.entity, this.data);
    }
  }

  setAnimation() {
    // noop since it doesn't have a sprite.
  }

  draw(ctx) {
    if (!this.visible) return;

    if (this.sprite) {
      super.draw(ctx);
    }

    const bounds = this.body.bounds;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;

    ctx.save();
    ctx.fillStyle = this.debugColor;
    ctx.fillRect(
      this.body.position.x - width/2,
      this.body.position.y - height/2,
      width,
      height
    );

    ctx.fillStyle = '#ffffffaa';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.triggers,
      this.body.position.x,
      this.body.position.y + 3.5
    );
    ctx.restore();
  }

  setActive(active) {
    this.active = active;
  }

  setVisible(visible) {
    this.visible = visible;
  }

  onEnter(entity, data) {
    console.log('onEnter', entity, data);
    this.game.sceneManager.switchTo('mainMenu');
  }
}
