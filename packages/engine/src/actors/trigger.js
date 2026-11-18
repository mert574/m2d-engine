import { Entity } from '../core/entity.js';
import { s } from '../core/schema.js';

export class Trigger extends Entity {
  static description = 'An invisible sensor that fires when something enters it';
  /** Drawn as an orange box in the editor and under `r_showtools`; see core/toolVolumes.js. */
  static tool = { color: '#ff8a1c', label: 'trigger' };
  name = 'Trigger';

  static properties = {
    active: s.boolean({ initial: false, description: 'Inert until set' }),
    visible: s.boolean({ initial: false, description: 'Show it in play: its sprite, or with none its box, as the editor and r_showtools always do' }),
    triggers: s.string({ description: 'A tag for game code to read on entry; a level\'s rules watch the object itself (when: enter)' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    this.active = options.active || false;
    this.visible = options.visible || false;
    this.triggers = options.triggers || [];
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
   * A trigger whose only look is its box shows it in play once `visible`:
   * one with a sprite draws that instead, and a game's trigger with art of
   * its own (a gate) draws itself.
   */
  get toolInPlay() {
    return this.visible && !this.sprite?.width && this.draw === Trigger.prototype.draw;
  }

  draw() {
    if (this.visible && this.sprite?.width) super.draw();
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
