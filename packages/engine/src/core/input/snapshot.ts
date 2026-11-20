/**
 * The input state one simulation tick reads, as `game.input.snapshot`.
 *
 * Kept apart from the input manager so code that never sees a browser (a
 * server's input gate, a replay player) can build snapshots without
 * importing the pointer and keyboard sources.
 */

/**
 * Immutable input state for one simulation tick. The same reading API as
 * the live keyboard, over a copy taken by `InputManager.sample`.
 */
/**
 * Steps of a turn a heading is sampled to. A client predicts from its own
 * snapshot and the server simulates from the number that crossed the wire;
 * on a shared grid those are the same number, and a replay reproduces it.
 */
const HEADING_STEPS = 4096;
const TURN = Math.PI * 2;

/**
 * The pointer as of the sample. `world` is on the ground plane (through
 * the scene's projection, if any); `pressed` is true on the tick a button
 * went down and `pressedButtons` is the mask of which, even if it was
 * released again before the tick.
 */
export interface SnapshotPointer {
  ui: { x: number; y: number };
  world: { x: number; y: number; z?: number };
  isDown: boolean;
  pressed?: boolean;
  pressedButtons?: number;
  buttons: number;
  type?: string;
}

/** `toJSON`'s shape, which `from` rebuilds (any part may be omitted). */
export interface SnapshotJSON {
  down?: string[];
  pressed?: string[];
  released?: string[];
  pointer?: {
    ui?: { x?: number; y?: number };
    world?: { x?: number; y?: number; z?: number };
    isDown?: boolean;
    pressed?: boolean;
    pressedButtons?: number;
    buttons?: number;
    type?: string;
  };
  heading?: number;
}

/** An angle wrapped into the turn and snapped to the grid above. */
export function snapHeading(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  const steps = Math.round((heading / TURN) * HEADING_STEPS) % HEADING_STEPS;
  let wrapped = steps;
  if (wrapped > HEADING_STEPS / 2) wrapped -= HEADING_STEPS;
  else if (wrapped <= -HEADING_STEPS / 2) wrapped += HEADING_STEPS;
  // A turn of nothing is +0, never -0, so two sides compare equal.
  return wrapped === 0 ? 0 : (wrapped / HEADING_STEPS) * TURN;
}

export class InputSnapshot {
  readonly down: Set<string>;
  readonly pressed: Set<string>;
  readonly released: Set<string>;
  /**
   * Which way the view faced on the ground plane when the tick was
   * sampled, in radians (a 3D camera's yaw; 0 in 2D and headless), so a
   * character steered relative to the view never reads the camera.
   */
  readonly heading: number;
  readonly pointer: SnapshotPointer;

  constructor({ down, pressed, released, pointer, heading = 0 }: {
    down: Set<string>;
    pressed: Set<string>;
    released: Set<string>;
    pointer: SnapshotPointer;
    heading?: number;
  }) {
    this.down = down;
    this.pressed = pressed;
    this.released = released;
    this.heading = heading;
    this.pointer = pointer;
    Object.freeze(this);
  }

  /** Nothing held, nothing pressed, pointer at the origin. */
  static empty(): InputSnapshot {
    return new InputSnapshot({
      down: new Set(),
      pressed: new Set(),
      released: new Set(),
      pointer: { ui: { x: 0, y: 0 }, world: { x: 0, y: 0 }, isDown: false, pressed: false, pressedButtons: 0, buttons: 0, type: 'mouse' },
      heading: 0
    });
  }

  /**
   * The snapshot as plain JSON, for recording a tick's input. Everything a
   * replay needs to reproduce the tick: `JSON.stringify` works directly on
   * an array of these, and `InputSnapshot.from` turns them back.
   */
  toJSON(): SnapshotJSON {
    return {
      down: [...this.down],
      pressed: [...this.pressed],
      released: [...this.released],
      pointer: {
        ui: { x: this.pointer.ui.x, y: this.pointer.ui.y },
        world: { x: this.pointer.world.x, y: this.pointer.world.y, ...(this.pointer.world.z !== undefined && { z: this.pointer.world.z }) },
        isDown: this.pointer.isDown,
        pressed: this.pointer.pressed ?? false,
        pressedButtons: this.pointer.pressedButtons ?? 0,
        buttons: this.pointer.buttons,
        type: this.pointer.type
      },
      heading: this.heading
    };
  }

  /**
   * Rebuild a snapshot from `toJSON` output (or anything shaped like it —
   * a recorder that only stores key codes can omit the rest).
   */
  static from(json: SnapshotJSON = {}): InputSnapshot {
    const pointer = json.pointer ?? {};
    return new InputSnapshot({
      down: new Set(json.down ?? []),
      pressed: new Set(json.pressed ?? []),
      released: new Set(json.released ?? []),
      pointer: {
        ui: { x: pointer.ui?.x ?? 0, y: pointer.ui?.y ?? 0 },
        world: { x: pointer.world?.x ?? 0, y: pointer.world?.y ?? 0, ...(pointer.world?.z !== undefined && { z: pointer.world.z }) },
        isDown: pointer.isDown ?? false,
        pressed: pointer.pressed ?? false,
        pressedButtons: pointer.pressedButtons ?? 0,
        buttons: pointer.buttons ?? 0,
        type: pointer.type ?? 'mouse'
      },
      heading: snapHeading(json.heading ?? 0)
    });
  }

  /** Whether a physical key was held. */
  isDown(code: string): boolean { return this.down.has(code); }

  /** Whether a key went down this frame, seen by this tick only. */
  justPressed(code: string): boolean { return this.pressed.has(code); }

  /** Whether a key came up this frame, seen by this tick only. */
  justReleased(code: string): boolean { return this.released.has(code); }

  /** A -1..1 axis from two keys. Both held cancel out. */
  axis(negative: string, positive: string): number {
    return (this.down.has(positive) ? 1 : 0) - (this.down.has(negative) ? 1 : 0);
  }

  /** A direction from four keys, normalized so diagonals are not faster. */
  vector(up: string, down: string, left: string, right: string): { x: number; y: number } {
    const x = this.axis(left, right);
    const y = this.axis(up, down);
    if (x !== 0 && y !== 0) {
      const inverse = 1 / Math.SQRT2;
      return { x: x * inverse, y: y * inverse };
    }
    return { x, y };
  }
}
