import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeTestGame } from './helpers/testGame.js';
import { GamepadSource, GAMEPAD_KEYS } from '../src/core/input/gamepad.js';

/**
 * A gamepad is read as keys: polled each frame, each held control becomes
 * the key code it stands for, pushed through the same seam the keyboard
 * uses. So what the tests check is the keyboard's state and events.
 */

/** A pad in the standard mapping: `buttons` by name held, `axes` by index. */
function pad({ buttons = [], axes = [0, 0, 0, 0] } = {}) {
  const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Guide'];
  return {
    mapping: 'standard',
    buttons: names.map((name) => {
      const held = buttons.find((b) => (typeof b === 'string' ? b : b.name) === name);
      const value = held === undefined ? 0 : typeof held === 'string' ? 1 : held.value;
      return { pressed: value >= 1, value };
    }),
    axes
  };
}

let pads = [];
function plug(...connected) {
  pads = connected;
}

describe('a gamepad', () => {
  vi.stubGlobal('navigator', { getGamepads: () => pads });
  afterEach(() => { pads = []; });

  function frame(game, now = 16) {
    game.input.beginFrame(now);
  }

  it('holds the key a button stands for while the button is down', () => {
    const game = makeTestGame();
    plug(pad({ buttons: ['A'] }));
    frame(game);
    expect(game.input.isDown('Space')).toBe(true);
    expect(game.input.justPressed('Space')).toBe(true);
    plug(pad());
    frame(game, 32);
    expect(game.input.isDown('Space')).toBe(false);
  });

  it('reaches keydown subscribers like the keyboard', () => {
    const game = makeTestGame();
    const codes = [];
    game.input.on('keydown', (event) => codes.push(event.code));
    plug(pad({ buttons: ['Start'] }));
    frame(game);
    expect(codes).toEqual(['Escape']);
  });

  it('reads a stick past the deadzone, with hysteresis', () => {
    const game = makeTestGame();
    plug(pad({ axes: [-0.5, 0, 0, 0] }));
    frame(game);
    expect(game.input.isDown('ArrowLeft')).toBe(false);
    plug(pad({ axes: [-0.7, 0, 0, 0] }));
    frame(game, 32);
    expect(game.input.isDown('ArrowLeft')).toBe(true);
    plug(pad({ axes: [-0.5, 0, 0, 0] }));
    frame(game, 48);
    expect(game.input.isDown('ArrowLeft')).toBe(true);     // still past the release threshold
    plug(pad({ axes: [-0.3, 0, 0, 0] }));
    frame(game, 64);
    expect(game.input.isDown('ArrowLeft')).toBe(false);
  });

  it('reads a trigger as a button once it is far enough in', () => {
    const game = makeTestGame();
    plug(pad({ buttons: [{ name: 'RT', value: 0.7 }] }));
    frame(game);
    expect(game.input.isDown('ArrowUp')).toBe(true);
  });

  it('lets two controls hold one key together, up only when both are', () => {
    const game = makeTestGame();
    const codes = [];
    game.input.on('keydown', (event) => codes.push(event.code));
    plug(pad({ buttons: ['Right'], axes: [0.9, 0, 0, 0] }));
    frame(game);
    expect(codes).toEqual(['ArrowRight']);
    plug(pad({ axes: [0.9, 0, 0, 0] }));
    frame(game, 32);
    expect(game.input.isDown('ArrowRight')).toBe(true);
    plug(pad());
    frame(game, 48);
    expect(game.input.isDown('ArrowRight')).toBe(false);
  });

  it('lets go of everything when the pad is unplugged', () => {
    const game = makeTestGame();
    plug(pad({ buttons: ['A', 'Left'] }));
    frame(game);
    plug();
    frame(game, 32);
    expect(game.input.isDown('Space')).toBe(false);
    expect(game.input.isDown('ArrowLeft')).toBe(false);
  });

  it('takes a game\'s own table over the defaults, and an empty string as nothing', () => {
    const game = makeTestGame({ gamepad: { Y: 'Enter', A: '' } });
    plug(pad({ buttons: ['Y', 'A'] }));
    frame(game);
    expect(game.input.isDown('Enter')).toBe(true);
    expect(game.input.isDown('Space')).toBe(false);
    expect(GAMEPAD_KEYS.Y).toBe('KeyE');
  });

  it('reads no pads when told not to, and refuses a control nobody has', () => {
    const game = makeTestGame({ gamepad: false });
    plug(pad({ buttons: ['A'] }));
    frame(game);
    expect(game.input.isDown('Space')).toBe(false);
    expect(() => new GamepadSource({ push() {} }, { Z: 'KeyZ' })).toThrow(/no control named 'Z'/);
  });
});
