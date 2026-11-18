import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { GravityDial } from '../src/actors.js';

/** The world's gravity along one axis, following a counter the rules turn. */

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

class Bell extends Entity {}

function level({ dimensions = 2, counters = { pull: { initial: 400, min: 0, max: 900 } }, dial = { counter: 'pull' } } = {}) {
  const three = dimensions === 3;
  return {
    version: SCENE_VERSION, type: 'level', name: 'dial',
    world: {
      dimensions, gravity: three ? { x: 0, y: -9.81, z: 0 } : { x: 0, y: 1000 }, counters,
      rules: [{ when: { event: 'emit', name: 'heavier' }, once: false, then: [{ do: 'count', counter: 'pull', add: 300 }] }]
    },
    prefabs: {
      dial: { actor: 'GravityDial', physics: { bodyType: 'static', isSensor: true, layer: 'none' }, properties: dial },
      bell: { actor: 'Bell', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'main', objects: [
      { id: 'dial-1', prefab: 'dial', x: 0, y: 0, width: 1, height: 1, ...(three && { z: 0, depth: 1 }) },
      { id: 'bell', prefab: 'bell', x: 50, y: 50, width: 1, height: 1, ...(three && { z: 0, depth: 1 }) }
    ] }]
  };
}

async function play(scene, dimensions = 2) {
  const game = new M2D(null, { headless: true, dimensions, worldWidth: 400, worldHeight: 300 });
  game.registerActor('GravityDial', GravityDial, { origin: 'kit' });
  game.registerActor('Bell', Bell);
  game.sceneManager.addScene(scene.name, { fetch: async () => scene });
  await game.sceneManager.switchTo(scene.name);
  return { game, scene: game.sceneManager.getCurrentScene() };
}

describe('GravityDial', () => {
  it('sets gravity from the counter, follows a rule that turns it, and stops at its ceiling', async () => {
    const { game, scene } = await play(level());
    game.step(1);
    expect(game.physics.gravity.y).toBe(400);
    const ring = () => { scene.entitiesById.get('bell').fixedUpdate = function () { this.game.events.emit('heavier'); this.fixedUpdate = () => {}; }; };
    ring();
    // The rule turns the counter in one tick; the dial follows it in the next.
    game.step(2);
    expect(scene.counters.get('pull')).toBe(700);
    expect(game.physics.gravity.y).toBe(700);
    ring();
    game.step(2);
    ring();
    game.step(2);
    expect(game.physics.gravity.y).toBe(900);
    // The axis nobody dialled is left where the world put it.
    expect(game.physics.gravity.x).toBe(0);
    game.destroy();
  });

  it('turns another axis, in 3D too', async () => {
    const { game } = await play(level({ dimensions: 3, counters: { pull: { initial: -3 } }, dial: { counter: 'pull', axis: 'z' } }), 3);
    game.step(1);
    expect(game.physics.gravity).toMatchObject({ x: 0, y: -9.81, z: -3 });
    game.destroy();
  });

  it('refuses a counter the level does not declare, naming it', async () => {
    const error = await play(level({ dial: { counter: 'push' } })).then(() => null, (e) => e);
    expect(error?.message).toMatch(/properties\.counter.*push/);
  });

  it('collides with nothing and keeps no mesh', async () => {
    const { game, scene } = await play(level({ dimensions: 3, counters: { pull: { initial: -3 } } }), 3);
    const dial = scene.entitiesById.get('dial-1');
    expect(dial.mesh).toBeNull();
    expect(dial.body.collisionFilter).toMatchObject({ category: 0, mask: 0 });
    game.destroy();
  });
});
