/**
 * Gamepads, read as keys.
 *
 * The Gamepad API has no events: a pad is polled. Each frame this reads
 * every connected pad, works out which controls are held, translates each
 * through a table into a physical key code and pushes the edges through
 * the same seam the keyboard uses. Every constraint, rule, named action,
 * menu and replay then works from a pad without knowing one is there, as
 * they do from an on-screen key.
 *
 * The default table is the arcade convention — the d-pad and the left
 * stick are the arrows, A is Space, B and Start are Escape — and a game
 * changes it control by control (`input.gamepad` in the project file, or
 * the `gamepad` option). Sticks count past `PRESS` of their travel and let
 * go under `RELEASE`, so a stick resting near the edge does not chatter.
 *
 * Two controls that stand for the same key hold it together: the key goes
 * down with the first and comes up with the last.
 */

/** The standard mapping's buttons, by index. */
const BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Guide'];

/** The standard mapping's sticks: axis index to the controls its two ends are. */
const AXES = [
  ['LeftStickLeft', 'LeftStickRight'], ['LeftStickUp', 'LeftStickDown'],
  ['RightStickLeft', 'RightStickRight'], ['RightStickUp', 'RightStickDown']
];

/** How far a stick or trigger travels before it counts, and how far back before it lets go. */
const PRESS = 0.6;
const RELEASE = 0.4;

/** Every control a pad has, for a bindings screen or a check. */
export const GAMEPAD_CONTROLS = [...BUTTONS, ...AXES.flat()];

/** What each control stands for unless a game says otherwise. An empty string is nothing. */
export const GAMEPAD_KEYS = Object.freeze({
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  LeftStickUp: 'ArrowUp', LeftStickDown: 'ArrowDown', LeftStickLeft: 'ArrowLeft', LeftStickRight: 'ArrowRight',
  RightStickUp: '', RightStickDown: '', RightStickLeft: '', RightStickRight: '',
  A: 'Space', B: 'Escape', X: 'KeyX', Y: 'KeyE',
  LB: 'ShiftLeft', RB: 'ShiftRight', LT: 'ArrowDown', RT: 'ArrowUp',
  Back: 'KeyO', Start: 'Escape', L3: '', R3: '', Guide: ''
});

const NO_MODIFIERS = Object.freeze({ shift: false, ctrl: false, alt: false, meta: false });

export class GamepadSource {
  /**
   * @param {{push: (record: object) => void}} sink - Where key records go
   * @param {Record<string, string>|false} [mapping] - Overrides of `GAMEPAD_KEYS`, or `false` for no pads
   */
  constructor(sink, mapping = {}) {
    this.sink = sink;
    this.mapping = mapping === false ? null : { ...GAMEPAD_KEYS, ...mapping };
    for (const control of Object.keys(mapping || {})) {
      if (!GAMEPAD_CONTROLS.includes(control)) throw new Error(`M2D gamepad: no control named '${control}' (controls: ${GAMEPAD_CONTROLS.join(', ')})`);
    }
    /** The controls held last poll, for the sticks' hysteresis. @type {Set<string>} */
    this.controls = new Set();
    /** The key codes down because of a pad. @type {Set<string>} */
    this.held = new Set();
  }

  /** The connected pads, where the page has any. */
  static pads() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
    return [...navigator.getGamepads()].filter(Boolean);
  }

  /** Read every pad and push the key edges since the last poll. */
  poll(now) {
    if (!this.mapping) return;
    const controls = new Set();
    for (const pad of GamepadSource.pads()) this.#read(pad, controls);
    const codes = new Set();
    for (const control of controls) {
      const code = this.mapping[control];
      if (code) codes.add(code);
    }
    for (const code of codes) if (!this.held.has(code)) this.#push('keydown', code, now);
    for (const code of this.held) if (!codes.has(code)) this.#push('keyup', code, now);
    this.controls = controls;
    this.held = codes;
  }

  /** Let every key up: the game is going away. */
  release(now = 0) {
    for (const code of this.held) this.#push('keyup', code, now);
    this.held = new Set();
    this.controls = new Set();
  }

  #read(pad, out) {
    pad.buttons?.forEach((button, i) => {
      const name = BUTTONS[i];
      if (!name) return;
      const value = typeof button === 'number' ? button : button.value ?? (button.pressed ? 1 : 0);
      if (button.pressed || this.#past(name, value)) out.add(name);
    });
    pad.axes?.forEach((value, i) => {
      const ends = AXES[i];
      if (!ends) return;
      if (this.#past(ends[0], -value)) out.add(ends[0]);
      if (this.#past(ends[1], value)) out.add(ends[1]);
    });
  }

  /** Whether a travel counts as held, with hysteresis against the last poll. */
  #past(control, value) {
    return value > (this.controls.has(control) ? RELEASE : PRESS);
  }

  #push(kind, code, time) {
    this.sink.push({ kind, code, key: code, time, modifiers: NO_MODIFIERS });
  }
}
