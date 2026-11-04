import { Constraint } from '../core/constraint.js';

/**
 * Default bindings, as physical key codes. Codes rather than characters
 * because they name the key's *position*, so WASD stays a diamond under the
 * left hand on AZERTY and Dvorak. See core/input/keyboard.js.
 */
const DEFAULT_KEYS = Object.freeze({
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: 'Space',
  attack: 'KeyX'
});

/** Component scale that keeps a diagonal the same speed as a cardinal. */
const DIAGONAL = 1 / Math.SQRT2;

/** Stand-in frame of reference for an entity that is not on anything. */
const ZERO_VELOCITY = { x: 0, y: 0 };

/**
 * How squarely a contact normal must oppose an input axis for that axis to
 * count as blocked. Flat walls give ~1.0; a corner a circle is rounding
 * gives up to ~0.7, and that input has to survive — it is what slides the
 * body around the corner.
 */
const BLOCKED_DOT = 0.85;

export class KeyboardControl extends Constraint {
  constructor(entity, options = {}) {
    super(entity);

    this.keys = { ...DEFAULT_KEYS, ...options.keys };

    // Movement configuration
    this.acceleration = options.acceleration || options.moveForce * 60000 || 600; // px/s per second
    // Braking when no key is held, applied only on the ground. Character
    // bodies have no solver friction (their controller does the moving), so
    // the control has to stop them itself; in the air velocity persists,
    // like it always has.
    this.deceleration = options.deceleration ?? this.acceleration;
    this.maxSpeed = options.maxSpeed || 300; // px/s
    this.continuous = options.continuous ?? true;
    this.verticalMovement = options.verticalMovement ?? true;
    /**
     * `'world'`: the keys move along the ground's axes. `'screen'`: along
     * the screen's, through the scene's projection, so Up walks toward the
     * top of an isometric view rather than along a diagonal.
     */
    this.inputSpace = options.inputSpace ?? 'world';

    this.onMove = options.onMove?.bind(entity);
    this.onDirectionChange = options.onDirectionChange?.bind(entity);
    this.onJump = options.onJump?.bind(entity);
    this.onAttack = options.onAttack?.bind(entity);
  }

  fixedUpdate(dt) {
    if (this.entity.dead) return;

    // The snapshot taken for this tick, not the live keyboard: every tick
    // in a frame sees the same held keys, and a press edge reaches exactly
    // one tick. See InputManager.sample.
    const input = this.entity.game.input.snapshot;
    let dx = input.axis(this.keys.left, this.keys.right);
    let dy = this.verticalMovement ? input.axis(this.keys.up, this.keys.down) : 0;

    // Under a projection with screen-space input, walk at a steady pace on
    // screen: the ground direction is scaled so its projected speed is the
    // same whichever way the keys point.
    const projection = this.entity.game.projection;
    let paceScale = 1;
    if (this.inputSpace === 'screen' && projection && (dx !== 0 || dy !== 0)) {
      const ground = projection.directionToWorld(dx, dy);
      paceScale = projection.groundSpeedScale(ground.x, ground.y);
      dx = ground.x;
      dy = ground.y;
    }

    // On a diagonal, drop any component that presses straight into a wall
    // before normalizing: that force is spent on the wall anyway, and
    // letting it into the normalization taxes the free axis by √2 — hugging
    // a wall while moving along it would slow the slide for no reason.
    if (dx !== 0 && dy !== 0) {
      const surfaces = this.entity.game.physics.surfacesWith(
        this.entity.body, (other) => !other.isSensor);
      const blocked = (nx, ny) =>
        surfaces.some(({ normal }) => normal.x * nx + normal.y * ny > BLOCKED_DOT);
      if (blocked(Math.sign(dx), 0)) dx = 0;
      if (blocked(0, Math.sign(dy))) dy = 0;
    }

    // Normalize diagonal movement to prevent faster diagonal speed (a
    // screen-space direction is already a unit vector).
    if (dx !== 0 && dy !== 0 && paceScale === 1 && Math.hypot(dx, dy) > 1 + 1e-6) {
      dx *= DIAGONAL;
      dy *= DIAGONAL;
    }
    const limit = this.maxSpeed * paceScale;

    // Speeds are relative to whatever the entity is standing on. On solid
    // ground that is zero and nothing changes; on a moving platform it is
    // what lets `maxSpeed` mean "how fast I can walk" instead of "how fast
    // I may travel" — the latter clamps a rider to below the platform's own
    // speed and drags it off the back.
    const ground = this.entity.groundBody;
    const frame = ground ? ground.velocity : ZERO_VELOCITY;
    const relative = () => {
      const velocity = this.entity.body.velocity;
      return { x: velocity.x - frame.x, y: velocity.y - frame.y };
    };

    if (dx !== 0 || dy !== 0) {
      if (this.continuous) {
        const currentVel = relative();
        const accel = this.acceleration * dt;
        this.entity.body.setVelocity({
          x: frame.x + currentVel.x + dx * accel,
          y: frame.y + currentVel.y + dy * accel
        });
      } else {
        this.entity.body.setVelocity({
          x: frame.x + dx * limit,
          y: frame.y + dy * limit
        });
      }
    } else if (this.continuous && this.entity.body.bodyType === 'character' && ground) {
      // No input, feet on the ground: brake to a stop *relative to the
      // ground* — but only for character bodies, which have no solver
      // friction of their own. A dynamic player still stops through ground
      // friction, and braking it here would fight the friction carrying it.
      const velocity = relative();
      const brake = this.deceleration * dt;
      const slow = (v) => (Math.abs(v) <= brake ? 0 : v - Math.sign(v) * brake);
      if (this.verticalMovement) {
        if (velocity.x !== 0 || velocity.y !== 0) {
          this.entity.body.setVelocity({ x: frame.x + slow(velocity.x), y: frame.y + slow(velocity.y) });
        }
      } else if (velocity.x !== 0) {
        this.entity.body.setVelocity({ x: frame.x + slow(velocity.x), y: frame.y + velocity.y });
      }
    }
    if (this.onDirectionChange && dx !== 0) {
      this.onDirectionChange(dx > 0 ? 1 : -1);
    }
    if (this.onMove) {
      this.onMove(dx, dy)
    }
    if (input.isDown(this.keys.jump)) {
      this.onJump?.();
    }
    if (input.isDown(this.keys.attack)) {
      this.onAttack?.();
    }

    if (this.continuous) {
      const velocity = relative();
      if (this.verticalMovement) {
        // Top-down: the cap is on the whole vector, so a diagonal is no
        // faster than a cardinal.
        const speed = Math.hypot(velocity.x, velocity.y);
        if (speed > limit) {
          const k = limit / speed;
          this.entity.body.setVelocity({ x: frame.x + velocity.x * k, y: frame.y + velocity.y * k });
        }
      } else {
        // Side view: only the run is capped; gravity owns the vertical.
        const speed = Math.abs(velocity.x);
        if (speed > limit) {
          this.entity.body.setVelocity({
            x: frame.x + Math.sign(velocity.x) * limit,
            y: frame.y + velocity.y
          });
        }
      }
    }
  }
} 