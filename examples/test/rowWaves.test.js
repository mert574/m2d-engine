import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register } from '../src/belt/game.js';

/**
 * Ash Row's waves as scene data, played headless with the real scene and
 * cast: each section's thugs wait sealed until the player walks into its
 * zone, and only once the section before is cleared; the door lets the
 * player out only when the whole row is clear.
 */

const ROW = JSON.parse(readFileSync(new URL('../src/belt/scenes/row.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function row() {
  const game = new M2D(null, { headless: true, seed: 5 });
  register(game);
  game.sceneManager.addScene('row', { fetch: async () => ROW });
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: ROW.version, type: 'level', name: 'mainMenu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('row');
  game.setupCollisionHandlers();
  const scene = game.sceneManager.getCurrentScene();
  const section = (n) => [...scene.entitiesById].filter(([id]) => id.startsWith(`s${n}-`)).map(([, entity]) => entity);
  return { game, scene, section };
}

/**
 * Run ticks, and insist they all ran: a game stops ticking while a scene
 * loads, so a stray switch would otherwise freeze the test into passing.
 */
function run(game, ticks) {
  expect(game.step(ticks)).toBe(ticks);
}

/** Put the rogue somewhere, still, and let the contacts settle. */
function walkTo(game, x, y = 200) {
  game.player.body.setPosition({ x, y });
  game.player.body.setVelocity({ x: 0, y: 0 });
  run(game, 2);
}

function clear(game, thugs) {
  for (const thug of thugs) thug.getConstraint('health').takeDamage(10_000);
  run(game, 2);
}

describe('Ash Row\'s waves', () => {
  it('places every section, the first awake and the rest sealed out of play', async () => {
    const { game, section } = await row();
    expect([1, 2, 3, 4, 5].map((n) => section(n).length)).toEqual([2, 3, 4, 6, 6]);
    expect(section(1).every((thug) => !thug.sealed)).toBe(true);
    for (const thug of section(2)) {
      expect(thug.sealed).toBe(true);
      expect(thug.visible).toBe(false);
      expect(thug.body.collisionFilter.mask).toBe(0);
    }
    game.destroy();
  });

  it('wakes a section in its zone only once the one before is cleared', async () => {
    const { game, section } = await row();
    const zone2 = 1900 - 320 + 100;
    walkTo(game, zone2);
    expect(section(2).every((thug) => thug.sealed)).toBe(true);

    walkTo(game, 240);
    clear(game, section(1));
    walkTo(game, zone2);
    expect(section(2).every((thug) => !thug.sealed && thug.visible)).toBe(true);
    expect(section(2).every((thug) => thug.body.collisionFilter.mask !== 0)).toBe(true);
    expect(section(3).every((thug) => thug.sealed)).toBe(true);
    game.destroy();
  });

  it('opens the door when the row is clear, and only then', async () => {
    const { game, section } = await row();
    walkTo(game, 5080);
    run(game, 240);
    expect(game.sceneManager.loading).toBe(false);
    expect(game.sceneManager.getCurrentScene().config.name).toBe('row');

    const locks = [1900, 2900, 3900, 4800];
    clear(game, section(1));
    locks.forEach((lock, k) => {
      walkTo(game, lock - 320 + 100);
      clear(game, section(k + 2));
    });
    expect(game.sceneManager.loading).toBe(false);
    walkTo(game, 5080);
    run(game, 179);
    expect(game.sceneManager.getCurrentScene().config.name).toBe('row');
    game.step(2);
    await new Promise((settle) => setTimeout(settle, 0));
    expect(game.sceneManager.getCurrentScene().config.name).toBe('mainMenu');
    game.destroy();
  });
});
