import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Projectile } from '../src/core/projectile.js';
import { Health } from '../src/constraints/health.js';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * A projectile hurts the players' avatars by default — a capability's
 * test, not an actor's name — and anything named in `targetNames` instead;
 * what it is not aimed at, it flies past.
 */

class Mortal extends Entity {
  name = 'Mortal';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('health', new Health(this, { maxHealth: 100 }));
  }
}
class Bolt extends Projectile {}

const level = () => ({
  version: SCENE_VERSION, type: 'level', name: 'range',
  world: { width: 800, height: 400, gravity: { x: 0, y: 0 }, player: 'hero' },
  prefabs: { mortal: { actor: 'Mortal', physics: { bodyType: 'dynamic', frictionAir: 1 } } },
  layers: [{ name: 'main', objects: [
    { id: 'hero', prefab: 'mortal', x: 300, y: 100, width: 20, height: 20 },
    { id: 'bystander', prefab: 'mortal', x: 300, y: 300, width: 20, height: 20 }
  ] }]
});

beforeAll(async () => { await initPhysics(); });

async function fireAt(y, options = {}) {
  const game = new M2D(null, { headless: true, worldWidth: 800, worldHeight: 400, seed: 1 });
  game.registerActor('Mortal', Mortal);
  game.registerActor('Bolt', Bolt);
  game.sceneManager.addScene('range', { fetch: async () => level() });
  await game.sceneManager.switchTo('range');
  await game.start();
  const bolt = game.spawn({ type: 'Bolt', x: 100, y, width: 8, height: 8, physics: { bodyType: 'dynamic' }, options: { direction: { x: 1, y: 0 }, speed: 600, damage: 30, maxLifetime: 2, ...options } });
  expect(game.step(90)).toBe(90);
  const scene = game.sceneManager.getCurrentScene();
  const health = (id) => scene.entitiesById.get(id).getConstraint('health').currentHealth;
  return { game, bolt, health };
}

describe('a projectile', () => {
  it('hurts the player\'s avatar by default', async () => {
    const { game, health } = await fireAt(100);
    expect(health('hero')).toBe(70);
    expect(health('bystander')).toBe(100);
    game.destroy();
  });

  it('flies past an entity it is not aimed at', async () => {
    const { game, health, bolt } = await fireAt(300);
    expect(health('bystander')).toBe(100);
    expect(bolt.dead || !game.entities.has(bolt) || bolt.position.x > 300).toBe(true);
    game.destroy();
  });

  it('hurts what targetNames names instead', async () => {
    const { game, health } = await fireAt(300, { targetNames: ['Mortal'] });
    expect(health('bystander')).toBe(70);
    game.destroy();
  });
});
