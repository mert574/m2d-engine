import { describe, it, expect } from 'vitest';
import { playHeadless } from './helpers.js';

/**
 * The Facility played headless with the real scene and cast: the data
 * cores are the objective, the extraction pad ends the level, a dead
 * operative is game over, and Escape leaves for the menu — the scene
 * file's rules, run over three hundred placed things.
 */

const facility = () => playHeadless('topdown', 'level1', { seed: 8 });

describe('The Facility, played through', () => {
  it('places the whole level and recovers every core before the pad becomes the objective', async () => {
    const { game, placed, rule, standAt } = await facility();
    expect(game.entities.size).toBeGreaterThan(250);
    const cores = placed('coin');
    expect(cores.length).toBe(34);
    for (const core of cores) standAt(core);
    expect([...game.entities].some((entity) => entity.prefab === 'coin' && !entity.dead)).toBe(false);
    expect(rule('collected').fired).toBe(true);
    game.destroy();
  });

  it('extracts at the pad and returns to the menu after the rule\'s delay', async () => {
    const { game, placed, standAt, run, switchDelay, current, settled } = await facility();
    const [pad] = placed('trigger');
    standAt(pad);
    run(switchDelay('enter') - 10);
    expect(current()).toBe('level1');
    game.step(15);
    await settled();
    expect(current()).toBe('mainMenu');
    game.destroy();
  });

  it('a sentry in range fires a bolt that lives long enough to hurt the operative', async () => {
    // The bolt is the facility's own round, built by hand rather than
    // through the kit's spawn, and it has to carry the same mask: one that
    // may hit the turret that fired it dies in the barrel, which reads in
    // play as sentries that never attack.
    const { game, run } = await facility();
    const turret = [...game.entities].find((entity) => entity.name === 'Turret');
    const health = game.player.getConstraint('health');
    game.player.body.setPosition({ x: turret.position.x + 60, y: turret.position.y });
    run(2);

    const bolt = [...game.entities].find((entity) => entity instanceof game.actors.get('Rocket'));
    expect(bolt, 'the sentry fired nothing').toBeTruthy();
    expect(bolt.dead, 'the bolt died on the tick it was fired').toBe(false);
    expect(bolt.body.collisionFilter.mask & turret.body.collisionFilter.category).toBe(0);

    run(20);
    expect(health.currentHealth, 'the bolt never reached the operative').toBeLessThan(health.maxHealth);
    game.destroy();
  });

  it('is game over when the operative dies', async () => {
    const { game, run } = await facility();
    game.player.getConstraint('health').takeDamage(10_000);
    run(2);
    expect(game.isGameOver).toBe(true);
    game.destroy();
  });

  it('returns to the menu on Escape', async () => {
    const { game, press, current, settled } = await facility();
    press('Escape');
    await settled();
    expect(current()).toBe('mainMenu');
    game.destroy();
  });
});
