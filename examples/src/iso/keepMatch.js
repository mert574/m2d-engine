import { readFile } from 'node:fs/promises';
import { defineMatch } from 'm2d-server';
import { KEEP_INPUT, KEEP_GAME, registerKeep, sceneHooks, spawnKnight } from './game.js';

/**
 * Cinder Keep as a match: the same game.js the browser plays, run headless
 * in a worker by m2d-server. Each player who joins gets a knight of their
 * own in the start room; the keep's embers, creatures, quartermaster and
 * stair are shared.
 */

const SCENE = new URL('./scenes/keep.json', import.meta.url);

let arrivals = 0;

export default defineMatch({
  input: KEEP_INPUT,
  game: KEEP_GAME,
  maxPlayers: 4,
  // Knights see the creatures and each other a room or two away. The keep
  // itself — walls, torches, embers, the stair, the quartermaster — stands
  // still and is sent once, so only the movers are filtered.
  interest: { radius: 1400 },

  async setup(game) {
    registerKeep(game);
    game.sceneManager.addScene('keep', { fetch: async () => JSON.parse(await readFile(SCENE, 'utf8')), ...sceneHooks(game).keep });
    await game.sceneManager.switchTo('keep');
    // The scene's own knight is the single-player one. Online, every
    // knight belongs to someone.
    const solo = game.player;
    game.entities.delete(solo);
    game.physics.remove(solo.body);
    game.player = null;
  },

  join(game, player) {
    spawnKnight(game, player, arrivals++);
  }
});
