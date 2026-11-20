import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.ts';
import { CollisionLayers } from '../src/core/collisionLayers.ts';
import { Health } from '../src/constraints/health.ts';
import { Attack } from '../src/constraints/attack.ts';
import { initPhysics } from '../src/core/physics/index.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * Collision layers are the project's vocabulary: names to bits, resolved
 * where bodies are built, refused where they name nothing — and the one
 * layer the engine owns, `none`, collides with nothing.
 */

class Thing extends Entity {}
class Mortal extends Entity {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('health', new Health(this, { maxHealth: 100 }));
  }
}

beforeAll(async () => { await initPhysics(); });

describe('the layer table', () => {
  it('maps names to bits in order, none to nothing, and refuses what is not declared', () => {
    const layers = new CollisionLayers(['world', 'player', 'shot']);
    expect(layers.bit('world')).toBe(1);
    expect(layers.bit('shot')).toBe(4);
    expect(layers.bit('none')).toBe(0);
    expect(layers.mask()).toBe(0xFFFF);
    expect(layers.mask([])).toBe(0);
    expect(layers.mask(['world', 'shot'])).toBe(5);
    expect(() => layers.bit('wrold')).toThrow(/no collision layer named 'wrold'.*world, player, shot/);
    expect(() => new CollisionLayers(['a', 'a'])).toThrow(/declared twice/);
    expect(() => new CollisionLayers(['none'])).toThrow(/engine's own/);
    expect(() => new CollisionLayers(Array.from({ length: 17 }, (_, i) => `l${i}`))).toThrow(/at most 16/);
  });
});

const level = (prefabs, objects) => ({
  version: SCENE_VERSION, type: 'level', name: 'pit',
  world: { width: 400, height: 400, gravity: { x: 0, y: 600 } },
  prefabs, layers: [{ name: 'main', objects }]
});

async function drop(prefabs, objects, layers = ['world', 'ghostly']) {
  const game = new M2D(null, { headless: true, worldWidth: 400, worldHeight: 400, seed: 1, layers });
  game.registerActor('Thing', Thing);
  game.registerActor('Mortal', Mortal);
  game.sceneManager.addScene('pit', { fetch: async () => level(prefabs, objects) });
  await game.sceneManager.switchTo('pit');
  await game.start();
  return game;
}

describe('layers on bodies', () => {
  it('bodies on layers blind to each other pass through; the floor still holds what sees it', async () => {
    const game = await drop({
      floor: { actor: 'Thing', physics: { bodyType: 'static' } },
      solid: { actor: 'Thing', physics: { bodyType: 'dynamic' } },
      spectre: { actor: 'Thing', physics: { bodyType: 'dynamic', layer: 'ghostly', collidesWith: ['ghostly'] } }
    }, [
      { id: 'floor', prefab: 'floor', x: 200, y: 300, width: 400, height: 20 },
      { id: 'solid', prefab: 'solid', x: 150, y: 100, width: 20, height: 20 },
      { id: 'spectre', prefab: 'spectre', x: 250, y: 100, width: 20, height: 20 }
    ]);
    game.step(120);
    const scene = game.sceneManager.getCurrentScene();
    expect(scene.entitiesById.get('solid').position.y).toBeLessThan(290); // resting on the floor
    expect(scene.entitiesById.get('spectre').position.y).toBeGreaterThan(400); // fell through it
    game.destroy();
  });

  it("'none' collides with nothing, with no declaration needed", async () => {
    const game = await drop({
      floor: { actor: 'Thing', physics: { bodyType: 'static' } },
      marker: { actor: 'Thing', physics: { bodyType: 'dynamic', layer: 'none' } }
    }, [
      { id: 'floor', prefab: 'floor', x: 200, y: 300, width: 400, height: 20 },
      { id: 'marker', prefab: 'marker', x: 200, y: 100, width: 20, height: 20 }
    ], []);
    game.step(120);
    expect(game.sceneManager.getCurrentScene().entitiesById.get('marker').position.y).toBeGreaterThan(400);
    game.destroy();
  });

  it('a layer the project does not declare is refused at load, naming the project file', async () => {
    await expect(drop({
      floor: { actor: 'Thing', physics: { bodyType: 'static', layer: 'wrold' } }
    }, [{ id: 'floor', prefab: 'floor', x: 200, y: 300, width: 400, height: 20 }]))
      .rejects.toThrow(/physics\.layer: no collision layer named 'wrold' \(m2d\.project\.json layers, and 'none': world, ghostly, none\)/);
  });
});

describe('an attack over layers', () => {
  async function arena(targets) {
    const game = new M2D(null, { headless: true, worldWidth: 400, worldHeight: 400, seed: 1, layers: ['world', 'player', 'enemy'] });
    game.registerActor('Mortal', Mortal);
    game.sceneManager.addScene('pit', { fetch: async () => level({
      mortal: { actor: 'Mortal', physics: { bodyType: 'dynamic', frictionAir: 1, layer: 'player' } },
      foe: { actor: 'Mortal', physics: { bodyType: 'dynamic', frictionAir: 1, layer: 'enemy' } }
    }, [
      { id: 'me', prefab: 'mortal', x: 100, y: 100, width: 20, height: 20 },
      { id: 'foe', prefab: 'foe', x: 120, y: 100, width: 20, height: 20 },
      { id: 'buddy', prefab: 'mortal', x: 145, y: 100, width: 20, height: 20 }
    ]) });
    await game.sceneManager.switchTo('pit');
    const scene = game.sceneManager.getCurrentScene();
    const me = scene.entitiesById.get('me');
    game.players.add('ann').avatar = me;
    game.players.add('bob').avatar = scene.entitiesById.get('buddy');
    const attack = new Attack(me, { damage: 10, range: 60, cooldown: 0, ...(targets && { targets }) });
    me.addConstraint('attack', attack);
    attack.startAttack(1);
    game.step(2);
    const health = (id) => scene.entitiesById.get(id).getConstraint('health').currentHealth;
    return { game, health };
  }

  it('unset, hits what is mortal and spares the players', async () => {
    const { game, health } = await arena(null);
    expect(health('foe')).toBe(90);
    expect(health('buddy')).toBe(100);
    game.destroy();
  });

  it('with targets, hits exactly the named layers', async () => {
    const { game, health } = await arena(['player']);
    expect(health('foe')).toBe(100);
    expect(health('buddy')).toBe(90);
    game.destroy();
  });
});
