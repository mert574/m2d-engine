import { Constraint } from '../core/constraint.js';
import { KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_SPACE, KEY_X } from '../core/keyCodes.js';

const norm = Math.sqrt(2);

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

    this.keys = {
      left: KEY_LEFT,
      right: KEY_RIGHT,
      up: KEY_UP,
      down: KEY_DOWN,
      jump: KEY_SPACE,
      attack: KEY_X,
      ...options.keys
    };

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

    Object.values(this.keys).forEach(key => {
      this.entity.game.keys.addKey(key);
    });

    this.onMove = options.onMove?.bind(entity);
    this.onDirectionChange = options.onDirectionChange?.bind(entity);
    this.onJump = options.onJump?.bind(entity);
    this.onAttack = options.onAttack?.bind(entity);
  }

  update(deltaTime) {
    if (this.entity.dead) return;

    const pressedKeys = this.entity.game.keys.pressedKeys();
    let dx = 0;
    let dy = 0;

    if (pressedKeys.has(this.keys.left)) dx -= 1;
    if (pressedKeys.has(this.keys.right)) dx += 1;
    if (this.verticalMovement) {
      if (pressedKeys.has(this.keys.up)) dy -= 1;
      if (pressedKeys.has(this.keys.down)) dy += 1;
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

    // Normalize diagonal movement to prevent faster diagonal speed
    if (dx !== 0 && dy !== 0) {
      dx /= norm;
      dy /= norm;
    }

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
        // Apply velocity change directly scaled by deltaTime for frame-rate independence
        const currentVel = relative();
        const accel = this.acceleration * deltaTime;
        this.entity.body.setVelocity({
          x: frame.x + currentVel.x + dx * accel,
          y: frame.y + currentVel.y + dy * accel
        });
      } else {
        this.entity.body.setVelocity({
          x: frame.x + dx * this.maxSpeed,
          y: frame.y + dy * this.maxSpeed
        });
      }
    } else if (this.continuous && this.entity.body.bodyType === 'character' && ground) {
      // No input, feet on the ground: brake to a stop *relative to the
      // ground* — but only for character bodies, which have no solver
      // friction of their own. A dynamic player still stops through ground
      // friction, and braking it here would fight the friction carrying it.
      const velocity = relative();
      if (velocity.x !== 0) {
        const brake = this.deceleration * deltaTime;
        const x = Math.abs(velocity.x) <= brake
          ? 0
          : velocity.x - Math.sign(velocity.x) * brake;
        this.entity.body.setVelocity({ x: frame.x + x, y: frame.y + velocity.y });
      }
    }
    if (this.onDirectionChange && dx !== 0) {
      this.onDirectionChange(dx > 0 ? 1 : -1);
    }
    if (this.onMove) {
      this.onMove(dx, dy)
    }
    if (pressedKeys.has(this.keys.jump)) {
      this.onJump?.();
    }
    if (pressedKeys.has(this.keys.attack)) {
      this.onAttack?.();
    }

    if (this.continuous) {
      const velocity = relative();
      const speed = Math.abs(velocity.x);
      if (speed > this.maxSpeed) {
        this.entity.body.setVelocity({
          x: frame.x + Math.sign(velocity.x) * this.maxSpeed,
          y: frame.y + velocity.y
        });
      }
    }
  }
} 