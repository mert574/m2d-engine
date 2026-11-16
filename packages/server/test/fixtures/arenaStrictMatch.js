import { defineMatch } from 'm2d-server';
import { INPUT, GAME_OPTIONS, registerArena } from './arenaGame.js';

/**
 * The arena, with a match that decides when a choice may be made: once a
 * player has an avatar they are racing, and the car they have is the car
 * they keep.
 */
export default defineMatch({
  input: INPUT,
  game: GAME_OPTIONS,
  sendEvery: 1,
  async setup(game) {
    registerArena(game);
    await game.sceneManager.switchTo('arena');
  },
  join(game, player) {
    player.state.charms = 0;
    player.avatar = game.spawn({
      type: 'Player', x: 300, y: 640, width: 32, height: 48,
      physics: { bodyType: 'dynamic', lockRotation: true, friction: 0.6 }, playerId: player.id
    });
  },
  choose: (game, player, name, value) => {
    // A match whose answer blows up refuses; it does not end for everyone.
    if (value === 'sprint') throw new Error('boom');
    return !player.avatar;
  }
});
