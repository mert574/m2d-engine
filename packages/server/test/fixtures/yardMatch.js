import { defineMatch } from 'm2d-server';
import { INPUT, GAME_OPTIONS, registerYard } from './yardGame.js';

let joined = 0;
export default defineMatch({
  input: INPUT,
  game: GAME_OPTIONS,
  maxPlayers: 3,
  sendEvery: 1,
  reconnectSeconds: 1,
  async setup(game) {
    registerYard(game);
    await game.sceneManager.switchTo('yard');
  },
  join(game, player) {
    player.state = {};
    player.avatar = game.spawn({
      type: 'Hero', x: -3 + 2 * (joined++ % 3), y: 1, z: -3, width: 0.6, height: 1.8, depth: 0.6,
      physics: { bodyType: 'character', shape: 'capsule' }, playerId: player.id
    });
  }
});
