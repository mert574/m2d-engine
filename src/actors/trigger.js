import { Entity } from '../core/entity.js';

export class Trigger extends Entity {
  name = 'Trigger';

  constructor(context, body, sprite, game, options = {}) {
    super(context, body, sprite, game);
    body.isSensor = true;
    body.isStatic = true;

    this.category = options.category || 'trigger';
    this.visible = options.visible || false;
    this.data = options.data || {};
    this.onEnter = options.onEnter || null;
    this.onExit = options.onExit || null;
    this.active = true;

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

  draw(deltaTime) {
    if (!this.visible) return;

    const bounds = this.body.bounds;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;

    this.context.save();
    this.context.fillStyle = this.debugColor;
    this.context.fillRect(
      this.body.position.x - width/2,
      this.body.position.y - height/2,
      width,
      height
    );

    this.context.fillStyle = '#ffffffaa';
    this.context.font = '14px system-ui';
    this.context.textAlign = 'center';
    this.context.fillText(
      this.category,
      this.body.position.x,
      this.body.position.y + 3.5
    );
    this.context.restore();
  }

  setActive(active) {
    this.active = active;
  }

  setVisible(visible) {
    this.visible = visible;
  }
}
