import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Chase } from '../src/constraints/chase.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * Chase's third axis: in a 3D scene the hunt and the wander walk the
 * (x, z) ground plane and leave the body its vertical speed, so a chaser
 * neither flies at its quarry nor hovers over the floor.
 */

class Hero extends Entity { name = 'Hero'; }
class Hound extends Entity {
  name = 'Hound';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('chase', new Chase(this, { speed: 3, idleSpeed: 1, detectionRange: 18, wanderRadius: 2 }));
  }
}

const LEVEL = {
  version: SCENE_VERSION, type: 'level', name: 'yard3d',
  world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 }, player: 'hero' },
  prefabs: {
    ground: { actor: 'Prop', physics: { bodyType: 'static' } },
    hero: { actor: 'Hero', physics: { bodyType: 'character', shape: 'capsule', lockRotation: true } },
    hound: { actor: 'Hound', physics: { bodyType: 'dynamic', shape: 'capsule', lockRotation: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'ground', x: 0, y: -0.1, z: 0, width: 20, height: 0.2, depth: 20 },
    { id: 'hero', prefab: 'hero', x: 5, y: 1, z: 6, width: 0.6, height: 1.8 },
    { id: 'hound', prefab: 'hound', x: -4, y: 1, z: -5, width: 0.6, height: 1.6 }
  ] }]
};

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

describe('Chase in 3D', () => {
  it('closes in on the ground plane and never flies', async () => {
    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 3 });
    game.registerActor('Hero', Hero);
    game.registerActor('Hound', Hound);
    game.sceneManager.addScene('yard3d', { fetch: async () => structuredClone(LEVEL) });
    await game.sceneManager.switchTo('yard3d');

    const scene = game.sceneManager.getCurrentScene();
    const hound = scene.entitiesById.get('hound');
    const hero = scene.entitiesById.get('hero');
    const apart = () => Math.hypot(hound.position.x - hero.position.x, hound.position.z - hero.position.z);
    const start = apart();

    game.step(240);
    expect(apart()).toBeLessThan(start - 5);
    // On the floor the whole way: a 2D-minded chase sets the vertical
    // velocity and launches the hound at the hero's chest.
    expect(hound.position.y).toBeLessThan(1.5);
    expect(hound.position.y).toBeGreaterThan(0);
    game.destroy();
  });
});
