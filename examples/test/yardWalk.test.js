import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { projectOptions } from 'm2d-engine/core/project.js';
import { register, GAME } from '../src/yard/game.js';

/**
 * The Yard played headless, in three dimensions, with the real scene: the
 * fox walks the way the view faced when the tick was sampled (the
 * snapshot's heading, never the camera), shoves a crate, turns the
 * afternoon to dusk on T, and leaves for the menu on Escape.
 */

const YARD = JSON.parse(readFileSync(new URL('../src/yard/scenes/yard.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/yard/m2d.project.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

async function yard() {
  const game = new M2D(null, { ...GAME, ...projectOptions(PROJECT), headless: true, seed: 1 });
  register(game);
  game.sceneManager.addScene('yard', { fetch: async () => YARD });
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: YARD.version, type: 'level', name: 'mainMenu', world: { dimensions: 3 }, prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('yard');
  game.setupCollisionHandlers();
  const scene = game.sceneManager.getCurrentScene();
  let held = { down: [], pressed: [], heading: 0 };
  game.input.setSnapshotSource(() => held);
  const walk = (codes, heading, ticks) => {
    held = { down: codes, pressed: [], heading };
    expect(game.step(ticks)).toBe(ticks);
    held = { down: [], pressed: [], heading };
  };
  const press = (code) => {
    held = { down: [code], pressed: [code], heading: 0 };
    expect(game.step(1)).toBe(1);
    held = { down: [], pressed: [], heading: 0 };
    game.step(1);
  };
  return { game, scene, walk, press, fox: game.player, at: (id) => scene.entitiesById.get(id) };
}

describe('The Yard, walked through', () => {
  it('walks the fox the way the view faces, from the heading the tick was sampled with', async () => {
    const { game, fox, walk } = await yard();
    expect(game.step(10)).toBe(10);
    const start = { ...fox.position };
    walk(['KeyW'], 0, 60);
    const ahead = { ...fox.position };
    expect(ahead.z - start.z).toBeGreaterThan(1);
    expect(Math.abs(ahead.x - start.x)).toBeLessThan(0.2);

    walk(['KeyW'], Math.PI / 2, 60);
    expect(fox.position.x - ahead.x).toBeGreaterThan(1);
    expect(Math.abs(fox.position.z - ahead.z)).toBeLessThan(0.2);
    game.destroy();
  });

  it('shoves a crate out of its place', async () => {
    const { game, fox, walk, at } = await yard();
    const crate = at('crate-6');
    expect(game.step(30)).toBe(30);
    const rest = { ...crate.position };
    fox.body.setPosition({ x: rest.x, y: 1, z: rest.z + 1.6 });
    walk(['KeyW'], Math.PI, 90);
    const moved = Math.hypot(crate.position.x - rest.x, crate.position.z - rest.z);
    expect(moved).toBeGreaterThan(0.3);
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
    const { game, press } = await yard();
    press('Escape');
    await new Promise((done) => setTimeout(done, 0));
    expect(game.sceneManager.getCurrentScene().config.name).toBe('mainMenu');
    game.destroy();
  });
});
