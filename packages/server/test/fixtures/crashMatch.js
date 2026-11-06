import { defineMatch } from 'm2d-server';
import { Platform } from 'm2d-engine/actors/platform.js';
import { INPUT, GAME_OPTIONS, registerArena } from './arenaGame.js';

// A match that goes wrong 30 ticks in, if it is called 'bad': crash.
const hoard = [];
export default defineMatch({
  input: INPUT,
  game: GAME_OPTIONS,
  maxEntities: 200,
  async setup(game, { matchId }) {
    registerArena(game, {
      onFixedUpdate() {
        // Only the match called 'bad' goes wrong; any other runs normally.
        if (matchId !== 'bad' || game.time.steps < 30) return;
        const kind = 'crash';
        if (kind === 'crash') throw new Error('game code bug');
        if (kind === 'loop') for (;;) { /* stuck */ }
        if (kind === 'memory') for (let i = 0; i < 50; i++) hoard.push(new Array(1e5).fill(Math.random()));
        if (kind === 'spawn') for (let i = 0; i < 20; i++) game.spawn({ type: 'Platform', x: 10 * i, y: 10, width: 4, height: 4, physics: { bodyType: 'static' } });
      }
    });
    await game.sceneManager.switchTo('arena');
  },
  join(game, player) {
    player.avatar = game.spawn({ type: 'Player', x: 400, y: 640, width: 32, height: 48, physics: { bodyType: 'dynamic' }, playerId: player.id });
  }
});
