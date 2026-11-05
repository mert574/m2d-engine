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
export class InputSnapshot {
  /**
   * @param {object} state
   * @param {Set<string>} state.down
   * @param {Set<string>} state.pressed
   * @param {Set<string>} state.released
   * @param {object} state.pointer
   */
  constructor({ down, pressed, released, pointer }) {
    this.down = down;
    this.pressed = pressed;
    this.released = released;
    /**
     * `{ ui, world, isDown, pressed, pressedButtons, buttons, type }` as of
     * the sample. `world` is on the ground plane (through the scene's
     * projection, if any); `pressed` is true on the tick a button went
     * down and `pressedButtons` is the mask of which, even if it was
     * released again before the tick.
     */
    this.pointer = pointer;
    Object.freeze(this);
  }

  /** Nothing held, nothing pressed, pointer at the origin. */
  static empty() {
    return new InputSnapshot({
      down: new Set(),
      pressed: new Set(),
      released: new Set(),
      pointer: { ui: { x: 0, y: 0 }, world: { x: 0, y: 0 }, isDown: false, pressed: false, pressedButtons: 0, buttons: 0, type: 'mouse' }
    });
  }

  /**
   * The snapshot as plain JSON, for recording a tick's input. Everything a
   * replay needs to reproduce the tick: `JSON.stringify` works directly on
   * an array of these, and `InputSnapshot.from` turns them back.
   */
  toJSON() {
    return {
      down: [...this.down],
      pressed: [...this.pressed],
      released: [...this.released],
      pointer: {
        ui: { x: this.pointer.ui.x, y: this.pointer.ui.y },
        world: { x: this.pointer.world.x, y: this.pointer.world.y },
        isDown: this.pointer.isDown,
        pressed: this.pointer.pressed ?? false,
        pressedButtons: this.pointer.pressedButtons ?? 0,
        buttons: this.pointer.buttons,
        type: this.pointer.type
      }
    };
  }

  /**
   * Rebuild a snapshot from `toJSON` output (or anything shaped like it —
   * a recorder that only stores key codes can omit the rest).
   * @param {object} json
   * @returns {InputSnapshot}
   */
  static from(json = {}) {
    const pointer = json.pointer ?? {};
    return new InputSnapshot({
      down: new Set(json.down ?? []),
      pressed: new Set(json.pressed ?? []),
      released: new Set(json.released ?? []),
      pointer: {
        ui: { x: pointer.ui?.x ?? 0, y: pointer.ui?.y ?? 0 },
        world: { x: pointer.world?.x ?? 0, y: pointer.world?.y ?? 0 },
        isDown: pointer.isDown ?? false,
        pressed: pointer.pressed ?? false,
        pressedButtons: pointer.pressedButtons ?? 0,
        buttons: pointer.buttons ?? 0,
        type: pointer.type ?? 'mouse'
      }
    });
  }

  /** Whether a physical key was held. @param {string} code */
  isDown(code) { return this.down.has(code); }

  /** Whether a key went down this frame, seen by this tick only. */
  justPressed(code) { return this.pressed.has(code); }

  /** Whether a key came up this frame, seen by this tick only. */
  justReleased(code) { return this.released.has(code); }

  /** A -1..1 axis from two keys. Both held cancel out. */
  axis(negative, positive) {
    return (this.down.has(positive) ? 1 : 0) - (this.down.has(negative) ? 1 : 0);
  }

  /** A direction from four keys, normalized so diagonals are not faster. */
  vector(up, down, left, right) {
    const x = this.axis(left, right);
    const y = this.axis(up, down);
    if (x !== 0 && y !== 0) {
      const inverse = 1 / Math.SQRT2;
      return { x: x * inverse, y: y * inverse };
    }
    return { x, y };
  }
}
