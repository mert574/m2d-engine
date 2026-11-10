import { Entity } from '../core/entity.js';
import { s } from '../core/schema.js';

export class Trigger extends Entity {
  static description = 'An invisible sensor that fires when something enters it';
  name = 'Trigger';

  static properties = {
    active: s.boolean({ initial: false, description: 'Inert until set' }),
    visible: s.boolean({ initial: false, description: 'Draw the sensor, to see where it is' }),
    triggers: s.string({ description: 'A tag for game code to read on entry; a level\'s rules watch the object itself (when: enter)' }),
    debugColor: s.string({ initial: '#e7693166', editor: 'color', label: 'Debug colour' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    this.active = options.active || false;
    this.visible = options.visible || false;
    this.triggers = options.triggers || [];
    this.debugColor = options.debugColor || '#e7693166';
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (!this.active) return;

    if (other.entity?.name === 'Player') {
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

  draw() {
    if (!this.visible) return;

    if (this.sprite) {
      super.draw();
    }

    const bounds = this.body.renderBounds;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    // A trigger's tinted area and its name are one annotation: both go to the
    // world overlay so the patch and the text on it stay equally sharp.
    const overlay = this.game.worldOverlay;

    overlay.drawRect({
      x: bounds.min.x,
      y: bounds.min.y,
      width,
      height,
      fillStyle: this.debugColor
    });

    overlay.drawText({
      text: `${this.triggers}`,
      x: this.body.renderPosition.x,
      y: this.body.renderPosition.y,
      offsetY: 3.5,
      fillStyle: '#ffffffaa',
      fontSize: '14px',
      fontFamily: 'system-ui',
      textAlign: 'center',
      textBaseline: 'alphabetic'
    });
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
