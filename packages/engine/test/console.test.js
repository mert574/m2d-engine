import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { CVarRegistry } from '../src/core/console/cvars.js';
import { CommandRegistry, tokenize } from '../src/core/console/commands.js';
import { M2D } from '../src/core/m2d.js';
import { createCanvasElement, installWindowStub } from './helpers/environment.js';
import { keyDown, keyUp } from './helpers/input.js';
import { SettingsMenu } from '../src/core/ui/settingsMenu.js';

/**
 * The developer console: cvars, commands, and the drop-down itself.
 */

/** A Storage stand-in, since node has no localStorage. */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

describe('CVarRegistry', () => {
  let cvars;

  beforeEach(() => {
    cvars = new CVarRegistry({ storage: null });
  });

  it('stores and returns typed values', () => {
    cvars.register('g_lives', { type: 'number', default: 3 });
    expect(cvars.get('g_lives')).toBe(3);
    cvars.set('g_lives', '5');
    expect(cvars.get('g_lives')).toBe(5);
  });

  it('clamps numbers to their range', () => {
    cvars.register('g_volume', { type: 'number', default: 1, min: 0, max: 1 });
    expect(cvars.set('g_volume', '4')).toBe(1);
    expect(cvars.set('g_volume', -2)).toBe(0);
  });

  it('rejects a number that is not one', () => {
    cvars.register('g_lives', { type: 'number', default: 3 });
    expect(() => cvars.set('g_lives', 'many')).toThrow(/expected a number/);
    expect(cvars.get('g_lives')).toBe(3);
  });

  it('parses the boolean spellings a console user will type', () => {
    cvars.register('g_cheats', { type: 'boolean', default: false });
    for (const [input, expected] of [
      ['1', true], ['0', false], ['on', true], ['off', false],
      ['true', true], ['false', false], ['YES', true]
    ]) {
      expect(cvars.set('g_cheats', input)).toBe(expected);
    }
    expect(() => cvars.set('g_cheats', 'maybe')).toThrow();
  });

  it('constrains string choices', () => {
    cvars.register('r_mode', { type: 'string', default: 'a', choices: ['a', 'b'] });
    expect(cvars.set('r_mode', 'b')).toBe('b');
    expect(() => cvars.set('r_mode', 'c')).toThrow(/expected one of/);
  });

  it('reads and writes live engine state through accessors', () => {
    // The cvar asks the engine rather than keeping a copy that can drift.
    const engine = { aspect: 'letterbox' };
    cvars.register('r_aspect', {
      type: 'string',
      choices: ['letterbox', 'expand'],
      default: 'letterbox',
      get: () => engine.aspect,
      set: (value) => { engine.aspect = value; }
    });

    engine.aspect = 'expand';
    expect(cvars.get('r_aspect')).toBe('expand');
    cvars.set('r_aspect', 'letterbox');
    expect(engine.aspect).toBe('letterbox');
  });

  it('treats a getter without a setter as read-only', () => {
    cvars.register('r_backend', { type: 'string', get: () => 'webgl' });
    expect(cvars.get('r_backend')).toBe('webgl');
    expect(() => cvars.set('r_backend', 'canvas')).toThrow(/read-only/);
  });

  it('fires onChange only when the value actually changes', () => {
    const onChange = vi.fn();
    cvars.register('g_lives', { type: 'number', default: 3, onChange });

    cvars.set('g_lives', 3);
    expect(onChange).not.toHaveBeenCalled();

    cvars.set('g_lives', 5);
    expect(onChange).toHaveBeenCalledWith(5, 3);
  });

  it('toggles booleans and resets to defaults', () => {
    cvars.register('g_cheats', { type: 'boolean', default: false });
    expect(cvars.toggle('g_cheats')).toBe(true);
    expect(cvars.reset('g_cheats')).toBe(false);

    cvars.register('g_lives', { type: 'number', default: 3 });
    expect(() => cvars.toggle('g_lives')).toThrow(/not a boolean/);
  });

  it('lists names filtered over name and description', () => {
    cvars.register('cl_showfps', { type: 'boolean', default: true, description: 'frame rate readout' });
    cvars.register('r_aspect', { type: 'string', default: 'letterbox', description: 'aspect mode' });

    expect(cvars.list()).toEqual(['cl_showfps', 'r_aspect']);
    expect(cvars.list('fps')).toEqual(['cl_showfps']);
    expect(cvars.list('readout')).toEqual(['cl_showfps']);
  });

  it('refuses duplicates and definitions with no value at all', () => {
    cvars.register('g_lives', { type: 'number', default: 3 });
    expect(() => cvars.register('g_lives', { type: 'number', default: 1 })).toThrow(/already/);
    expect(() => cvars.register('g_broken', { type: 'number' })).toThrow(/default or a getter/);
  });

  describe('persistence', () => {
    it('saves on change and replays at registration, scoped by saveId', () => {
      const storage = memoryStorage();
      const first = new CVarRegistry({ storage, saveId: 'demo' });
      first.register('r_aspect', {
        type: 'string', default: 'letterbox', choices: ['letterbox', 'expand'], persist: true
      });
      first.set('r_aspect', 'expand');

      // A second run of the same game sees the choice...
      const second = new CVarRegistry({ storage, saveId: 'demo' });
      second.register('r_aspect', {
        type: 'string', default: 'letterbox', choices: ['letterbox', 'expand'], persist: true
      });
      expect(second.get('r_aspect')).toBe('expand');

      // ...and a different game on the same origin does not.
      const other = new CVarRegistry({ storage, saveId: 'other' });
      other.register('r_aspect', {
        type: 'string', default: 'letterbox', choices: ['letterbox', 'expand'], persist: true
      });
      expect(other.get('r_aspect')).toBe('letterbox');
    });

    it('drops a stored value that no longer parses', () => {
      // The choices changed between versions; a wedged startup is worse
      // than a lost preference.
      const storage = memoryStorage();
      storage.setItem('m2d:demo:cvar:r_mode', JSON.stringify('legacy'));

      const cvarsWithStore = new CVarRegistry({ storage, saveId: 'demo' });
      cvarsWithStore.register('r_mode', {
        type: 'string', default: 'a', choices: ['a', 'b'], persist: true
      });

      expect(cvarsWithStore.get('r_mode')).toBe('a');
      expect(storage.getItem('m2d:demo:cvar:r_mode')).toBe(null);
    });

    it('replays through the live setter', () => {
      const storage = memoryStorage();
      storage.setItem('m2d:demo:cvar:r_aspect', JSON.stringify('expand'));
      const engine = { aspect: 'letterbox' };

      const live = new CVarRegistry({ storage, saveId: 'demo' });
      live.register('r_aspect', {
        type: 'string', default: 'letterbox', choices: ['letterbox', 'expand'], persist: true,
        get: () => engine.aspect,
        set: (value) => { engine.aspect = value; }
      });

      expect(engine.aspect).toBe('expand');
    });

    it('survives a storage that throws', () => {
      const hostile = {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('quota'); },
        removeItem: () => { throw new Error('blocked'); }
      };
      const cvarsHostile = new CVarRegistry({ storage: hostile, saveId: 'demo' });
      cvarsHostile.register('g_lives', { type: 'number', default: 3, persist: true });
      expect(cvarsHostile.set('g_lives', 5)).toBe(5);
    });
  });
});

describe('CommandRegistry', () => {
  let cvars;
  let commands;
  let output;
  let io;

  beforeEach(() => {
    cvars = new CVarRegistry({ storage: null });
    commands = new CommandRegistry(cvars);
    output = [];
    io = {
      print: (text) => output.push(['print', text]),
      warn: (text) => output.push(['warn', text]),
      error: (text) => output.push(['error', text])
    };
  });

  it('tokenizes with double quotes', () => {
    expect(tokenize('echo hello world')).toEqual(['echo', 'hello', 'world']);
    expect(tokenize('echo "two words" three')).toEqual(['echo', 'two words', 'three']);
    expect(tokenize('   ')).toEqual([]);
  });

  it('runs a command with its arguments', () => {
    const run = vi.fn();
    commands.register('spawn', { run });
    commands.execute('spawn goblin 3', io);
    expect(run).toHaveBeenCalledWith(['goblin', '3'], io);
  });

  it('prints a bare cvar and sets one with a value — the Source grammar', () => {
    cvars.register('g_lives', { type: 'number', default: 3, description: 'lives' });

    commands.execute('g_lives', io);
    expect(output.at(-1)).toEqual(['print', 'g_lives = 3  — lives']);

    commands.execute('g_lives 5', io);
    expect(output.at(-1)).toEqual(['print', 'g_lives = 5']);
    expect(cvars.get('g_lives')).toBe(5);
  });

  it('reports a bad value as an error, not a throw', () => {
    cvars.register('g_lives', { type: 'number', default: 3 });
    commands.execute('g_lives many', io);
    expect(output.at(-1)[0]).toBe('error');
  });

  it('points an unknown name at help', () => {
    commands.execute('frobnicate', io);
    expect(output.at(-1)[0]).toBe('error');
    expect(output.at(-1)[1]).toContain('frobnicate');
  });

  it('contains a command error instead of crashing the console', () => {
    commands.register('boom', { run: () => { throw new Error('kaboom'); } });
    commands.execute('boom', io);
    expect(output.at(-1)).toEqual(['error', 'kaboom']);
  });

  describe('completion', () => {
    beforeEach(() => {
      cvars.register('cl_showfps', { type: 'boolean', default: true });
      cvars.register('cl_statsexpanded', { type: 'boolean', default: false });
      commands.register('clear', { run() {} });
    });

    it('completes the first token over commands and cvars together', () => {
      const { completions } = commands.complete('cl');
      expect(completions).toEqual(['cl_showfps', 'cl_statsexpanded', 'clear']);
    });

    it('offers a string cvar choices for its value', () => {
      cvars.register('r_aspect', {
        type: 'string', default: 'letterbox', choices: ['letterbox', 'expand']
      });
      expect(commands.complete('r_aspect ').completions).toEqual(['letterbox', 'expand']);
      expect(commands.complete('r_aspect ex').completions).toEqual(['expand']);
    });

    it('offers nothing for an argument it knows nothing about', () => {
      expect(commands.complete('clear something').completions).toEqual([]);
    });
  });
});

describe('DevConsole', () => {
  beforeAll(() => {
    globalThis.document.addEventListener ??= () => {};
    globalThis.document.removeEventListener ??= () => {};
  });

  beforeEach(() => {
    installWindowStub();
  });

  function displayCanvas(cssWidth, cssHeight) {
    const canvas = createCanvasElement(cssWidth, cssHeight);
    Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight });
    return canvas;
  }

  function makeGame(options = {}) {
    const game = new M2D(displayCanvas(1280, 720), {
      width: 1280, height: 720, renderer: 'canvas', performanceStats: false,
      // Leave the global console alone: a wrapped console.log in one test
      // leaks into every later one in the file.
      ...options
    });
    game.console?.restores.forEach((restore) => restore());
    if (game.console) game.console.restores = [];
    return game;
  }

  /** Type a string through the real key routing. */
  function type(game, text) {
    for (const character of text) {
      const code = character === ' ' ? 'Space' : `Key${character.toUpperCase()}`;
      game.input.push({ kind: 'keydown', code, key: character, time: performance.now() });
      game.input.flush();
      game.input.push({ kind: 'keyup', code, key: character, time: performance.now() });
      game.input.flush();
    }
  }

  it('mounts in the debug layer and opens on the hotkey', () => {
    const game = makeGame();
    expect(game.console.visible).toBe(false);

    keyDown(game, 'Backquote');

    expect(game.console.isOpen).toBe(true);
    expect(game.console.captureAll).toBe(true);
  });

  it('is absent when disabled', () => {
    const game = makeGame({ devConsole: false });
    expect(game.console).toBe(null);
    keyDown(game, 'Backquote');
    expect(game.ui.debug.children).toHaveLength(0);
  });

  it('opens over a blocking screen — the hotkey outranks menus', () => {
    // This is the case that catches a subscriber-based opener: a blocking
    // screen consumes keydowns before subscribers run, so the console must
    // be first in line even while closed.
    const game = makeGame();
    const menu = new SettingsMenu(game);
    menu.open();
    expect(game.ui.capturesInput).toBe(true);

    keyDown(game, 'Backquote');

    expect(game.console.isOpen).toBe(true);
    // And every key now belongs to it, not to the menu beneath.
    keyDown(game, 'Escape');
    expect(game.console.isOpen).toBe(false);
    expect(menu.isShowing).toBe(true);
  });

  it('takes every key away from the game while open', () => {
    const game = makeGame();
    keyDown(game, 'Backquote');

    keyDown(game, 'KeyW');

    expect(game.input.isDown('KeyW')).toBe(false);
  });

  it('types through event.key, so the layout decides the character', () => {
    const game = makeGame();
    keyDown(game, 'Backquote');

    type(game, 'help');

    expect(game.console.input).toBe('help');
  });

  it('executes on Enter and prints through its own io', () => {
    const game = makeGame();
    const console_ = game.console;
    console_.open();

    console_.execute('echo hello there');

    const texts = console_.lines.map((line) => line.text);
    expect(texts).toContain('> echo hello there');
    expect(texts).toContain('hello there');
  });

  it('reaches the engine cvars', () => {
    const game = makeGame();
    game.console.execute('g_paused 1');
    expect(game.paused).toBe(true);

    game.console.execute('g_timescale 0.5');
    expect(game.physics.timeScale).toBe(0.5);
  });

  it('walks history with the arrows, keeping the line being typed', () => {
    const game = makeGame();
    const console_ = game.console;
    console_.open();
    console_.execute('echo one');
    console_.execute('echo two');

    type(game, 'dra');
    keyDown(game, 'ArrowUp');
    expect(console_.input).toBe('echo two');
    keyDown(game, 'ArrowUp');
    expect(console_.input).toBe('echo one');
    keyDown(game, 'ArrowDown');
    keyDown(game, 'ArrowDown');
    expect(console_.input).toBe('dra');
  });

  it('completes a unique prefix and extends a shared one', () => {
    const game = makeGame();
    const console_ = game.console;
    console_.open();

    // Unique: completed outright, with a space to move on to arguments.
    type(game, 'ech');
    keyDown(game, 'Tab');
    expect(console_.input).toBe('echo ');

    // Shared: extended to the longest common prefix, choices printed.
    game.cvars.register('ui_scale', { type: 'number', default: 1 });
    game.cvars.register('ui_sound', { type: 'boolean', default: true });
    console_.input = 'ui_';
    console_.caret = 3;
    keyDown(game, 'Tab');

    expect(console_.input).toBe('ui_s');
    expect(console_.caret).toBe(4);
    expect(console_.lines.at(-1).text).toContain('ui_scale');
    expect(console_.lines.at(-1).text).toContain('ui_sound');
  });

  it('edits with caret movement and backspace', () => {
    const game = makeGame();
    const console_ = game.console;
    console_.open();

    type(game, 'helo');
    keyDown(game, 'ArrowLeft');
    type(game, 'l');
    expect(console_.input).toBe('hello');

    keyDown(game, 'End');
    keyDown(game, 'Backspace');
    expect(console_.input).toBe('hell');
  });

  it('closes on Escape and on its own hotkey, releasing capture', () => {
    const game = makeGame();
    keyDown(game, 'Backquote');
    keyDown(game, 'Escape');
    expect(game.console.isOpen).toBe(false);
    expect(game.console.captureAll).toBe(false);

    keyDown(game, 'Backquote');
    keyDown(game, 'Backquote');
    expect(game.console.isOpen).toBe(false);
  });

  it('still reports a key release, so a held key does not stick when it opens', () => {
    const game = makeGame();
    keyDown(game, 'KeyW');
    expect(game.input.isDown('KeyW')).toBe(true);

    keyDown(game, 'Backquote');
    keyUp(game, 'KeyW');

    expect(game.input.isDown('KeyW')).toBe(false);
  });

  it('caps the scrollback', () => {
    const game = makeGame();
    for (let i = 0; i < 500; i++) game.console.append(`line ${i}`);
    expect(game.console.lines.length).toBeLessThanOrEqual(400);
    expect(game.console.lines.at(-1).text).toBe('line 499');
  });

  it('the settings menu and the console move the same cvar', () => {
    const game = makeGame();
    game.console.execute('r_aspect expand');
    expect(game.aspectMode).toBe('expand');

    game.setAspectMode('letterbox');
    game.console.execute('r_aspect');
    expect(game.console.lines.at(-1).text).toContain('letterbox');
  });

  it('is torn down with the game', () => {
    const game = makeGame();
    game.destroy();
    keyDown(game, 'Backquote');
    expect(game.console.isOpen).toBe(false);
  });
});
