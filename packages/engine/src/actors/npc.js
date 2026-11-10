import { Entity } from '../core/entity.js';
import { ProximityPrompt } from '../constraints/proximityPrompt.js';
import { Angle } from '../core/math.js';
import { s } from '../core/schema.js';

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
 * @param {Object} options - From the scene object's `properties`
 * @param {string} [options.who] - An id for the game to look the character up by
 * @param {string} [options.displayName] - Shown in the prompt
 * @param {number} [options.facing] - Resting facing, radians. Default: down
 * @param {number} [options.talkRadius=110]
 * @param {number} [options.spriteOffsetY=0] - Shift the drawn sprite down, for a
 *   sheet whose figure's feet sit above the frame's bottom edge
 * @param {number} [options.spriteSize] - Drawn frame size when the object's
 *   size is the ground body rather than the frame
 */
export class Npc extends Entity {
  name = 'Npc';

  static properties = {
    who: s.string({ description: 'An id for the game to look the character up by' }),
    displayName: s.string({ label: 'Display name', description: 'Shown in the prompt; defaults to who' }),
    facing: s.number({ initial: Math.PI / 2, unit: 'rad', description: 'Resting facing' }),
    talkRadius: s.number({ initial: 110, positive: true, unit: 'px', label: 'Talk radius' }),
    spriteOffsetY: s.number({ initial: 0, unit: 'px', label: 'Sprite offset Y', description: "Shift the sprite down, for a sheet whose figure's feet sit above the frame" }),
    spriteSize: s.number({ positive: true, unit: 'px', label: 'Sprite size', description: 'Drawn frame size when the object size is the ground body' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.who = options.who ?? null;
    this.displayName = options.displayName ?? options.who ?? 'Stranger';
    this.restingFacing = options.facing ?? Math.PI / 2;
    this.facing = this.restingFacing;
    /** Whether there is something new to say; draws the marker. */
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

  get playerNear() {
    return this.getConstraint('prompt').isNear;
  }

  update(deltaTime) {
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

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    super.draw(deltaTime);
    if (this.hasNews) {
      const pos = this.renderPosition;
      const bob = Math.sin(this.time * 3) * 3;
      this.game.worldOverlay.drawText({
        x: pos.x, y: pos.y - this.size.y / 2 - 26 + bob, text: '!',
        fillStyle: this.markerColor, fontSize: 22, fontWeight: '700',
        textAlign: 'center', textBaseline: 'bottom'
      });
    }
  }
}
