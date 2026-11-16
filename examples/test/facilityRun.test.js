import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { projectOptions } from 'm2d-engine/core/project.js';
import { register } from '../src/topdown/game.js';

/**
 * The Facility played headless with the real scene and cast: the data
 * cores are the objective, the extraction pad ends the level, a dead
 * operative is game over, and Escape leaves for the menu — the scene
 * file's rules, run over three hundred placed things.
 */

const LEVEL = JSON.parse(readFileSync(new URL('../src/topdown/scenes/level1.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/topdown/m2d.project.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function facility() {
  const game = new M2D(null, { ...projectOptions(PROJECT), headless: true, seed: 8 });
  register(game);
  game.sceneManager.addScene('level1', { fetch: async () => LEVEL });
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: LEVEL.version, type: 'level', name: 'mainMenu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('level1');
  game.setupCollisionHandlers();
  const scene = game.sceneManager.getCurrentScene();
  const placed = (prefab) => LEVEL.layers.flatMap((layer) => layer.objects).filter((object) => object.prefab === prefab);
  const rule = (event) => scene.rules.rules.find((candidate) => candidate.when.event === event);
  return { game, scene, placed, rule };
}

function run(game, ticks) {
  expect(game.step(ticks)).toBe(ticks);
}

function standAt(game, { x, y }) {
  game.player.body.setPosition({ x, y });
  game.player.body.setVelocity({ x: 0, y: 0 });
  run(game, 3);
}

const current = (game) => game.sceneManager.getCurrentScene().config.name;
const settled = () => new Promise((done) => setTimeout(done, 0));

describe('The Facility, played through', () => {
  it('places the whole level and recovers every core before the pad becomes the objective', async () => {
    const { game, placed, rule } = await facility();
    expect(game.entities.size).toBeGreaterThan(250);
    const cores = placed('coin');
    expect(cores.length).toBe(34);
    for (const core of cores) standAt(game, core);
    expect([...game.entities].some((entity) => entity.prefab === 'coin' && !entity.dead)).toBe(false);
    expect(rule('collected').fired).toBe(true);
    game.destroy();
  });

  it('extracts at the pad and returns to the menu three seconds later', async () => {
    const { game, placed } = await facility();
    const [pad] = placed('trigger');
    standAt(game, pad);
    // The rule fired on the first contact; its switch comes three seconds later.
    run(game, 170);
    expect(current(game)).toBe('level1');
    game.step(15);
    await settled();
    expect(current(game)).toBe('mainMenu');
    game.destroy();
  });

  it('is game over when the operative dies', async () => {
    const { game } = await facility();
    game.player.getConstraint('health').takeDamage(10_000);
    run(game, 2);
    expect(game.isGameOver).toBe(true);
    game.destroy();
  });

  it('returns to the menu on Escape', async () => {
    const { game } = await facility();
    let pressed = [];
    game.input.setSnapshotSource(() => ({ down: pressed, pressed }));
    run(game, 2);
    pressed = ['Escape'];
    game.step(1);
    pressed = [];
    await settled();
    expect(current(game)).toBe('mainMenu');
    game.destroy();
  });
});
