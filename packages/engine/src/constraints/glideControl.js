import { Constraint } from '../core/constraint.js';

/**
 * Default bindings, as physical key codes (see core/input/keyboard.js).
 */
const DEFAULT_KEYS = Object.freeze({
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown'
});

/**
 * One-press gliding on a corridor grid: tap a direction and the body keeps
 * going until a wall, a new direction, or (optionally) the same key again.
 * The movement of Pac-Man and every cosy maze since.
 *
 * What makes it feel right is the forgiveness. A turn pressed early is
 * buffered and taken at the next opening; a turn pressed a beat late snaps
 * back to the junction just passed and takes it anyway. Both are judged by
 * asking the physics world whether the neighbouring cell is clear, so the
 * constraint needs no map — only the `grid` the corridors are built on.
 *
 * Simulation-honest: reads the tick's input snapshot and the physics
 * world, moves the body with velocity, and never looks at a clock or the
 * camera.
 *
 * Options:
 * - `speed` (240): glide speed, px/s.
 * - `grid` (32): corridor cell size, px. Cell centres are at
 *   `(n + 0.5) * grid`.
 * - `buffer` (0.35): how long a queued turn waits for its opening, seconds.
 * - `snap` (0.6): how far from a junction, in cells, a late turn may still
 *   take it.
 * - `stopOnRepeat` (true): pressing the direction of travel stops the body.
 * - `keys`: bindings, as physical codes.
 */
export class GlideControl extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.keys = { ...DEFAULT_KEYS, ...options.keys };
    this.speed = options.speed ?? 240;
    this.grid = options.grid ?? 32;
    this.buffer = options.buffer ?? 0.35;
    this.snap = options.snap ?? 0.6;
    this.stopOnRepeat = options.stopOnRepeat ?? true;

    /** Direction of travel, or null at rest. @type {{x,y}|null} */
    this.dir = null;
    /** The buffered press, waiting for its opening. @type {{x,y}|null} */
    this.queued = null;
    this.queuedLeft = 0;
    this.onMove = options.onMove?.bind(entity);
    this.onStop = options.onStop?.bind(entity);
  }

  /** The centre of the cell containing `v`, on one axis. */
  #centre(v) {
    return (Math.floor(v / this.grid) + 0.5) * this.grid;
  }

  /**
   * Whether the body could stand one cell from `(x, y)` in `direction`:
   * nothing solid overlaps its shape there. Sensors don't block, and the
   * probe is slightly smaller than the body so a snug corridor still reads
   * as open.
   */
  #open(x, y, direction) {
    const body = this.entity.body;
    const radius = Math.min(body.width, body.height) / 2 * 0.95;
    const hits = this.entity.game.physics.overlaps(
      { x: x + direction.x * this.grid, y: y + direction.y * this.grid, radius },
      (other) => !other.isSensor && other !== body
    );
    return hits.length === 0;
  }

  fixedUpdate(dt) {
    const entity = this.entity;
    if (entity.dead) return;
    const body = entity.body;
    const input = entity.game.input.snapshot;

    // The latest press wins the buffer.
    for (const [name, direction] of [
      ['left', { x: -1, y: 0 }], ['right', { x: 1, y: 0 }],
      ['up', { x: 0, y: -1 }], ['down', { x: 0, y: 1 }]
    ]) {
      if (input.justPressed(this.keys[name])) {
        this.queued = direction;
        this.queuedLeft = this.buffer;
      }
    }
    this.queuedLeft = Math.max(0, this.queuedLeft - dt);
    if (this.queuedLeft === 0) this.queued = null;

    const pos = body.position;
    if (this.queued) {
      const q = this.queued;
      const resolve = () => { this.queued = null; this.queuedLeft = 0; };

      if (!this.dir) {
        // At rest: set off if the way is open.
        if (this.#open(this.#centre(pos.x), this.#centre(pos.y), q)) {
          this.dir = q;
          this.onMove?.(q.x, q.y);
          resolve();
        }
      } else if (q.x === this.dir.x && q.y === this.dir.y) {
        if (this.stopOnRepeat) {
          this.dir = null;
          this.onStop?.();
        }
        resolve();
      } else if (q.x === -this.dir.x && q.y === -this.dir.y) {
        this.dir = q;
        this.onMove?.(q.x, q.y);
        resolve();
      } else {
        // A turn: pivot on the nearest junction along the axis of travel —
        // a little ahead or a little behind both count — if its neighbour
        // in the queued direction is clear.
        const along = this.dir.x !== 0 ? 'x' : 'y';
        const cross = along === 'x' ? 'y' : 'x';
        const pivot = { [along]: this.#centre(pos[along]), [cross]: this.#centre(pos[cross]) };
        if (Math.abs(pos[along] - pivot[along]) <= this.grid * this.snap &&
            this.#open(pivot.x, pivot.y, q)) {
          body.setPosition({ x: pivot.x, y: pivot.y });
          this.dir = q;
          this.onMove?.(q.x, q.y);
          resolve();
        }
      }
    }

    if (this.dir) {
      // A dead stop at a wall, parked on the cell centre, so the next turn
      // pivots cleanly instead of grinding into the hedge.
      const along = this.dir.x !== 0 ? 'x' : 'y';
      const centre = { x: this.#centre(pos.x), y: this.#centre(pos.y) };
      const toCentre = (centre[along] - pos[along]) * (this.dir.x || this.dir.y);
      if (!this.#open(centre.x, centre.y, this.dir) && toCentre <= this.speed * dt) {
        body.setPosition(centre);
        body.setVelocity({ x: 0, y: 0 });
        this.dir = null;
        this.onStop?.();
        return;
      }
      // Glide, held to the corridor's centre line on the cross axis.
      const cross = along === 'x' ? 'y' : 'x';
      const drift = centre[cross] - pos[cross];
      const velocity = { x: 0, y: 0 };
      velocity[along] = (this.dir.x || this.dir.y) * this.speed;
      velocity[cross] = Math.max(-this.speed, Math.min(this.speed, drift * 10));
      body.setVelocity(velocity);
    } else {
      body.setVelocity({ x: 0, y: 0 });
    }
  }
}
