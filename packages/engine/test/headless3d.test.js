import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * A level that runs in three dimensions, headless.
 *
 * This is the first thing built on the 3D solver, and it is deliberately
 * the half that needs no renderer: a scene file, prefabs, placed objects,
 * entities with 3D bodies, and a tick. If a 3D game can be simulated and
 * tested before anything can draw it, the parts underneath are right.
 *
 * Up is -y, as in the 2D engine. See rapier3dBackend.js.
 */

class Crate extends Entity { name = 'Crate'; }
class Ground extends Entity { name = 'Ground'; }
class Hero extends Entity {
  name = 'Hero';
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (this.walking) this.body.setVelocity({ x: 120, y: 0, z: 60 });
  }
}

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

function makeGame(options = {}) {
  const game = new M2D(null, {
    headless: true, dimensions: 3, worldWidth: 1000, worldHeight: 1000, seed: 7, ...options
  });
  game.registerActor('Crate', Crate);
  game.registerActor('Ground', Ground);
  game.registerActor('Hero', Hero);
  return game;
}

/** A floor at y = 0, a crate above it, and a hero standing on it. */
const LEVEL = {
  version: SCENE_VERSION,
  type: 'level',
  name: 'yard',
  world: { dimensions: 3, gravity: { x: 0, y: 1000, z: 0 } },
  prefabs: {
    ground: { actor: 'Ground', physics: { bodyType: 'static' } },
    crate: { actor: 'Crate', physics: { bodyType: 'dynamic', friction: 0.5 } },
    ball: { actor: 'Crate', physics: { bodyType: 'dynamic', shape: 'sphere', restitution: 0.4 } },
    barrel: { actor: 'Crate', physics: { bodyType: 'dynamic', shape: 'cylinder' } },
    hero: { actor: 'Hero', physics: { bodyType: 'character', shape: 'capsule', frictionAir: 0 } }
  },
  layers: [{
    name: 'main',
    objects: [
      { id: 'floor', prefab: 'ground', x: 0, y: 0, z: 0, width: 1000, height: 20, depth: 1000 },
      { id: 'crate-1', prefab: 'crate', x: 0, y: -200, z: 0, width: 40, height: 40, depth: 40 },
      { id: 'crate-2', prefab: 'crate', x: 0, y: -400, z: 120, width: 40, height: 40 },
      { id: 'ball-1', prefab: 'ball', x: 200, y: -300, z: -100, width: 40, height: 40 },
      { id: 'barrel-1', prefab: 'barrel', x: -200, y: -300, z: 0, width: 40, height: 60 },
      { id: 'hero-1', prefab: 'hero', x: -300, y: -100, z: -300, width: 20, height: 40 }
    ]
  }]
};

async function loadYard(overrides = {}) {
  const game = makeGame();
  game.sceneManager.addScene('yard', { fetch: async () => ({ ...LEVEL, ...overrides }) });
  await game.sceneManager.switchTo('yard');
  return { game, scene: game.sceneManager.getCurrentScene() };
}

describe('a 3D level, headless', () => {
  it('builds every object with a body in three dimensions', async () => {
    const { game, scene } = await loadYard();

    expect(game.physics.dimensions).toBe(3);
    expect(scene.entitiesById.size).toBe(6);
    const crate = scene.entitiesById.get('crate-1');
    expect(crate.position).toEqual({ x: 0, y: -200, z: 0 });
    expect(crate.body.size).toEqual({ x: 40, y: 40, z: 40 });
    game.destroy();
  });

  it("defaults a box's depth to its width, so a cube needs two numbers", async () => {
    const { game, scene } = await loadYard();
    expect(scene.entitiesById.get('crate-2').body.size).toEqual({ x: 40, y: 40, z: 40 });
    game.destroy();
  });

  it('builds the round shapes a third dimension adds', async () => {
    const { game, scene } = await loadYard();
    expect(scene.entitiesById.get('ball-1').body.shape).toBe('sphere');
    expect(scene.entitiesById.get('barrel-1').body.shape).toBe('cylinder');
    expect(scene.entitiesById.get('hero-1').body.shape).toBe('capsule');
    game.destroy();
  });

  it('ticks, and everything falls onto the floor and stays there', async () => {
    const { game, scene } = await loadYard();
    for (let i = 0; i < 240; i++) game.fixedUpdate(1 / 60);

    for (const id of ['crate-1', 'crate-2', 'ball-1', 'barrel-1']) {
      const entity = scene.entitiesById.get(id);
      // Floor top is y = -10; nothing may be below it, and nothing may
      // still be where it started.
      expect(entity.position.y, id).toBeLessThan(0);
      expect(entity.position.y, id).toBeGreaterThan(-60);
    }
    game.destroy();
  });

  it('keeps the third axis a real axis', async () => {
    const { game, scene } = await loadYard();
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60);
    // Objects placed apart on z stay apart on z. These are dropped dynamic
    // bodies, so they settle a few px rather than landing on the spot.
    expect(scene.entitiesById.get('crate-2').position.z).toBeCloseTo(120, -1);
    expect(scene.entitiesById.get('ball-1').position.z).toBeCloseTo(-100, -1);
    game.destroy();
  });

  it('walks a character along the floor on both ground axes', async () => {
    const { game, scene } = await loadYard();
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60);

    const hero = scene.entitiesById.get('hero-1');
    expect(hero.isOnGround()).toBe(true);

    const from = { ...hero.position };
    hero.walking = true;
    for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60);

    // A hair under the commanded 120 and 60: a prefab's `frictionAir: 0`
    // means "unset" and takes the engine default, which bleeds a little
    // speed in the step between the intent being set and being integrated.
    expect(hero.position.x - from.x).toBeGreaterThan(117);
    expect(hero.position.x - from.x).toBeLessThanOrEqual(120);
    expect(hero.position.z - from.z).toBeGreaterThan(58);
    expect(hero.position.z - from.z).toBeLessThanOrEqual(60);
    game.destroy();
  });

  it('plays the same twice from the same seed', async () => {
    const print = async () => {
      const { game, scene } = await loadYard();
      for (let i = 0; i < 180; i++) game.fixedUpdate(1 / 60);
      const state = [...scene.entitiesById].map(([id, e]) => [id, e.position]);
      game.destroy();
      return JSON.stringify(state);
    };
    expect(await print()).toBe(await print());
  });

  it('spawns into the world at runtime, with a third axis', async () => {
    const { game } = await loadYard();
    const extra = game.spawn({
      type: 'Crate', x: 10, y: -500, z: 40, width: 20, height: 20, depth: 20,
      physics: { bodyType: 'dynamic' }
    });
    expect(extra.position).toEqual({ x: 10, y: -500, z: 40 });
    for (let i = 0; i < 180; i++) game.fixedUpdate(1 / 60);
    expect(extra.position.y).toBeGreaterThan(-500);
    game.destroy();
  });
});

describe('a scene that disagrees with its game', () => {
  it('refuses a 3D scene in a 2D game, saying how to fix it', async () => {
    const game = new M2D(null, { headless: true, worldWidth: 100, worldHeight: 100 });
    game.registerActor('Ground', Ground);
    game.sceneManager.addScene('yard', {
      fetch: async () => ({
        ...LEVEL,
        prefabs: { ground: { actor: 'Ground', physics: { bodyType: 'static' } } },
        layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'ground', x: 0, y: 0, width: 10, height: 10 }] }]
      })
    });
    await expect(game.sceneManager.switchTo('yard'))
      .rejects.toThrow(/scene is 3D but the game runs 2D physics/);
    game.destroy();
  });
});

describe('validating a level by its dimension', () => {
  const loader = () => {
    const game = makeGame();
    const made = new SceneLoader(game);
    game.destroy();
    return made;
  };
  const level = (fields) => ({ ...LEVEL, ...fields });

  it('accepts the 3D shapes in a 3D level', () => {
    expect(() => loader().load(LEVEL)).not.toThrow();
  });

  it('rejects a 2D shape in a 3D level, and the reverse', () => {
    const circleIn3D = level({
      prefabs: { ...LEVEL.prefabs, crate: { actor: 'Crate', physics: { shape: 'circle' } } }
    });
    expect(() => loader().load(circleIn3D))
      .toThrow(/prefabs.crate.physics.shape:.*got "circle".*this level is 3D/);

    const sphereIn2D = {
      version: SCENE_VERSION, type: 'level', name: 'flat',
      prefabs: { crate: { actor: 'Crate', physics: { shape: 'sphere' } } },
      layers: []
    };
    expect(() => loader().load(sphereIn2D))
      .toThrow(/got "sphere".*this level is 2D/);
  });

  it('rejects a third axis in a 2D level rather than ignoring it', () => {
    // The failure this format exists to prevent: a field the author
    // believed in that does nothing.
    const flat = {
      version: SCENE_VERSION, type: 'level', name: 'flat',
      prefabs: { ground: { actor: 'Ground' } },
      layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'ground', x: 0, y: 0, z: 5 }] }]
    };
    expect(() => loader().load(flat))
      .toThrow(/layers\[0\].objects\[0\].z: 'z' needs a third axis, and this level is 2D/);
  });

  it('rejects a footprint in a 3D level, which has real depth', () => {
    const faked = level({
      prefabs: { ...LEVEL.prefabs, crate: { actor: 'Crate', physics: { footprint: { height: 8 } } } }
    });
    expect(() => loader().load(faked))
      .toThrow(/footprint fakes depth for a 2D perspective, and this level is 3D/);
  });

  it('rejects a dimension the engine does not have', () => {
    expect(() => loader().load(level({ world: { dimensions: 4 } })))
      .toThrow(/world.dimensions: expected one of 2, 3/);
  });
});
