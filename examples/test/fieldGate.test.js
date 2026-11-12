import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register, GAME } from '../src/drift/game.js';

/**
 * Salvage Run's gate as scene rules, headless with the real field: sealed
 * and turning the ship back until every pod is taken, then the jump out.
 */

const FIELD = JSON.parse(readFileSync(new URL('../src/drift/scenes/field.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function field() {
  const game = new M2D(null, { headless: true, ...GAME, seed: 7 });
  register(game);
  game.sceneManager.addScene('field', { fetch: async () => FIELD });
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: FIELD.version, type: 'level', name: 'mainMenu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('field');
  game.setupCollisionHandlers();
  return { game, scene: game.sceneManager.getCurrentScene() };
}

function run(game, ticks) {
  expect(game.step(ticks)).toBe(ticks);
}

function flyTo(game, x, y) {
  game.player.body.setPosition({ x, y });
  game.player.body.setVelocity({ x: 0, y: 0 });
  run(game, 2);
}

describe('Salvage Run\'s gate', () => {
  it('stays sealed and keeps the ship in the field until the salvage is in, then jumps', async () => {
    const { game, scene } = await field();
    const gate = scene.entitiesById.get('gate-1');
    flyTo(game, 6200, 800);
    run(game, 300);
    expect(gate.sealed).toBe(true);
    expect(game.sceneManager.loading).toBe(false);

    flyTo(game, 1000, 6000);
    for (const [id, pod] of scene.entitiesById) {
      if (!id.startsWith('salvage-')) continue;
      pod.dead = true;
      game.entities.delete(pod);
      game.physics.remove(pod.body);
    }
    run(game, 2);
    expect(gate.sealed).toBe(false);

    flyTo(game, 6200, 800);
    run(game, 140);
    expect(game.sceneManager.getCurrentScene()).toBe(scene);
    game.step(10);
    await new Promise((settle) => setTimeout(settle, 0));
    expect(game.sceneManager.getCurrentScene().config.name).toBe('mainMenu');
    game.destroy();
  });
});
