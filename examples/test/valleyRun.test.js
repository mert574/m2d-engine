import { describe, it, expect } from 'vitest';
import { playHeadless } from './helpers.js';

/**
 * Ember Valley played headless with the real scene and cast: the coins
 * are the level's objective, the gate at the top ends it, a fall or a
 * death is game over, and Escape is the way back to the menu — all of it
 * the scene file's rules, with no code of the game's own in between.
 */

const valley = () => playHeadless('platformer', 'level1', { seed: 3 });

describe('Ember Valley, played through', () => {
  it('takes every coin, and only then calls the gate the objective', async () => {
    const { game, scene, placed, rule, standAt } = await valley();
    const coins = placed('coin');
    expect(coins.length).toBe(6);
    expect(rule('collected').fired).toBe(false);

    for (const coin of coins.slice(0, -1)) standAt(coin);
    expect([...game.entities].filter((entity) => entity.prefab === 'coin' && !entity.dead).length).toBe(1);
    expect(rule('collected').fired).toBe(false);

    standAt(coins.at(-1));
    expect([...game.entities].some((entity) => entity.prefab === 'coin' && !entity.dead)).toBe(false);
    expect(rule('collected').fired).toBe(true);
    expect(scene.rules.rules.filter((candidate) => candidate.fired).length).toBe(1);
    game.destroy();
  });

  it('ends at the gate: the menu, as many seconds after the player reaches it as the rule says', async () => {
    const { game, placed, standAt, run, switchDelay, current, settled } = await valley();
    const [gate] = placed('trigger');
    standAt(gate);
    // The rule fired within the stand; its switch waits its delay from then.
    run(switchDelay('enter') - 10);
    expect(current()).toBe('level1');
    game.step(15);
    await settled();
    expect(current()).toBe('mainMenu');
    game.destroy();
  });

  it('is game over when the player dies, and when they fall out of the valley', async () => {
    const dying = await valley();
    dying.game.player.getConstraint('health').takeDamage(10_000);
    dying.run(2);
    expect(dying.game.isGameOver).toBe(true);
    dying.game.destroy();

    const falling = await valley();
    falling.standAt({ x: 300, y: falling.data.world.height + 200 });
    expect(falling.game.isGameOver).toBe(true);
    falling.game.destroy();
  });

  it('returns to the menu on Escape, the project\'s menu action', async () => {
    const { game, press, current, settled } = await valley();
    press('Escape');
    await settled();
    expect(current()).toBe('mainMenu');
    game.destroy();
  });
});
