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
 * Up is +y and a unit is a metre, unlike the 2D engine. See
 * rapier3dBackend.js.
 */

class Crate extends Entity { name = 'Crate'; }
class Ground extends Entity { name = 'Ground'; }
class Hero extends Entity {
  name = 'Hero';
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (this.walking) this.body.setVelocity({ x: 1.2, y: 0, z: 0.6 });
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

/**
 * A 10 m yard: a slab whose top is y = 0.1, crates and a ball dropped from
 * a few metres, and a hero standing on it.
 */
const LEVEL = {
  version: SCENE_VERSION,
  type: 'level',
  name: 'yard',
  world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
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
      { id: 'floor', prefab: 'ground', x: 0, y: 0, z: 0, width: 10, height: 0.2, depth: 10 },
      { id: 'crate-1', prefab: 'crate', x: 0, y: 2, z: 0, width: 0.4, height: 0.4, depth: 0.4 },
      { id: 'crate-2', prefab: 'crate', x: 0, y: 4, z: 1.2, width: 0.4, height: 0.4 },
      { id: 'ball-1', prefab: 'ball', x: 2, y: 3, z: -1, width: 0.4, height: 0.4 },
      { id: 'barrel-1', prefab: 'barrel', x: -2, y: 3, z: 0, width: 0.4, height: 0.6 },
      { id: 'hero-1', prefab: 'hero', x: -3, y: 1, z: -3, width: 0.6, height: 1.8 }
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
    expect(crate.position).toEqual({ x: 0, y: 2, z: 0 });
    expect(crate.body.size).toEqual({ x: 0.4, y: 0.4, z: 0.4 });
    game.destroy();
  });

  it("defaults a box's depth to its width, so a cube needs two numbers", async () => {
    const { game, scene } = await loadYard();
    expect(scene.entitiesById.get('crate-2').body.size).toEqual({ x: 0.4, y: 0.4, z: 0.4 });
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
      // Floor top is y = 0.1; nothing may be below it, and nothing may
      // still be where it started.
      expect(entity.position.y, id).toBeGreaterThan(0.1);
      expect(entity.position.y, id).toBeLessThan(0.6);
    }
    game.destroy();
  });

  it('keeps the third axis a real axis', async () => {
    const { game, scene } = await loadYard();
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60);
    // Objects placed apart on z stay apart on z. These are dropped dynamic
    // bodies, so they settle a little rather than landing on the spot.
    expect(scene.entitiesById.get('crate-2').position.z).toBeCloseTo(1.2, 1);
    expect(scene.entitiesById.get('ball-1').position.z).toBeCloseTo(-1, 1);
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

    // A hair under the commanded 1.2 and 0.6: a prefab's `frictionAir: 0`
    // means "unset" and takes the engine default, which bleeds a little
    // speed in the step between the intent being set and being integrated.
    expect(hero.position.x - from.x).toBeGreaterThan(1.17);
    expect(hero.position.x - from.x).toBeLessThanOrEqual(1.2);
    expect(hero.position.z - from.z).toBeGreaterThan(0.58);
    expect(hero.position.z - from.z).toBeLessThanOrEqual(0.6);
    game.destroy();
  });

  it('noclip lets the hero walk through a wall, and off again stops it', async () => {
    const { game, scene } = await loadYard({
      layers: [{
        name: 'main',
        objects: [
          { id: 'floor', prefab: 'ground', x: 0, y: 0, z: 0, width: 10, height: 0.2, depth: 10 },
          { id: 'wall', prefab: 'ground', x: 2, y: 1, z: 0, width: 0.4, height: 2, depth: 6 },
          { id: 'hero-1', prefab: 'hero', x: 0, y: 1, z: 0, width: 0.6, height: 1.8 }
        ]
      }]
    });
    const hero = scene.entitiesById.get('hero-1');
    game.player = hero;
    // The console is presentation and a headless game has none; the command
    // registry itself is plain code, so build one here as the console would.
    const { CommandRegistry, registerBuiltins } = await import('../src/core/console/commands.js');
    const commands = new CommandRegistry({});
    registerBuiltins(commands, game);
    const io = { lines: [], print(l) { this.lines.push(l); }, error(l) { this.lines.push(`! ${l}`); } };
    for (let i = 0; i < 30; i++) game.fixedUpdate(1 / 60);

    // Into the wall: stopped short of it.
    hero.walking = true;
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60);
    expect(hero.position.x).toBeLessThan(2);

    commands.execute('noclip', io);
    expect(io.lines).toEqual(['noclip on']);
    expect(hero.noclip).toBe(true);
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60);
    expect(hero.position.x).toBeGreaterThan(2.5);

    commands.execute('noclip', io);
    expect(hero.noclip).toBe(false);
    expect(hero.body.collisionFilter.mask).toBe(0xFFFF);
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
      type: 'Crate', x: 1, y: 5, z: 4, width: 0.2, height: 0.2, depth: 0.2,
      physics: { bodyType: 'dynamic' }
    });
    expect(extra.position).toEqual({ x: 1, y: 5, z: 4 });
    for (let i = 0; i < 180; i++) game.fixedUpdate(1 / 60);
    expect(extra.position.y).toBeLessThan(5);
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

describe('a 3D object\'s rotation', () => {
  const turned = (object) => ({
    ...LEVEL,
    layers: [{ name: 'main', objects: [LEVEL.layers[0].objects[0], { ...LEVEL.layers[0].objects[1], ...object }] }]
  });

  it('reaches the body as its quaternion, normalized', async () => {
    const s = Math.SQRT1_2;
    const game = makeGame();
    game.sceneManager.addScene('yard', { fetch: async () => turned({ rotation: [0, 2 * s, 0, 2 * s] }) });
    await game.sceneManager.switchTo('yard');
    const q = game.sceneManager.getCurrentScene().entitiesById.get('crate-1').body.rotation;
    expect(q.y).toBeCloseTo(s, 5);
    expect(q.w).toBeCloseTo(s, 5);
  });

  it('is refused in a 2D level, as angle is in a 3D one, and a zero quaternion anywhere', () => {
    const loader = new SceneLoader(null);
    const flat = {
      version: SCENE_VERSION, type: 'level', name: 'flat',
      prefabs: { crate: { actor: 'Crate', physics: { bodyType: 'dynamic' } } },
      layers: [{ name: 'main', objects: [{ id: 'a', prefab: 'crate', x: 0, y: 0 }, { id: 'b', prefab: 'crate', x: 0, y: 0, rotation: [0, 0, 0, 1] }] }]
    };
    expect(() => loader.load(flat)).toThrow(/objects\[1\]\.rotation.*third axis/);
    expect(() => loader.load(turned({ angle: 0.5 }))).toThrow(/objects\[1\]\.angle.*quaternion/);
    expect(() => loader.load(turned({ rotation: [0, 0, 0, 0] }))).toThrow(/cannot be zero/);
  });
});

describe('a 3D level\'s environment', () => {
  it('must name one the level declares, and only in 3D', () => {
    const loader = new SceneLoader(null);
    const lit = { ...LEVEL, assets: { environments: { sky: { url: 'sky.hdr' } } }, world: { ...LEVEL.world, environment: 'sky' } };
    expect(() => loader.load(lit)).not.toThrow();
    expect(() => loader.load({ ...lit, world: { ...lit.world, environment: 'dusk' } })).toThrow(/no environment named 'dusk'/);
    const flat = {
      version: SCENE_VERSION, type: 'level', name: 'flat', world: { environment: 'sky' },
      assets: { environments: { sky: { url: 'sky.hdr' } } },
      prefabs: { crate: { actor: 'Crate', physics: { bodyType: 'dynamic' } } },
      layers: [{ name: 'main', objects: [{ id: 'a', prefab: 'crate', x: 0, y: 0 }] }]
    };
    expect(() => loader.load(flat)).toThrow(/world\.environment.*2D/);
  });
});
