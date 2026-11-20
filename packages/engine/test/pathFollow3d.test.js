import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * PathFollow in metres: the arrive radius is a step, not a px-minded unit.
 * At 1 whole metre the cart "arrived" early and the snap to the exact
 * point was a visible jump — The Court's cart did exactly that.
 */

const LEVEL = {
  version: SCENE_VERSION, type: 'level', name: 'track3d',
  world: { dimensions: 3, gravity: { x: 0, y: 0, z: 0 } },
  prefabs: {
    cart: {
      actor: 'Prop', physics: { bodyType: 'kinematic' },
      constraints: { patrol: { type: 'PathFollow', params: { path: 'rounds', speed: 1.2, waitTime: 100 } } }
    }
  },
  layers: [{ name: 'main', objects: [
    { id: 'cart', prefab: 'cart', x: -2, y: 0.5, z: -3, width: 1.6, height: 1, depth: 1.6 }
  ] }],
  paths: { rounds: { points: [{ x: -2, y: 0.5, z: -3 }, { x: -2, y: 0.5, z: 3 }], closed: true } }
};

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

describe('PathFollow in 3D', () => {
  it('glides through its stops: no tick moves the body further than its speed allows', async () => {
    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 2 });
    game.sceneManager.addScene('track3d', { fetch: async () => structuredClone(LEVEL) });
    await game.sceneManager.switchTo('track3d');
    const cart = game.sceneManager.getCurrentScene().entitiesById.get('cart');

    let last = { ...cart.position };
    let travelled = 0;
    const limit = 1.2 * (1 / 60) * 1.5 + 0.03; // cruise speed per tick, with slack for the arrival snap
    for (let i = 0; i < 60 * 20; i++) {
      game.step(1);
      const now = cart.position;
      const moved = Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z);
      expect(moved, `tick ${i}`).toBeLessThanOrEqual(limit);
      travelled += moved;
      last = { ...now };
    }
    // And it did make its rounds rather than standing immaculately still.
    expect(travelled).toBeGreaterThan(10);
    game.destroy();
  });
});
