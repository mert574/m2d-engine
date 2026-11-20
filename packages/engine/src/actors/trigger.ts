import { Entity } from '../core/entity.ts';
import type { M2D } from '../core/m2d.js';
import type { PhysicsBody } from '../core/physics/index.ts';
import type { SpriteSheet } from '../core/spriteSheet.ts';
import { s } from '../core/schema.ts';

export class Trigger extends Entity {
  static override description = 'An invisible sensor that fires when something enters it';
  /** Drawn as an orange box in the editor and under `r_showtools`; see core/toolVolumes.js. */
  static override tool = { color: '#ff8a1c', label: 'trigger' };
  override name = 'Trigger';
  active: boolean;
  triggers: string | string[];
  /** Game code's hooks: called when a player's avatar enters or leaves. */
  onEnter?: (entity: Entity, data: unknown) => void;
  onExit?: (entity: Entity, data: unknown) => void;
  /** Handed to `onEnter`/`onExit`, the game's to set. */
  data?: unknown;

  static override properties = {
    active: s.boolean({ initial: false, description: 'Inert until set' }),
    visible: s.boolean({ initial: false, description: 'Show it in play: its sprite, or with none its box, as the editor and r_showtools always do' }),
    triggers: s.string({ description: 'A tag for game code to read on entry; a level\'s rules watch the object itself (when: enter)' })
  };

  constructor(body: PhysicsBody, sprite: SpriteSheet | null, game: M2D, options: { active?: boolean; visible?: boolean; triggers?: string | string[] } = {}) {
    super(body, sprite, game);

    this.active = options.active || false;
    this.visible = options.visible || false;
    this.triggers = options.triggers || [];
  }

  // A player's avatar entering or leaving: the players registry's test, so
  // the same trigger fires for every knight on a server.
  override onCollisionStart(other: PhysicsBody): void {
    super.onCollisionStart(other);
    if (!this.active) return;
    if (this.onEnter && other.entity && this.game.players!.isAvatar(other.entity)) this.onEnter(other.entity, this.data);
  }

  override onCollisionEnd(other: PhysicsBody): void {
    super.onCollisionEnd(other);
    if (!this.active) return;
    if (this.onExit && other.entity && this.game.players!.isAvatar(other.entity)) this.onExit(other.entity, this.data);
  }

  override setAnimation(): void {
    // noop since it doesn't have a sprite.
  }

  /**
   * A trigger whose only look is its box shows it in play once `visible`:
   * one with a sprite draws that instead, and a game's trigger with art of
   * its own (a gate) draws itself.
   */
  override get toolInPlay(): boolean {
    return this.visible && !this.sprite?.width && this.draw === Trigger.prototype.draw;
  }

  override draw(deltaTime?: number): void {
    if (this.visible && this.sprite?.width) super.draw(deltaTime!);
  }

  /** Its kind, and the tag game code reads, when it has one. */
  override get toolLabel(): string {
    const tag = Array.isArray(this.triggers) ? this.triggers.join(', ') : String(this.triggers ?? '');
    return tag ? `trigger ${tag}` : 'trigger';
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}
