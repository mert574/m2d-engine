import { TopDownPlayer } from './topDownPlayer.ts';
import { Angle } from 'm2d-engine/core/math.js';
import { s } from 'm2d-engine/core/schema.js';
import type { Attack } from 'm2d-engine/constraints/attack.js';
import type { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


/**
 * The top-down player for a 3/4 view, with a heading, a jump and a swing
 * that reaches in any direction.
 *
 * Everything the `TopDownPlayer` does — eight-way movement, health — plus:
 *
 * - `heading`: the direction last moved in, radians, kept in the
 *   simulation so the attack and a blink can use it. The swing is centred
 *   on it with a wide arc (`attackArc`, default three quarters of a turn),
 *   because a swing that only knows left and right cannot hit anything
 *   above or below in this view.
 * - A third axis the physics never sees: Space launches `elevation`
 *   upward and a constant gravity brings it back. The collider stays on
 *   the ground, so a hop over a flower bed does not take you over a wall.
 * - Directional animations: with a sheet that defines `idle_<dir>`,
 *   `run_<dir>` and `swing_<dir>` for the eight compass names, the player
 *   picks the facing variant each frame (see `Entity.setDirectionalAnimation`);
 *   a sheet with plain `idle` and `run` still works.
 *
 * Expects a prefab with a `footprint`, so the body is the feet and the
 * sprite stands above it.
 *
 */

export interface ObliquePlayerOptions {
  /** Launch speed, px/s of elevation. */
  jumpSpeed?: number;
  /** Pull back down, px/s². */
  gravity?: number;
  /** Swing width, radians. */
  attackArc?: number;
  attackRange?: number;
  attackKnockback?: number;
  /**
   * Shift the sprite down, for a sheet whose figure's feet sit above the
   * frame's bottom edge.
   */
  spriteOffsetY?: number;
  /**
   * Drawn frame size when the object's size is the ground body rather
   * than the frame (an isometric game).
   */
  spriteSize?: number;
}
export class ObliquePlayer extends TopDownPlayer {
  static override description = 'The 3/4-view player with a heading, a jump and a swing';
  static override properties = {
    jumpSpeed: s.number({ initial: 430, positive: true, unit: 'px/s', label: 'Jump speed', description: 'Launch speed of elevation' }),
    gravity: s.number({ initial: 1500, positive: true, unit: 'px/s²', description: 'Pull back down' }),
    attackArc: s.number({ initial: Math.PI * 1.5, positive: true, unit: 'rad', label: 'Attack arc', description: 'Swing width' }),
    attackRange: s.number({ initial: 60, positive: true, unit: 'px', label: 'Attack range' }),
    attackKnockback: s.number({ initial: 6000, min: 0, label: 'Attack knockback' }),
    spriteOffsetY: s.number({ initial: 0, unit: 'px', label: 'Sprite offset Y', description: "Shift the sprite down, for a sheet whose figure's feet sit above the frame" }),
    spriteSize: s.number({ positive: true, unit: 'px', label: 'Sprite size', description: 'Drawn frame size when the object size is the ground body' })
  };

  static override replicated = ['heading', 'lift'];
  /** The heading follows the keys, so a client that moves early turns early. */
  static override predictedFields = ['heading'];

  jumpSpeed: number;
  gravity: number;
  /** Upward speed of the hop, px/s; 0 on the ground. Replicated. */
  lift: number;
  /** The direction last moved in, radians. Replicated. */
  heading: number;
  /** A game's hook for the hop's sound or dust. */
  onJump: (() => void) | undefined;
  /** A game's hook for the landing. */
  onLand: (() => void) | undefined;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: ObliquePlayerOptions = {}) {
    super(body, sprite, game);

    this.jumpSpeed = options.jumpSpeed ?? 430;
    this.gravity = options.gravity ?? 1500;
    this.lift = 0;
    this.heading = Math.PI / 2;
    // A character sheet's frame is the drawn size; see Entity.spriteFit.
    this.spriteFit = true;
    this.renderOffset.y = options.spriteOffsetY ?? 0;
    if (options.spriteSize) this.spriteSize = { x: options.spriteSize, y: options.spriteSize };

    const attack = this.getConstraint('attack') as Attack;
    attack.arc = options.attackArc ?? Math.PI * 1.5;
    attack.range = options.attackRange ?? 60;
    attack.knockback = options.attackKnockback ?? 6000;

    const control = this.getConstraint('control') as KeyboardControl;
    const onJump = control.onJump;
    control.onJump = () => {
      onJump?.();
      this.jump();
    };
    // The swing follows the heading, not the left/right facing.
    control.onAttack = () => attack.startAttack(this.heading);
    control.onMove = (dx: number, dy: number) => {
      if (dx !== 0 || dy !== 0) this.heading = Math.atan2(dy, dx);
    };
  }

  get isAirborne(): boolean {
    return this.elevation > 0 || this.lift > 0;
  }

  jump(): void {
    if (this.isAirborne) return;
    this.lift = this.jumpSpeed;
    this.onJump?.();
  }

  override fixedUpdate(dt: number): void {
    super.fixedUpdate(dt);
    if (this.dead) return;

    if (this.isAirborne) {
      this.lift -= this.gravity * dt;
      this.elevation = Math.max(0, this.elevation + this.lift * dt);
      if (this.elevation === 0 && this.lift < 0) {
        this.lift = 0;
        this.onLand?.();
      }
    }
  }

  /** Presentation: pick the animation for the state and facing. */
  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (!this.sprite) return;
    const attack = this.getConstraint('attack') as Attack | undefined;
    const velocity = this.velocity;
    const moving = Math.hypot(velocity.x, velocity.y) > 20;
    if (attack?.isAttacking || (attack && attack.attackTime > 0 && attack.attackTime < attack.attackAnimEndTime && this.currentAnim?.startsWith('swing'))) {
      this.setDirectionalAnimation('swing', this.heading);
    } else if (moving || this.isAirborne) {
      this.setDirectionalAnimation('run', this.heading);
    } else {
      this.setDirectionalAnimation('idle', this.heading);
    }
  }

  /** The eight-way facing name for the heading. */
  get facing8(): string | undefined {
    return Angle.direction8(this.heading);
  }
}
