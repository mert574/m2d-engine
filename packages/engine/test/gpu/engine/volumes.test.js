import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { M2D } from '../../../src/core/m2d.js';
import { SettingsMenu } from '../../../src/core/ui/settingsMenu.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from '../../helpers/environment.js';
import { initPhysics } from '../../../src/core/physics/index.js';

/**
 * Music and effects volumes: cvars over the sound manager's live values,
 * two rows in the settings menu, and saved like the display settings — so
 * a player who turns the music down finds it down next time.
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

const makeGame = () => new M2D(displayCanvas(640, 360), { width: 640, height: 360, saveId: 'volumes' });

describe('music and effects volumes', () => {
  beforeAll(async () => {
    stubDocumentListeners();
    await initPhysics();
    globalThis.localStorage = memoryStorage();
  });

  beforeEach(() => installWindowStub());
  afterAll(() => { delete globalThis.localStorage; });

  it('moves the sound manager, and the manager is the one value', () => {
    const game = makeGame();
    game.cvars.set('s_music', 0.4);
    expect(game.soundManager.musicVolume).toBeCloseTo(0.4, 5);

    // Set on the manager — a game's own slider — and the cvar says so too.
    game.soundManager.setSoundVolume(0.8);
    expect(game.cvars.get('s_effects')).toBeCloseTo(0.8, 5);
    game.destroy();
  });

  it('clamps to 0..1 rather than letting a console typo wreck the mix', () => {
    const game = makeGame();
    game.cvars.set('s_music', 7);
    expect(game.soundManager.musicVolume).toBe(1);
    game.cvars.set('s_music', -3);
    expect(game.soundManager.musicVolume).toBe(0);
    game.destroy();
  });

  it('survives a reload', () => {
    const first = makeGame();
    first.cvars.set('s_music', 0.2);
    first.cvars.set('s_effects', 0.5);
    first.destroy();

    const second = makeGame();
    expect(second.soundManager.musicVolume).toBeCloseTo(0.2, 5);
    expect(second.soundManager.soundVolume).toBeCloseTo(0.5, 5);
    second.destroy();
  });

  it('has a row each in the settings menu, stepping in tenths and stopping at the ends', () => {
    const game = makeGame();
    game.cvars.set('s_music', 0.3);
    const rows = new SettingsMenu(game).items();
    const music = rows.find((row) => row.label === 'Music');
    const effects = rows.find((row) => row.label === 'Sound effects');

    expect(music.section).toBe('Sound');
    expect(effects.section).toBe('Sound');
    expect(music.value()).toBe('30%');
    music.step(1);
    expect(music.value()).toBe('40%');
    expect(game.soundManager.musicVolume).toBeCloseTo(0.4, 5);

    game.cvars.set('s_music', 0);
    music.step(-1);
    expect(music.value()).toBe('0%');
    game.cvars.set('s_music', 1);
    music.step(1);
    expect(music.value()).toBe('100%');
    game.destroy();
  });
});
