import { Entity, Angle, type M2D } from 'm2d-engine';
import { ProximityPrompt } from 'm2d-engine/constraints';
import { s } from 'm2d-engine/schema';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


/**
 * Someone to talk to. Stands still on a static body, turns to face the
 * player when they are near, shows a prompt, and can carry a marker over
 * its head when it has something new to say. What it says is the game's
 * business: a scene reads `prompt.isNear` on an interact key and opens its
 * dialogue.
 *
 * Draws the sheet's `idle` animation, or its `idle_<direction>` variant
 * when the sheet has eight facings (see `Entity.setDirectionalAnimation`).
 *
 */

export interface NpcOptions {
  /** An id for the game to look the character up by. */
  who?: string;
  /** Shown in the prompt. */
  displayName?: string;
  /** Resting facing, radians. Default: down. */
  facing?: number;
  talkRadius?: number;
  /**
   * Shift the drawn sprite down, for a sheet whose figure's feet sit
   * above the frame's bottom edge.
   */
  spriteOffsetY?: number;
  /**
   * Drawn frame size when the object's size is the ground body rather
   * than the frame.
   */
  spriteSize?: number;
}
export class Npc extends Entity {
  static override description = 'Someone to talk to: stands still, faces the player, opens a dialogue';
  override name = 'Npc';

  static override properties = {
    who: s.string({ description: 'An id for the game to look the character up by' }),
    displayName: s.string({ label: 'Display name', description: 'Shown in the prompt; defaults to who' }),
    facing: s.number({ initial: Math.PI / 2, unit: 'rad', description: 'Resting facing' }),
    talkRadius: s.number({ initial: 110, positive: true, unit: 'px', label: 'Talk radius' }),
    spriteOffsetY: s.number({ initial: 0, unit: 'px', label: 'Sprite offset Y', description: "Shift the sprite down, for a sheet whose figure's feet sit above the frame" }),
    spriteSize: s.number({ positive: true, unit: 'px', label: 'Sprite size', description: 'Drawn frame size when the object size is the ground body' })
  };

  /** The character this stands for, or null when the object names none. */
  who: string | null;
  displayName: string;
  /** Where it looks when nobody is near, radians. */
  restingFacing: number;
  /** Where it is looking now, radians. */
  facing: number;
  /** Whether there is something new to say; draws the marker. */
  hasNews: boolean;
  markerColor: string;
  /** Seconds since it was built, for the marker's bob. */
  time: number;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: NpcOptions = {}) {
    super(body, sprite, game);
    this.who = options.who ?? null;
    this.displayName = options.displayName ?? options.who ?? 'Stranger';
    this.restingFacing = options.facing ?? Math.PI / 2;
    this.facing = this.restingFacing;
    this.hasNews = false;
    this.markerColor = '#ffd27a';
    this.renderOffset.y = options.spriteOffsetY ?? 0;
    if (options.spriteSize) this.spriteSize = { x: options.spriteSize, y: options.spriteSize };
    this.spriteFit = true;
    this.time = 0;
    this.addConstraint('prompt', new ProximityPrompt(this, {
      radius: options.talkRadius ?? 110,
      text: () => `E · Talk to ${this.displayName}`
    }));
    this.setDirectionalAnimation('idle', this.facing);
  }

  get playerNear(): boolean {
    return (this.getConstraint('prompt')!).isNear;
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    this.time += deltaTime;
    const player = this.game.player;
    if (player && this.playerNear) {
      this.facing = Angle.between(this.position, player.position);
    } else {
      this.facing = this.restingFacing;
    }
    this.setDirectionalAnimation('idle', this.facing);
  }

  override draw(deltaTime: number): void {
    if (this.dead || !this.visible) return;
    super.draw(deltaTime);
    if (this.hasNews) {
      const pos = this.renderPosition;
      const bob = Math.sin(this.time * 3) * 3;
      this.game.worldOverlay.drawText({
        // Above the figure's head, and above the talk prompt when both
        // show at once: the prompt sits at `overhead` less its own offset.
        x: pos.x, y: this.overhead - 34 + bob, text: '!',
        fillStyle: this.markerColor, fontSize: 22, fontWeight: '700',
        textAlign: 'center', textBaseline: 'bottom'
      });
    }
  }
}
