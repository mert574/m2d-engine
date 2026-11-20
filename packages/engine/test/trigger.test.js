import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * A Trigger's enter and exit hooks fire for a player's avatar — the
 * players registry's test, not an actor's name — and for nothing else.
 */

class Walker extends Entity {}

const level = () => ({
  version: SCENE_VERSION, type: 'level', name: 'zone',
  world: { width: 800, height: 400, gravity: { x: 0, y: 0 }, player: 'hero' },
  prefabs: {
    walker: { actor: 'Walker', physics: { bodyType: 'dynamic', frictionAir: 0 } },
    zone: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true }, properties: { active: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'hero', prefab: 'walker', x: 100, y: 100, width: 20, height: 20 },
    { id: 'stranger', prefab: 'walker', x: 100, y: 300, width: 20, height: 20 },
    { id: 'zone-1', prefab: 'zone', x: 300, y: 100, width: 40, height: 40 },
    { id: 'zone-2', prefab: 'zone', x: 300, y: 300, width: 40, height: 40 }
  ] }]
});

beforeAll(async () => { await initPhysics(); });

describe('a trigger', () => {
  it('fires enter and exit for the player\'s avatar, and not for a bystander', async () => {
    const game = new M2D(null, { headless: true, worldWidth: 800, worldHeight: 400, seed: 1 });
    game.registerActor('Walker', Walker);
    game.sceneManager.addScene('zone', { fetch: async () => level() });
    await game.sceneManager.switchTo('zone');
    await game.start();
    const scene = game.sceneManager.getCurrentScene();
    const seen = [];
    for (const id of ['zone-1', 'zone-2']) {
      const zone = scene.entitiesById.get(id);
      zone.onEnter = (who) => seen.push(['enter', id, who.sceneId]);
      zone.onExit = (who) => seen.push(['exit', id, who.sceneId]);
    }
    for (const id of ['hero', 'stranger']) scene.entitiesById.get(id).body.setVelocity({ x: 400, y: 0 });
    for (let i = 0; i < 90; i++) {
      game.step(1);
      for (const id of ['hero', 'stranger']) scene.entitiesById.get(id).body.setVelocity({ x: 400, y: 0 });
    }
    expect(seen).toEqual([['enter', 'zone-1', 'hero'], ['exit', 'zone-1', 'hero']]);
    game.destroy();
  });
});
