import { TopDownPlayer } from './topDownPlayer.js';
import { Angle } from '../core/math.js';

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
 * @param {Object} options
 * @param {number} [options.jumpSpeed=430] - Launch speed, px/s of elevation.
 * @param {number} [options.gravity=1500] - Pull back down, px/s².
 * @param {number} [options.attackArc=Math.PI*1.5] - Swing width, radians.
 * @param {number} [options.attackRange=60]
 * @param {number} [options.spriteOffsetY=0] - Shift the sprite down, for a
 *   sheet whose figure's feet sit above the frame's bottom edge
 * @param {number} [options.spriteSize] - Drawn frame size when the object's
 *   size is the ground body rather than the frame (an isometric game)
 */
export class ObliquePlayer extends TopDownPlayer {
  static replicated = ['heading', 'lift'];

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);

    this.jumpSpeed = options.jumpSpeed ?? 430;
    this.gravity = options.gravity ?? 1500;
    this.lift = 0;
    this.heading = Math.PI / 2;
    // A character sheet's frame is the drawn size; see Entity.spriteFit.
    this.spriteFit = true;
    this.renderOffset.y = options.spriteOffsetY ?? 0;
    if (options.spriteSize) this.spriteSize = { x: options.spriteSize, y: options.spriteSize };

    const attack = this.getConstraint('attack');
    attack.arc = options.attackArc ?? Math.PI * 1.5;
    attack.range = options.attackRange ?? 60;
    attack.knockback = options.attackKnockback ?? 6000;

    const control = this.getConstraint('control');
    const onJump = control.onJump;
    control.onJump = () => {
      onJump?.();
      this.jump();
    };
    // The swing follows the heading, not the left/right facing.
    control.onAttack = () => attack.startAttack(this.heading);
    control.onMove = (dx, dy) => {
      if (dx !== 0 || dy !== 0) this.heading = Math.atan2(dy, dx);
    };
  }

  get isAirborne() {
    return this.elevation > 0 || this.lift > 0;
  }

  jump() {
    if (this.isAirborne) return;
    this.lift = this.jumpSpeed;
    this.onJump?.();
  }

  fixedUpdate(dt) {
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
  update(deltaTime) {
    super.update(deltaTime);
    if (!this.sprite) return;
    const attack = this.getConstraint('attack');
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
  get facing8() {
    return Angle.direction8(this.heading);
  }
}
