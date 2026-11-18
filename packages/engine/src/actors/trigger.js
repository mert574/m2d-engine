import { Entity } from '../core/entity.js';
import { s } from '../core/schema.js';
import { toolsShown, drawToolVolume2D } from '../core/toolVolumes.js';

export class Trigger extends Entity {
  static description = 'An invisible sensor that fires when something enters it';
  /** Drawn as an orange box in the editor and under `r_showtools`; see core/toolVolumes.js. */
  static tool = { color: '#ff8a1c', label: 'trigger' };
  name = 'Trigger';

  static properties = {
    active: s.boolean({ initial: false, description: 'Inert until set' }),
    visible: s.boolean({ initial: false, description: 'Show its box in play too, not only in the editor and under r_showtools' }),
    triggers: s.string({ description: 'A tag for game code to read on entry; a level\'s rules watch the object itself (when: enter)' }),
    debugColor: s.string({ editor: 'color', label: 'Box colour', description: 'Its box\'s colour; trigger orange unless set' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    this.active = options.active || false;
    this.visible = options.visible || false;
    this.triggers = options.triggers || [];
    this.toolColor = options.debugColor ?? null;
  }

  // A player's avatar entering or leaving: the players registry's test, so
  // the same trigger fires for every knight on a server.
  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (!this.active) return;
    if (this.onEnter && this.game.players.isAvatar(other.entity)) this.onEnter(other.entity, this.data);
  }

  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    if (!this.active) return;
    if (this.onExit && this.game.players.isAvatar(other.entity)) this.onExit(other.entity, this.data);
  }

  setAnimation() {
    // noop since it doesn't have a sprite.
  }

  /**
   * A trigger with a sprite draws it once `visible`. One without shows its
   * box in play once `visible`; the editor and `r_showtools` show every
   * trigger's box anyway, so it is not drawn twice.
   */
  draw() {
    if (!this.visible) return;
    if (this.sprite) {
      super.draw();
      return;
    }
    if (!toolsShown(this.game)) drawToolVolume2D(this);
  }

  /** Its kind, and the tag game code reads, when it has one. */
  get toolLabel() {
    const tag = Array.isArray(this.triggers) ? this.triggers.join(', ') : String(this.triggers ?? '');
    return tag ? `trigger ${tag}` : 'trigger';
  }

  setActive(active) {
    this.active = active;
  }

  setVisible(visible) {
    this.visible = visible;
  }
}
