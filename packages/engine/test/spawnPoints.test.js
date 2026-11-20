import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.ts';
import { s } from '../src/core/schema.ts';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { RecordingRenderer } from '../src/testing/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from '../src/testing/environment.js';

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

/** What the server does after setup: the scene's own player is the single-player one, and goes. */
function online(game) {
  game.removeEntity(game.player);
  game.player = null;
}

describe('spawn points', () => {
  it('make each joining avatar from the player object, at the first free point', async () => {
    const { game, scene } = await make(level());
    online(game);
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

  it('start a level\'s own player at the first free point, and leave it where it was placed in the editor', async () => {
    const played = await make(level());
    expect(played.game.player.position).toMatchObject({ x: 100, y: 100 });
    played.game.destroy();
    // Standing in the first point already, it is not in its own way.
    const inside = level();
    Object.assign(inside.layers[0].objects[0], { x: 100, y: 100 });
    const again = await make(inside);
    expect(again.game.player.position).toMatchObject({ x: 100, y: 100 });
    again.game.destroy();
    // Played from a chosen point, as the editor plays one: where its object stands.
    const chosen = await make(level(), { startAtSpawnPoint: false });
    expect(chosen.game.player.position).toMatchObject({ x: 10, y: 10 });
    chosen.game.destroy();
    const edited = await make(level(), { display: true, editMode: true });
    expect(edited.scene.entitiesById.get('hero').position).toMatchObject({ x: 10, y: 10 });
    edited.game.destroy();
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
    online(game);
    const a = scene.spawnAvatar(game.players.add('ann'));
    expect(a.position).toMatchObject({ x: 100, y: 0, z: 100 });
    expect(scene.spawnAvatar(game.players.add('bob')).position).toMatchObject({ x: 200, z: 100 });
    expect(scene.entitiesById.get('spawn-1').mesh).toBeNull();
    game.destroy();
  });

  it('collide with nothing', async () => {
    const { game, scene } = await make(level(), { display: true });
    expect(scene.entitiesById.get('spawn-1').body.collisionFilter).toMatchObject({ category: 0, mask: 0 });
    game.destroy();
  });
});

describe('tool entities', () => {
  /** A level with spawn points, a plain trigger, one whose box shows in play, and another. */
  const tools = () => {
    const scene = level();
    scene.prefabs.zone = { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } };
    scene.layers[0].objects.push(
      { id: 'zone-1', prefab: 'zone', x: 50, y: 50, width: 20, height: 20 },
      { id: 'door', prefab: 'zone', x: 80, y: 50, width: 20, height: 20, properties: { visible: true } },
      { id: 'pit', prefab: 'zone', x: 120, y: 50, width: 20, height: 20 }
    );
    return scene;
  };
  /** The boxes the overlay got this frame, by the label's object id. */
  const boxes = (game, scene) => {
    game.worldOverlay.clear();
    scene.draw(0);
    const fills = game.worldOverlay.shapes.filter((shape) => shape.method === 'drawPath').map((shape) => shape.options.fillStyle);
    const ids = game.worldOverlay.labels.map((label) => label.text.split(' · ')[1]);
    return Object.fromEntries(ids.map((id, i) => [id, fills[i]]));
  };

  it('draw as colour-coded boxes in the editor', async () => {
    const { game, scene } = await make(tools(), { display: true, editMode: true });
    const drawn = boxes(game, scene);
    expect(Object.keys(drawn).sort()).toEqual(['door', 'pit', 'spawn-1', 'spawn-2', 'zone-1']);
    expect(drawn['spawn-1']).toBe('rgba(52, 211, 153, 0.3)');
    expect(drawn['zone-1']).toBe('rgba(255, 138, 28, 0.3)');
    // The hero is no tool.
    expect(drawn.hero).toBeUndefined();
    game.destroy();
  });

  it('lie on the ground through the level\'s projection: a diamond in an isometric level', async () => {
    const scene = tools();
    scene.world.projection = 'isometric';
    const { game } = await make(scene, { display: true, editMode: true });
    const point = game.sceneManager.getCurrentScene().entitiesById.get('spawn-1');
    game.worldOverlay.clear();
    game.sceneManager.getCurrentScene().draw(0);
    const index = game.worldOverlay.labels.findIndex((label) => label.text.endsWith('spawn-1'));
    const box = game.worldOverlay.shapes.filter((shape) => shape.method === 'drawPath')[index].options;
    const { x, y } = point.body.position;
    const ground = [[x - 20, y - 20], [x + 20, y - 20], [x + 20, y + 20], [x - 20, y + 20]];
    expect(box.points).toEqual(ground.map(([gx, gy]) => game.projection.toScreen(gx, gy)));
    game.destroy();
  });

  it('hide in play, but for a trigger made visible, and all show under r_showtools, each once', async () => {
    const { game, scene } = await make(tools(), { display: true });
    expect(Object.keys(boxes(game, scene))).toEqual(['door']);
    game.cvars.set('r_showtools', 'true');
    expect(game.showTools).toBe(true);
    const drawn = boxes(game, scene);
    expect(Object.keys(drawn).sort()).toEqual(['door', 'pit', 'spawn-1', 'spawn-2', 'zone-1']);
    expect(game.worldOverlay.labels.filter((label) => label.text.endsWith('door'))).toHaveLength(1);
    game.cvars.set('r_showtools', 'false');
    expect(Object.keys(boxes(game, scene))).toEqual(['door']);
    game.destroy();
  });

});
