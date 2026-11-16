import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Choices } from '../src/core/choices.js';
import { M2D } from '../src/core/m2d.js';

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
