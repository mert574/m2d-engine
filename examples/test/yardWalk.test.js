import { describe, it, expect } from 'vitest';
import { playHeadless } from './helpers.js';

/**
 * The Yard played headless, in three dimensions, with the real scene: the
 * fox walks the way the view faced when the tick was sampled (the
 * snapshot's heading, never the camera), shoves a crate, turns the
 * afternoon to dusk on T, and leaves for the menu on Escape.
 */

const yard = () => playHeadless('yard', 'yard');

describe('The Yard, walked through', () => {
  it('walks the fox the way the view faces, from the heading the tick was sampled with', async () => {
    const { game, run, hold } = await yard();
    const fox = game.player;
    run(10);
    const start = { ...fox.position };
    hold(['KeyW'], 60, 0);
    const ahead = { ...fox.position };
    expect(ahead.z - start.z).toBeGreaterThan(1);
    expect(Math.abs(ahead.x - start.x)).toBeLessThan(0.2);

    hold(['KeyW'], 60, Math.PI / 2);
    expect(fox.position.x - ahead.x).toBeGreaterThan(1);
    expect(Math.abs(fox.position.z - ahead.z)).toBeLessThan(0.2);
    game.destroy();
  });

  it('shoves a crate out of its place', async () => {
    const { game, scene, run, hold } = await yard();
    const crate = scene.entitiesById.get('crate-6');
    run(30);
    const rest = { ...crate.position };
    game.player.body.setPosition({ x: rest.x, y: 1, z: rest.z + 1.6 });
    hold(['KeyW'], 90, Math.PI);
    expect(Math.hypot(crate.position.x - rest.x, crate.position.z - rest.z)).toBeGreaterThan(0.3);
    game.destroy();
  });

  it('turns the afternoon to dusk and back on T, the project\'s turn action', async () => {
    const { game, scene, press } = await yard();
    expect(scene.cycle.target).toBe(0);
    press('KeyT');
    expect(scene.cycle.target).toBe(1);
    press('KeyT');
    expect(scene.cycle.target).toBe(0);
    game.destroy();
  });

  it('returns to the menu on Escape', async () => {
    const { game, press, current, settled } = await yard();
    press('Escape');
    await settled();
    expect(current()).toBe('mainMenu');
    game.destroy();
  });
});
