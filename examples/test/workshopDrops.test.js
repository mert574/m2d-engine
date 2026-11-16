import { describe, it, expect } from 'vitest';
import { playHeadless } from './helpers.js';

/**
 * The physics playground played headless with the real scene: a press of
 * the drop action spawns one of the spout's stock, the gravity keys turn a
 * counter the world's gravity follows within its bounds, and Escape leaves
 * for the menu — the project's actions and the scene's rules alone.
 */

const workshop = () => playHeadless('physics', 'workshop', { seed: 2 });

describe('the playground, played through', () => {
  it('drops one of the spout\'s stock into the funnel on the drop action', async () => {
    const { game, data, press } = await workshop();
    const stock = new Set(data.prefabs.spout.properties.stock.map((item) => item.prefab));
    const placedIds = new Set(data.layers.flatMap((layer) => layer.objects).map((object) => object.id));
    const before = game.entities.size;
    press('Space');
    const dropped = [...game.entities].filter((entity) => entity.prefab && !placedIds.has(entity.sceneId));
    expect(game.entities.size).toBe(before + 1);
    expect(dropped.length).toBe(1);
    expect(stock.has(dropped[0].prefab)).toBe(true);
    expect(dropped[0].position.y).toBeLessThan(100);
    press('Space');
    press('Space');
    expect(game.entities.size).toBe(before + 3);
    game.destroy();
  });

  it('turns gravity with the arrow keys, within the counter\'s bounds, and G brings it back to earth', async () => {
    const { game, scene, press } = await workshop();
    expect(scene.counters.get('gravity')).toBe(1000);
    expect(game.physics.gravity.y).toBe(1000);
    press('ArrowDown');
    press('ArrowDown');
    expect(scene.counters.get('gravity')).toBe(1400);
    expect(game.physics.gravity.y).toBe(1400);
    for (let i = 0; i < 12; i++) press('ArrowDown');
    expect(scene.counters.get('gravity')).toBe(3000);
    expect(game.physics.gravity.y).toBe(3000);
    for (let i = 0; i < 20; i++) press('ArrowUp');
    expect(game.physics.gravity.y).toBe(0);
    press('KeyG');
    expect(scene.counters.get('gravity')).toBe(1000);
    expect(game.physics.gravity.y).toBe(1000);
    game.destroy();
  });

  it('returns to the menu on Escape', async () => {
    const { game, press, current, settled } = await workshop();
    press('Escape');
    await settled();
    expect(current()).toBe('mainMenu');
    game.destroy();
  });
});
