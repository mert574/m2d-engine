import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { projectOptions } from 'm2d-engine/core/project.js';
import { register } from '../src/platformer/game.js';

/**
 * Ember Valley played headless with the real scene and cast: the coins
 * are the level's objective, the gate at the top ends it, a fall or a
 * death is game over, and Escape is the way back to the menu — all of it
 * the scene file's rules, with no code of the game's own in between.
 */

const LEVEL = JSON.parse(readFileSync(new URL('../src/platformer/scenes/level1.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/platformer/m2d.project.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function valley() {
  const game = new M2D(null, { ...projectOptions(PROJECT), headless: true, seed: 3 });
  register(game);
  game.sceneManager.addScene('level1', { fetch: async () => LEVEL });
  // A headless game has no UI, so the menu stands in as an empty level.
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: LEVEL.version, type: 'level', name: 'mainMenu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('level1');
  game.setupCollisionHandlers();
  const scene = game.sceneManager.getCurrentScene();
  const placed = (prefab) => LEVEL.layers.flatMap((layer) => layer.objects).filter((object) => object.prefab === prefab);
  const rule = (event) => scene.rules.rules.find((candidate) => candidate.when.event === event);
  return { game, scene, placed, rule };
}

/** Run ticks, and insist they all ran: a game stops ticking while a scene loads. */
function run(game, ticks) {
  expect(game.step(ticks)).toBe(ticks);
}

/** Put the player somewhere, still, and let the contacts register. */
function standAt(game, { x, y }) {
  game.player.body.setPosition({ x, y });
  game.player.body.setVelocity({ x: 0, y: 0 });
  run(game, 3);
}

const current = (game) => game.sceneManager.getCurrentScene().config.name;
const settled = () => new Promise((done) => setTimeout(done, 0));

describe('Ember Valley, played through', () => {
  it('takes every coin, and only then calls the gate the objective', async () => {
    const { game, scene, placed, rule } = await valley();
    const coins = placed('coin');
    expect(coins.length).toBe(6);
    expect(rule('collected').fired).toBe(false);

    for (const coin of coins.slice(0, -1)) standAt(game, coin);
    expect([...game.entities].filter((entity) => entity.prefab === 'coin' && !entity.dead).length).toBe(1);
    expect(rule('collected').fired).toBe(false);

    standAt(game, coins.at(-1));
    expect([...game.entities].some((entity) => entity.prefab === 'coin' && !entity.dead)).toBe(false);
    expect(rule('collected').fired).toBe(true);
    expect(scene.rules.rules.filter((candidate) => candidate.fired).length).toBe(1);
    game.destroy();
  });

  it('ends at the gate: three seconds after the player reaches it, the menu', async () => {
    const { game, placed } = await valley();
    const [gate] = placed('trigger');
    standAt(game, gate);
    // The rule fired on the first contact; its switch comes three seconds later.
    run(game, 170);
    expect(current(game)).toBe('level1');
    game.step(15);
    await settled();
    expect(current(game)).toBe('mainMenu');
    game.destroy();
  });

  it('is game over when the player dies, and when they fall out of the valley', async () => {
    const dying = await valley();
    dying.game.player.getConstraint('health').takeDamage(10_000);
    run(dying.game, 2);
    expect(dying.game.isGameOver).toBe(true);
    dying.game.destroy();

    const falling = await valley();
    standAt(falling.game, { x: 300, y: LEVEL.world.height + 200 });
    expect(falling.game.isGameOver).toBe(true);
    falling.game.destroy();
  });

  it('returns to the menu on Escape, the project\'s menu action', async () => {
    const { game } = await valley();
    let pressed = [];
    game.input.setSnapshotSource(() => ({ down: pressed, pressed }));
    run(game, 2);
    expect(current(game)).toBe('level1');
    pressed = ['Escape'];
    game.step(1);
    pressed = [];
    await settled();
    expect(current(game)).toBe('mainMenu');
    game.destroy();
  });
});
