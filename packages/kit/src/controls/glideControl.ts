import { Constraint, KEY_BINDINGS, type Entity } from 'm2d-engine';
import { s } from 'm2d-engine/schema';

/** A point or a direction on the ground plane. */
interface Vec2 {
  x: number;
  y: number;
}

/** Which axis a glide runs along. */
type Axis = 'x' | 'y';

/** The four directions, by the binding that asks for them. */
type Heading = 'left' | 'right' | 'up' | 'down';

/**
 * Default bindings, as physical key codes (see core/input/keyboard.js).
 */
const DEFAULT_KEYS: Readonly<Record<Heading, string>> = Object.freeze({
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown'
});

const DIRECTIONS: ReadonlyArray<readonly [Heading, Vec2]> = [
  ['left', { x: -1, y: 0 }], ['right', { x: 1, y: 0 }],
  ['up', { x: 0, y: -1 }], ['down', { x: 0, y: 1 }]
];

export interface GlideControlOptions {
  /** Glide speed, px/s. */
  speed?: number;
  /** Corridor cell size, px. Cell centres are at `(n + 0.5) * grid`. */
  grid?: number;
  /** How long a queued turn waits for its opening, seconds. */
  buffer?: number;
  /** How far from a junction, in cells, a late turn may still take it. */
  snap?: number;
  /** Pressing the direction of travel stops the body. */
  stopOnRepeat?: boolean;
  /** Bindings, as physical key codes; merged over the defaults. */
  keys?: Partial<Record<Heading, string>>;
  /** Called with the direction when the body sets off or turns. */
  onMove?: (dx: number, dy: number) => void;
  /** Called when the body comes to rest. */
  onStop?: () => void;
}

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
 */
export class GlideControl extends Constraint {
  static override description = 'Keyboard flight: thrust, pitch and glide for a winged thing';
  static override params = {
    speed: s.number({ initial: 240, positive: true, unit: 'px/s' }),
    grid: s.number({ initial: 32, positive: true, unit: 'px' }),
    buffer: s.number({ initial: 0.35, min: 0, unit: 's' }),
    snap: s.number({ initial: 0.6, min: 0, max: 1 }),
    stopOnRepeat: s.boolean({ initial: true }),
    keys: KEY_BINDINGS
  };

  declare entity: Entity;

  keys: Record<Heading, string>;
  speed: number;
  grid: number;
  buffer: number;
  snap: number;
  stopOnRepeat: boolean;
  /** Direction of travel, or null at rest. */
  dir: Vec2 | null;
  /** The buffered press, waiting for its opening. */
  queued: Vec2 | null;
  queuedLeft: number;
  onMove: ((dx: number, dy: number) => void) | undefined;
  onStop: (() => void) | undefined;

  constructor(entity: Entity, options: GlideControlOptions = {}) {
    super(entity);
    this.keys = { ...DEFAULT_KEYS, ...options.keys };
    this.speed = options.speed ?? 240;
    this.grid = options.grid ?? 32;
    this.buffer = options.buffer ?? 0.35;
    this.snap = options.snap ?? 0.6;
    this.stopOnRepeat = options.stopOnRepeat ?? true;

    this.dir = null;
    this.queued = null;
    this.queuedLeft = 0;
    this.onMove = options.onMove?.bind(entity);
    this.onStop = options.onStop?.bind(entity);
  }

  /** `keys` merges over the bindings already in place, never replaces them. */
  override configure(params: GlideControlOptions): void {
    const { keys, ...rest } = params;
    super.configure(rest);
    if (keys) this.keys = { ...this.keys, ...keys };
  }

  /** The centre of the cell containing `v`, on one axis. */
  #centre(v: number): number {
    return (Math.floor(v / this.grid) + 0.5) * this.grid;
  }

  /**
   * Whether the body could stand one cell from `(x, y)` in `direction`:
   * nothing solid overlaps its shape there. Sensors don't block, and the
   * probe is slightly smaller than the body so a snug corridor still reads
   * as open.
   */
  #open(x: number, y: number, direction: Vec2): boolean {
    const body = this.entity.body;
    const radius = Math.min(body.width, body.height) / 2 * 0.95;
    const hits = this.entity.game.physics.overlaps(
      { x: x + direction.x * this.grid, y: y + direction.y * this.grid, radius },
      (other: { isSensor: boolean }) => !other.isSensor && other !== body
    );
    return hits.length === 0;
  }

  override fixedUpdate(dt: number): void {
    const entity = this.entity;
    if (entity.dead) return;
    const body = entity.body;
    const input = entity.input;

    // The latest press wins the buffer.
    for (const [name, direction] of DIRECTIONS) {
      if (input.justPressed(this.keys[name])) {
        this.queued = direction;
        this.queuedLeft = this.buffer;
      }
    }
    this.queuedLeft = Math.max(0, this.queuedLeft - dt);
    if (this.queuedLeft === 0) this.queued = null;

    const pos: Vec2 = body.position;
    if (this.queued) {
      const q = this.queued;
      const resolve = (): void => { this.queued = null; this.queuedLeft = 0; };

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
        const along: Axis = this.dir.x !== 0 ? 'x' : 'y';
        const pivot: Vec2 = { x: this.#centre(pos.x), y: this.#centre(pos.y) };
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
      const along: Axis = this.dir.x !== 0 ? 'x' : 'y';
      const centre: Vec2 = { x: this.#centre(pos.x), y: this.#centre(pos.y) };
      const toCentre = (centre[along] - pos[along]) * (this.dir.x || this.dir.y);
      if (!this.#open(centre.x, centre.y, this.dir) && toCentre <= this.speed * dt) {
        body.setPosition(centre);
        body.setVelocity({ x: 0, y: 0 });
        this.dir = null;
        this.onStop?.();
        return;
      }
      // Glide, held to the corridor's centre line on the cross axis.
      const cross: Axis = along === 'x' ? 'y' : 'x';
      const drift = centre[cross] - pos[cross];
      const velocity: Vec2 = { x: 0, y: 0 };
      velocity[along] = (this.dir.x || this.dir.y) * this.speed;
      velocity[cross] = Math.max(-this.speed, Math.min(this.speed, drift * 10));
      body.setVelocity(velocity);
    } else {
      body.setVelocity({ x: 0, y: 0 });
    }
  }
}
