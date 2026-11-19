import { defineMatch } from 'm2d-server';
import { INPUT, GAME_OPTIONS, registerWatch } from './watchGame.mjs';

export default defineMatch({
  input: INPUT,
  game: GAME_OPTIONS,
  maxPlayers: 1,
  sendEvery: 1,
  async setup(game) {
    registerWatch(game);
    await game.sceneManager.switchTo('watch');
  },
  join(game, player) {
    player.avatar = game.spawn({
      type: 'Hero', x: 560, y: 200, width: 16, height: 16,
      physics: { bodyType: 'dynamic', layer: 'player', lockRotation: true },
      playerId: player.id
    });
  }
});
