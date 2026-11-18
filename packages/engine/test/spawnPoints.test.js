import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { s } from '../src/core/schema.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from './helpers/environment.js';

/**
 * Spawn points and the avatars made at them: what the server does when a
 * player joins, from the scene's own `world.player` object.
 */

installWindowStub();
stubDocumentListeners();

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

class Hero extends Entity {
  static properties = { speed: s.number() };
  name = 'Hero';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.speed = options.speed;
  }
}

function level({ dimensions = 2, points = [[100, 100], [200, 100]] } = {}) {
  const three = dimensions === 3;
  const place = ([x, y]) => (three ? { x, y: 0, z: y } : { x, y });
  return {
    version: SCENE_VERSION, type: 'level', name: 'join',
    world: { dimensions, gravity: three ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 }, player: 'hero' },
    prefabs: {
      hero: { actor: 'Hero', physics: { bodyType: 'dynamic' }, properties: { speed: 3 } },
      spawn: { actor: 'SpawnPoint', physics: { bodyType: 'static', isSensor: true } }
    },
    layers: [{ name: 'main', objects: [
      { id: 'hero', prefab: 'hero', ...place([10, 10]), width: 8, height: 8, properties: { speed: 5 } },
      ...points.map((p, i) => ({ id: `spawn-${i + 1}`, prefab: 'spawn', ...place(p), width: 40, height: 40, ...(three && { depth: 40 }) }))
    ] }]
  };
}

async function make(scene, options = {}) {
  const dimensions = scene.world.dimensions ?? 2;
  const game = options.display
    ? new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer: new RecordingRenderer(), devConsole: false, performanceStats: false, ...options })
    : new M2D(null, { headless: true, dimensions, ...options });
  game.registerActor('Hero', Hero);
  game.sceneManager.addScene(scene.name, { fetch: async () => scene });
  await game.sceneManager.switchTo(scene.name);
  return { game, scene: game.sceneManager.getCurrentScene() };
}

describe('spawn points', () => {
  it('make each joining avatar from the player object, at the first free point', async () => {
    const { game, scene } = await make(level());
    const [ann, bob, cat] = ['ann', 'bob', 'cat'].map((id) => game.players.add(id));
    const a = scene.spawnAvatar(ann);
    const b = scene.spawnAvatar(bob);
    expect(a.position).toMatchObject({ x: 100, y: 100 });
    expect(b.position).toMatchObject({ x: 200, y: 100 });
    // The object's own, over its prefab's, and owned by the player.
    expect(a.speed).toBe(5);
    expect(a.prefab).toBe('hero');
    expect(a.playerId).toBe('ann');
    expect(ann.avatar).toBe(a);
    expect(a.sceneId).not.toBe(b.sceneId);
    // All taken: the one with the fewest.
    expect(scene.spawnAvatar(cat).position).toMatchObject({ x: 100, y: 100 });
    // A point frees up when its avatar walks away.
    b.body.setPosition({ x: 600, y: 600 });
    expect(scene.freeSpawnPoint().sceneId).toBe('spawn-2');
    game.destroy();
  });

  it('fall back to where the player object stands, and make nothing without a player', async () => {
    const { game, scene } = await make(level({ points: [] }));
    expect(scene.freeSpawnPoint()).toBeNull();
    expect(scene.spawnAvatar(game.players.add('ann')).position).toMatchObject({ x: 10, y: 10 });
    game.destroy();
    const bare = level();
    delete bare.world.player;
    const none = await make(bare);
    expect(none.scene.spawnAvatar(none.game.players.add('ann'))).toBeNull();
    none.game.destroy();
  });

  it('work in 3D, with the third axis in their reach', async () => {
    const { game, scene } = await make(level({ dimensions: 3 }));
    const a = scene.spawnAvatar(game.players.add('ann'));
    expect(a.position).toMatchObject({ x: 100, y: 0, z: 100 });
    expect(scene.spawnAvatar(game.players.add('bob')).position).toMatchObject({ x: 200, z: 100 });
    expect(scene.entitiesById.get('spawn-1').mesh).toBeNull();
    game.destroy();
  });

  it('collide with nothing, and draw only in the editor', async () => {
    for (const editMode of [false, true]) {
      const { game, scene } = await make(level(), { display: true, editMode });
      const point = scene.entitiesById.get('spawn-1');
      expect(point.body.collisionFilter).toMatchObject({ category: 0, mask: 0 });
      game.renderer.reset();
      point.draw(0);
      expect(game.renderer.callsTo('drawArc').length > 0).toBe(editMode);
      game.destroy();
    }
  });
});
