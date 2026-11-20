import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * `prefabs.*.physics.mass`: an absolute mass on the body instead of the
 * density-derived one, in both dimensions. The physics layer always took a
 * `mass` spec; this holds the scene field all the way through to it.
 */

class Box extends Entity {}

const level = (dimensions, physics) => ({
  version: SCENE_VERSION, type: 'level', name: 'mass',
  world: dimensions === 3
    ? { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } }
    : { width: 200, height: 200, gravity: { x: 0, y: 0 } },
  prefabs: { box: { actor: 'Box', physics: { bodyType: 'dynamic', ...physics } } },
  layers: [{ name: 'main', objects: [
    dimensions === 3
      ? { id: 'b', prefab: 'box', x: 0, y: 1, z: 0, width: 0.4, height: 0.4, depth: 0.4 }
      : { id: 'b', prefab: 'box', x: 50, y: 50, width: 20, height: 20 }
  ] }]
});

async function body(dimensions, physics) {
  const game = new M2D(null, { headless: true, ...(dimensions === 3 ? { dimensions: 3 } : {}), worldWidth: 200, worldHeight: 200, seed: 1 });
  game.registerActor('Box', Box);
  game.sceneManager.addScene('mass', { fetch: async () => level(dimensions, physics) });
  await game.sceneManager.switchTo('mass');
  return game.sceneManager.getCurrentScene().entitiesById.get('b').body;
}

beforeAll(async () => {
  await initPhysics();
  await initPhysics({ dimensions: 3 });
});

describe('a prefab\'s mass', () => {
  it('sets the 2D body\'s absolute mass', async () => {
    expect((await body(2, { mass: 12 })).mass).toBeCloseTo(12, 4);
  });

  it('sets the 3D body\'s absolute mass in kg', async () => {
    expect((await body(3, { mass: 7.5 })).mass).toBeCloseTo(7.5, 4); // Rapier reports float32
  });

  it('without it the mass still follows density and size', async () => {
    const derived = await body(2, {});
    expect(derived.mass).toBeGreaterThan(0);
    expect(derived.mass).not.toBe(12);
  });
});
