import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register, GAME } from '../src/oblique/game.js';

/**
 * What the grove holds still, held still, headless with the real scene: a
 * walker in conversation does not move or swing while its cooldowns run
 * at their own pace, and a warded wisp is driven off rather than chasing.
 */

const GROVE = JSON.parse(readFileSync(new URL('../src/oblique/scenes/grove.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function grove() {
  const game = new M2D(null, { headless: true, ...(GAME ?? {}), seed: 3 });
  register(game);
  game.sceneManager.addScene('grove', { fetch: async () => GROVE });
  await game.sceneManager.switchTo('grove');
  game.setupCollisionHandlers();
  return game;
}

/** How many times each of an entity's constraints ticks over `ticks`. */
function tickCounts(game, entity, ticks) {
  const counts = {};
  for (const [slot, constraint] of entity.constraints) {
    counts[slot] = 0;
    const tick = constraint.fixedUpdate.bind(constraint);
    constraint.fixedUpdate = (dt) => { counts[slot]++; tick(dt); };
  }
  expect(game.step(ticks)).toBe(ticks);
  return counts;
}

describe('the grove, held still', () => {
  it('freezes a walker in conversation: no movement or attack, cooldowns at their own pace', async () => {
    const game = await grove();
    game.player.frozen = true;
    const counts = tickCounts(game, game.player, 10);
    expect(counts.control).toBe(0);
    expect(counts.attack).toBe(0);
    expect(counts.abilities).toBe(10);
    expect(counts.health).toBe(10);
    game.destroy();
  });

  it('drives a warded wisp off at its repel speed, its chase suspended', async () => {
    const game = await grove();
    const wisp = [...game.entities].find((entity) => entity.constructor.name === 'Wisp');
    game.player.body.setPosition({ x: wisp.position.x - 60, y: wisp.position.y });
    game.step(2);
    const before = Math.hypot(wisp.position.x - game.player.position.x, wisp.position.y - game.player.position.y);
    wisp.repelled = 1;
    const counts = tickCounts(game, wisp, 30);
    const after = Math.hypot(wisp.position.x - game.player.position.x, wisp.position.y - game.player.position.y);
    expect(counts.chase).toBe(0);
    expect(counts.health).toBe(30);
    expect(after - before).toBeGreaterThan(wisp.repelSpeed * 0.5 * 0.8);
    game.destroy();
  });
});
