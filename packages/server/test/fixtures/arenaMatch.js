import { defineMatch } from 'm2d-server';
import { INPUT, GAME_OPTIONS, registerArena } from './arenaGame.js';

let joined = 0;
export default defineMatch({
  input: INPUT,
  game: GAME_OPTIONS,
  maxPlayers: 3,
  sendEvery: 1,
  reconnectSeconds: 1,
  async setup(game) {
    registerArena(game);
    await game.sceneManager.switchTo('arena');
  },
  join(game, player) {
    player.state = { charms: 0 };
    player.avatar = game.spawn({
      type: 'Player', x: 300 + 200 * (joined++ % 4), y: 640, width: 32, height: 48,
      physics: { bodyType: 'dynamic', lockRotation: true, friction: 0.6 }, playerId: player.id
    });
  }
});
