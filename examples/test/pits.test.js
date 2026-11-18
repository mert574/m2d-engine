import { describe, it, expect } from 'vitest';
import { playHeadless } from './helpers.js';

/**
 * Nothing implicit ends a level: falling out of one is game over because
 * the level placed a pit under itself and a rule on entering it. Ember
 * Valley's fall is in valleyRun.test.js; these are the walkthrough's level
 * and the 2D template's, played headless from their own files.
 */

const LEVELS = [
  { name: 'the first-game walkthrough', folder: '../../docs/demos/first-game', scene: 'level1' },
  { name: 'the 2D template', folder: '../../packages/editor-host/templates/2d', scene: 'level' }
];

describe.each(LEVELS)('$name', ({ folder, scene }) => {
  it('plays on where it starts, and is game over once the player falls into its pit', async () => {
    const play = await playHeadless(folder, scene);
    play.run(30);
    expect(play.game.isGameOver).toBe(false);
    const pit = play.placed('pit');
    expect(pit, 'a pit placed under the level').toHaveLength(1);
    play.standAt({ x: play.data.world.width / 2, y: play.data.world.height + 260 });
    expect(play.game.isGameOver).toBe(true);
    play.game.destroy();
  });
});
