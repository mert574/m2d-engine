import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Choices } from '../src/core/choices.js';
import { M2D } from '../src/core/m2d.js';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * A player's choices: declared by the project, recorded by a screen, kept
 * between sessions, and carried into the simulation as the player's state.
 */

const CAR = { car: { values: ['tourer', 'sprint', 'slider'], initial: 'tourer' } };

describe('choices', () => {
  let stored;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value))
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts every choice at its initial and refuses what the project did not offer', () => {
    const choices = new Choices(CAR);
    expect(choices.get('car')).toBe('tourer');
    expect(choices.names).toEqual(['car']);
    expect(() => choices.set('car', 'tank')).toThrow(/cannot be "tank".*offered: "tourer", "sprint", "slider"/);
    expect(() => choices.set('seat', 'left')).toThrow(/no choice named 'seat'.*declared: car/);
    expect(() => choices.get('seat')).toThrow(/no choice named 'seat'/);
  });

  it('keeps a choice between sessions, and drops a stored value the project no longer offers', () => {
    new Choices(CAR, { storageKey: 'm2d.choices:test' }).set('car', 'slider');
    expect(JSON.parse(stored.get('m2d.choices:test'))).toEqual({ car: 'slider' });
    expect(new Choices(CAR, { storageKey: 'm2d.choices:test' }).get('car')).toBe('slider');

    const narrowed = { car: { values: ['tourer', 'sprint'], initial: 'tourer' } };
    expect(new Choices(narrowed, { storageKey: 'm2d.choices:test' }).get('car')).toBe('tourer');

    // Picking what happens to be today's initial is still a choice: it
    // stands when the project's default moves on.
    new Choices(CAR, { storageKey: 'm2d.choices:test' }).set('car', 'tourer');
    const moved = { car: { values: ['tourer', 'sprint', 'slider'], initial: 'slider' } };
    expect(new Choices(moved, { storageKey: 'm2d.choices:test' }).get('car')).toBe('tourer');
  });

  it('is put back into a player\'s state after a snapshot from before the choice existed is restored', async () => {
    await initPhysics();
    const game = new M2D(null, { headless: true, choices: CAR });
    game.sceneManager.addScene('room', { fetch: async () => ({ version: SCENE_VERSION, type: 'level', name: 'room', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
    await game.sceneManager.switchTo('room');
    // A snapshot of a state with no car in it, as one saved before the choice existed.
    delete game.players.local.state.car;
    const snapshot = game.snapshot();
    game.choices.set('car', 'sprint');
    game.restore(snapshot);
    expect(game.players.local.state.car).toBe('sprint');
    const joined = game.players.add('bob');
    joined.state = { gold: 3 };
    joined.fillChoices();
    expect(joined.state).toEqual({ gold: 3, car: 'tourer' });
  });

  it('leaves the choices of another game that shares the key alone', () => {
    const racer = new Choices(CAR, { storageKey: 'm2d.choices:/' });
    const dungeon = new Choices({ difficulty: { values: ['kind', 'hard'], initial: 'kind' } }, { storageKey: 'm2d.choices:/' });
    racer.set('car', 'slider');
    dungeon.set('difficulty', 'hard');
    expect(JSON.parse(stored.get('m2d.choices:/'))).toEqual({ car: 'slider', difficulty: 'hard' });
    expect(new Choices(CAR, { storageKey: 'm2d.choices:/' }).get('car')).toBe('slider');
  });

  it('plays on when the storage refuses or holds nonsense', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); }
    });
    const blocked = new Choices(CAR, { storageKey: 'm2d.choices:test' });
    expect(blocked.get('car')).toBe('tourer');
    expect(() => blocked.set('car', 'sprint')).not.toThrow();
    expect(blocked.get('car')).toBe('sprint');

    stored.set('m2d.choices:test', 'not json');
    vi.stubGlobal('localStorage', { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) });
    expect(new Choices(CAR, { storageKey: 'm2d.choices:test' }).get('car')).toBe('tourer');
    stored.set('m2d.choices:test', JSON.stringify(['tourer']));
    expect(new Choices(CAR, { storageKey: 'm2d.choices:test' }).get('car')).toBe('tourer');
  });

  it('takes numbers and flags as readily as names, and keeps its own copy of the declaration', () => {
    const declared = { laps: { values: [1, 3, 5], initial: 3 }, ghost: { values: [true, false], initial: true } };
    const choices = new Choices(declared);
    choices.set('laps', 5);
    choices.set('ghost', false);
    expect(choices.all).toEqual({ laps: 5, ghost: false });
    expect(() => choices.set('laps', '5')).toThrow(/cannot be "5"/);
    declared.laps.values.push(7);
    expect(() => choices.set('laps', 7)).toThrow(/cannot be 7/);
  });

  it('is the local player\'s state in a headless game too, where nothing is stored', () => {
    const game = new M2D(null, { headless: true, choices: CAR });
    expect(game.players.local.state.car).toBe('tourer');
    game.choices.set('car', 'sprint');
    expect(game.players.local.state.car).toBe('sprint');
    expect(stored.size).toBe(0);
    // A player who joins from elsewhere starts at the initial: their choice is theirs to send.
    expect(game.players.add('bob').state.car).toBe('tourer');
  });
});
