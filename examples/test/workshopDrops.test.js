import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { projectOptions } from 'm2d-engine/core/project.js';
import { register } from '../src/physics/game.js';

/**
 * The physics playground played headless with the real scene: a press of
 * the drop action spawns one of the spout's stock, the gravity keys turn a
 * counter the world's gravity follows within its bounds, and Escape leaves
 * for the menu — the project's actions and the scene's rules alone.
 */

const WORKSHOP = JSON.parse(readFileSync(new URL('../src/physics/scenes/workshop.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/physics/m2d.project.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function workshop() {
  const game = new M2D(null, { ...projectOptions(PROJECT), headless: true, seed: 2 });
  register(game);
  game.sceneManager.addScene('workshop', { fetch: async () => WORKSHOP });
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: WORKSHOP.version, type: 'level', name: 'mainMenu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('workshop');
  game.setupCollisionHandlers();
  let pressed = [];
  game.input.setSnapshotSource(() => ({ down: pressed, pressed }));
  /** One tick with these keys going down, then a quiet one. */
  const press = (...codes) => {
    pressed = codes;
    expect(game.step(1)).toBe(1);
    pressed = [];
    game.step(1);
  };
  return { game, scene: game.sceneManager.getCurrentScene(), press };
}

const stock = new Set(WORKSHOP.prefabs.spout.properties.stock.map((item) => item.prefab));

describe('the playground, played through', () => {
  it('drops one of the spout\'s stock into the funnel on the drop action', async () => {
    const { game, press } = await workshop();
    const before = game.entities.size;
    press('Space');
    const dropped = [...game.entities].filter((entity) => entity.prefab && !WORKSHOP.layers.some((layer) => layer.objects.some((object) => object.id === entity.sceneId)));
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
    const { game, press } = await workshop();
    press('Escape');
    await new Promise((done) => setTimeout(done, 0));
    expect(game.sceneManager.getCurrentScene().config.name).toBe('mainMenu');
    game.destroy();
  });
});
