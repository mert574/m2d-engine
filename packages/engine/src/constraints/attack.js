import { Constraint } from '../core/constraint.js';
import { CollisionCategories } from '../core/constants.js';
import { Angle } from '../core/math.js';

/**
 * Knockback, in px·mass/s. Carried over from the mass-independent velocity
 * change this replaced (8140, -4880 px/s) scaled by the mass of the 32x32
 * enemies the games ship with (~1.024), so the fling looks the same as
 * before — but a heavier enemy now shrugs it off, which is the point of
 * using a real impulse.
 */
const KNOCKBACK_IMPULSE = { x: 8335, y: -4997 };

/**
 * A melee attack: once per cooldown, everything hostile within `range` and
 * inside the swing's arc takes damage and is knocked back.
 *
 * `startAttack` takes either a side (`1` right, `-1` left), the
 * side-scroller's contract, or an angle in radians, which is what a
 * top-down or 3/4 game needs — a swing that only knows left and right
 * cannot reach anything above or below. The arc is centred on that
 * direction and is `arc` radians wide: π (the default) is the half circle
 * the side view always used, 2π hits everything in range.
 *
 * @param {Object} options
 * @param {number} [options.damage=10]
 * @param {number} [options.range=40] - Reach from the entity's centre, px
 * @param {number} [options.cooldown=30] - Between swings, in 60 Hz frames
 * @param {number} [options.arc=Math.PI] - Width of the swing, radians
 * @param {number} [options.knockback] - Impulse along the swing; defaults
 *   to the side view's fling. 0 disables it
 * @param {Array} [options.combo] - Chain steps. Each is `{ damage,
 *   knockback, arc }`, overriding the base values for that step. A swing
 *   started within `comboWindow` seconds of the last one landing advances
 *   to the next step; otherwise the chain restarts. The cooldown gates
 *   every swing; the window is what makes mashing into a rhythm
 * @param {number} [options.comboWindow=0.8] - Seconds after a swing ends
 *   in which the next one chains
 * @param {number} [options.targetCategory] - Collision category the swing
 *   hits; defaults to enemies. An enemy swinging at the player passes
 *   `CollisionCategories.player`
 * @param {Function} [options.onStart] - Called on every swing with the step index
 * @param {Function} [options.onHit] - `(entity, step)` for every target a
 *   swing lands on, after damage and knockback; a launcher pops the
 *   target's `elevation` here
 */
export class Attack extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.damage = options.damage || 10;
    this.range = options.range || 40;
    this.cooldown = (options.cooldown || 30) / 60; // convert frames to seconds (assuming 60fps baseline)
    this.arc = options.arc ?? Math.PI;
    this.knockback = options.knockback;
    this.combo = options.combo ?? null;
    this.targetCategory = options.targetCategory ?? CollisionCategories.enemy;
    this.comboWindow = options.comboWindow ?? 0.8;
    this.onStart = options.onStart;
    this.onHit = options.onHit;
    /** Which combo step the current swing is; -1 between chains. */
    this.step = -1;
    /** Seconds since the last swing ended, for the chain window. */
    this.sinceSwing = Infinity;

    this.isAttacking = false;
    this.currentCooldown = 0;
    this.direction = 1; // 1 for right, -1 for left
    /** The swing's centre, radians, y down. 0 is right. */
    this.angle = 0;
    this.hits = new Set();
    this.attackDuration = 0.167; // ~10 frames at 60fps in seconds
    this.attackTime = 0;
    this.attackAnimEndTime = 0.333; // ~20 frames at 60fps in seconds
    this.hasCheckedHits = false;
  }

  fixedUpdate(dt) {
    if (this.currentCooldown > 0) {
      this.currentCooldown -= dt;
    }
    if (!this.isAttacking) this.sinceSwing += dt;

    if (this.isAttacking) {
      // Check for hits only on the first tick of the attack
      if (!this.hasCheckedHits) {
        this.checkHits();
        this.hasCheckedHits = true;
      }
      this.attackTime += dt;
      if (this.attackTime >= this.attackDuration) {
        this.isAttacking = false;
        this.attackTime = 0;
        this.hasCheckedHits = false;
      }
      if (this.attackTime >= this.attackAnimEndTime && this.entity.currentAnim?.includes('attack')) {
        this.entity.setAnimation('idle');
      }
    }
  }

  checkHits() {
    // A one-shot shape query: the reach is a question, not an object. It
    // used to be a sensor body parked in the world and teleported onto the
    // attacker every frame, which also meant every enemy in range collected
    // collision callbacks from an invisible circle.
    const position = this.entity.position;
    const hits = this.entity.game.physics.overlaps(
      { x: position.x, y: position.y, radius: this.range },
      (body) => body.collisionFilter.category === this.targetCategory
    );

    for (const body of hits) {
      if (!body.entity || body.entity === this.entity || this.hits.has(body.entity)) continue;

      // Inside the swing? Measured from the edge of the attacker on the
      // swing's side, so something pressed against it still counts.
      const attackPoint = {
        x: position.x + Math.cos(this.angle) * this.entity.size.x / 2,
        y: position.y + Math.sin(this.angle) * this.entity.size.x / 2
      };
      const angle = Angle.between(attackPoint, body.position);

      const step = this.combo ? this.combo[this.step] : null;
      const arc = step?.arc ?? this.arc;
      const damage = step?.damage ?? this.damage;
      const knockback = step?.knockback ?? this.knockback;
      if (Angle.inArc(angle, this.angle, arc)) {
        this.hits.add(body.entity);
        const health = body.entity.getConstraint('health');
        if (health && !health.isInvulnerable()) {
          health.takeDamage(damage);
          if (knockback === undefined) {
            // The side view's fling: along the swing and upward.
            body.applyImpulse({
              x: Math.cos(this.angle) * KNOCKBACK_IMPULSE.x,
              y: this.sideways ? KNOCKBACK_IMPULSE.y : Math.sin(this.angle) * KNOCKBACK_IMPULSE.x
            });
          } else if (knockback > 0) {
            body.applyImpulse({
              x: Math.cos(this.angle) * knockback,
              y: Math.sin(this.angle) * knockback
            });
          }
          this.onHit?.(body.entity, Math.max(0, this.step));
        }

      }
    }
  }

  /**
   * Swing.
   * @param {number} direction - `1` or `-1` for a side-view swing to the
   *   right or left, or any other number as an angle in radians
   */
  startAttack(direction) {
    if (this.currentCooldown > 0) return;

    // Advance the chain when this swing follows the last closely enough.
    if (this.combo) {
      this.step = this.sinceSwing <= this.comboWindow ? (this.step + 1) % this.combo.length : 0;
    }
    this.sinceSwing = 0;
    this.isAttacking = true;
    // ±1 exactly is the side-view contract; anything else is an angle.
    this.sideways = direction === 1 || direction === -1;
    this.angle = this.sideways ? (direction > 0 ? 0 : Math.PI) : direction;
    this.direction = Math.cos(this.angle) >= 0 ? 1 : -1;
    this.hits.clear();
    this.currentCooldown = this.cooldown;
    this.attackTime = 0;
    this.entity.setAnimation(this.direction > 0 ? 'attackRight' : 'attackLeft');
    
    if (this.onStart) {
      this.onStart(Math.max(0, this.step));
    }
  }

  /**
   * The attack has no look of its own: what a swing is depends on the game
   * and its perspective. Games draw one with a constraint of their own that
   * hooks `onStart` (the demos' `AttackSwing` in examples/src/shared/effects.js).
   * The range ring is a diagnostic and only shows in debug mode.
   */
  draw() {
    if (!this.entity.game.renderer.isDebugEnabled()) return;
    const pos = this.entity.renderPosition;
    // World coordinates, rasterized at display resolution on the overlay.
    this.entity.game.worldOverlay.drawArc({
      x: pos.x,
      y: pos.y,
      radius: this.range,
      startAngle: 0,
      endAngle: Math.PI * 2,
      strokeStyle: 'rgba(0, 150, 255, 0.3)',
      fill: false
    });
  }
}
