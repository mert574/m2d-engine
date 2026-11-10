import { describe, it, expect, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Coin } from '../src/actors/coin.js';
import { Trigger } from '../src/actors/trigger.js';
import { Health } from '../src/constraints/health.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from './helpers/environment.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { blendLook, cycleLook, advanceCycle } from '../src/core/look.js';

/**
 * `world.rules`, `hud`, `world.cycle`, `world.killPlane`, a 2D `light`
 * and `physics.category`: the parts of a level that used to live only in
 * hooks and actors, as scene data the engine runs.
 */

installWindowStub();
stubDocumentListeners();

class Hero extends Entity {
  name = 'Player';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('health', new Health(this, { maxHealth: 10 }));
  }
}
class Gate extends Trigger {
  constructor(body, sprite, game, options) {
    super(body, sprite, game, options);
    this.sealed = true;
  }
}

function level(world = {}, extra = {}) {
  return {
    version: SCENE_VERSION, type: 'level', name: 'rules',
    world: { width: 400, height: 300, gravity: { x: 0, y: 0 }, player: 'hero', ...world },
    prefabs: {
      hero: { actor: 'Hero', physics: { bodyType: 'dynamic', category: 'player', mask: ['default', 'coin', 'trigger'] } },
      coin: { actor: 'Coin', physics: { bodyType: 'static', isSensor: true, category: 'coin' } },
      gate: { actor: 'Gate', physics: { bodyType: 'static', isSensor: true } },
      lamp: { actor: 'Entity', physics: { bodyType: 'static' }, light: { type: 'point', color: '#ffc877', range: 120, intensity: 0.8, offset: { x: 0, y: -10 } } }
    },
    layers: [{ name: 'main', objects: [
      { id: 'hero', prefab: 'hero', x: 50, y: 50, width: 10, height: 10 },
      { id: 'coin-1', prefab: 'coin', x: 200, y: 50, width: 10, height: 10 },
      { id: 'gate', prefab: 'gate', x: 300, y: 50, width: 20, height: 20, properties: { active: false } },
      { id: 'lamp', prefab: 'lamp', x: 100, y: 200, width: 10, height: 10 }
    ] }],
    ...extra
  };
}

async function make(scene, { headless = true, editMode = false } = {}) {
  const renderer = headless ? undefined : new RecordingRenderer();
  const game = new M2D(headless ? null : displayCanvas(320, 180), {
    ...(headless ? { headless: true } : { width: 320, height: 180, renderer, devConsole: false, performanceStats: false }),
    worldWidth: 400, worldHeight: 300, seed: 1, editMode
  });
  game.registerActor('Hero', Hero);
  game.registerActor('Gate', Gate);
  game.registerActor('Entity', Entity);
  if (!headless) vi.spyOn(game.soundManager, 'playMusic').mockImplementation(() => {});
  game.sceneManager.addScene('rules', { fetch: async () => scene });
  // A level, not a UI scene: a headless game has no UI to switch to.
  game.sceneManager.addScene('menu', { fetch: async () => ({ version: SCENE_VERSION, type: 'level', name: 'menu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('rules');
  game.setupCollisionHandlers();
  return { game, renderer, scene: game.sceneManager.getCurrentScene() };
}

const collect = (game, id) => { const coin = game.sceneManager.getCurrentScene().entitiesById.get(id); game.entities.delete(coin); game.physics.remove(coin.body); };

describe('rules', () => {
  it('fire once on start, and when every object of a prefab is collected', async () => {
    const { game, scene } = await make(level({ rules: [
      { when: { event: 'start' }, then: [{ do: 'set', object: 'gate', property: 'started', value: true }] },
      { when: { event: 'collected', prefab: 'coin' }, then: [{ do: 'unseal', object: 'gate' }] }
    ] }));
    const gate = scene.entitiesById.get('gate');
    game.step(1);
    expect(gate.started).toBe(true);
    expect(gate.sealed).toBe(true);
    expect(gate.active).toBe(false);
    collect(game, 'coin-1');
    game.step(1);
    expect(gate.sealed).toBe(false);
    expect(gate.active).toBe(true);
    game.destroy();
  });

  it('switch scene after a moment when the player enters an object, and game over on death', async () => {
    const { game, scene } = await make(level({ rules: [
      { when: { event: 'enter', object: 'gate' }, then: [{ do: 'switch', scene: 'menu', after: 0.5 }] },
      { when: { event: 'death', object: 'player' }, then: [{ do: 'gameOver' }] }
    ] }));
    const hero = scene.entitiesById.get('hero');
    const gate = scene.entitiesById.get('gate');
    // Walk the hero onto the gate: the sensor contact is what the rule reads.
    hero.body.setPosition({ x: 300, y: 50 });
    game.step(3);
    expect(game.sceneManager.getCurrentScene()).toBe(scene);          // the timer is still running
    expect(gate._contacts.size + hero._contacts.size).toBeGreaterThan(0);
    game.step(Math.ceil(0.6 / game.time.fixedTimestep));
    await new Promise((r) => setTimeout(r, 0));
    expect(game.sceneManager.getCurrentScene()?.config.name).toBe('menu');
    game.destroy();

    const second = await make(level({ rules: [{ when: { event: 'death', object: 'player' }, then: [{ do: 'gameOver' }] }] }));
    second.scene.entitiesById.get('hero').getConstraint('health').takeDamage(99);
    second.game.step(1);
    expect(second.game.isGameOver).toBe(true);
    second.game.destroy();
  });

  it('fire the fall rules at the kill plane instead of the default game over', async () => {
    const { game, scene } = await make(level({ killPlane: 100, rules: [
      { when: { event: 'fall' }, then: [{ do: 'set', object: 'hero', property: 'fell', value: true }, { do: 'switch', scene: 'menu' }] }
    ] }));
    const hero = scene.entitiesById.get('hero');
    hero.body.setPosition({ x: 50, y: 150 });
    game.step(1);
    expect(hero.fell).toBe(true);
    expect(game.isGameOver).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(game.sceneManager.getCurrentScene()?.config.name).toBe('menu');
    game.destroy();
    const plain = await make(level({ killPlane: 100 }));
    plain.scene.entitiesById.get('hero').body.setPosition({ x: 50, y: 150 });
    plain.game.step(1);
    expect(plain.game.isGameOver).toBe(true);
    plain.game.destroy();
  });

  it('do not run in edit mode', async () => {
    const { game, scene } = await make(level({ rules: [{ when: { event: 'start' }, then: [{ do: 'set', object: 'gate', property: 'started', value: true }] }] }), { editMode: true });
    expect(scene.rules).toBeFalsy();
    scene.fixedUpdate(1 / 60);
    expect(scene.entitiesById.get('gate').started).toBeUndefined();
    game.destroy();
  });
});

describe('the HUD', () => {
  it('builds its elements, binds a meter to the player\'s health, and shows a rule\'s notice', async () => {
    const { game, scene } = await make(level({ rules: [{ when: { event: 'collected', prefab: 'coin' }, then: [{ do: 'notice', text: 'ALL COINS', seconds: 1 }, { do: 'objective', text: 'Find the gate' }] }] }, {
      hud: [
        { type: 'text', id: 'objective', x: 20, y: 16, anchor: 'top-left', properties: { text: 'Collect the coins' } },
        { type: 'meter', id: 'health', x: 20, y: 40, anchor: 'top-left', width: 120, height: 10 },
        { type: 'notice', id: 'notice', x: 0, y: -60, anchor: 'center' },
        { type: 'minimap', id: 'map', x: -16, y: 16, anchor: 'top-right', size: 80, plot: { coin: '#ffd700' } }
      ]
    }), { headless: false });
    expect(scene.hud.elements.size).toBe(4);
    const meter = scene.hud.elements.get('health');
    expect(meter.value()).toEqual({ current: 10, max: 10 });
    scene.entitiesById.get('hero').getConstraint('health').takeDamage(4);
    expect(meter.value()).toEqual({ current: 6, max: 10 });
    const notice = scene.hud.elements.get('notice');
    expect(notice.visible).toBe(false);
    collect(game, 'coin-1');
    game.step(1);
    expect(notice.visible).toBe(true);
    expect(notice.text).toBe('ALL COINS');
    expect(scene.hud.elements.get('objective').text).toBe('Find the gate');
    notice.update(2);
    expect(notice.visible).toBe(false);
    game.destroy();
  });
});

describe('a 2D light block and collision categories', () => {
  it('draws the prefab\'s light at the body each frame, and files the body in its category', async () => {
    const { game, renderer, scene } = await make(level(), { headless: false });
    const light = vi.spyOn(renderer, 'drawLight');
    scene.drawWorld(1 / 60);
    expect(light).toHaveBeenCalledWith(expect.objectContaining({ x: 100, y: 190, radius: 120, color: '#ffc877', intensity: 0.8 }));
    const hero = scene.entitiesById.get('hero');
    expect(hero.body.collisionFilter.category).toBe(0x0002);
    expect(hero.body.collisionFilter.mask).toBe(0x0001 | 0x0020 | 0x0040);
    expect(scene.entitiesById.get('coin-1').body.collisionFilter.category).toBe(0x0020);
    game.destroy();
  });
});

describe('the lighting cycle', () => {
  it('blends numbers, colours and nested blocks', () => {
    expect(blendLook({ exposure: 1, sun: { intensity: 4 } }, { exposure: 3, sun: { intensity: 0 } }, 0.5)).toEqual({ exposure: 2, sun: { intensity: 2 } });
    expect(blendLook('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(blendLook({ a: 1 }, { a: 1, b: 2 }, 0.5)).toEqual({ a: 1, b: 2 });
    const cycle = { states: [{ lighting: { exposure: 1 } }, { lighting: { exposure: 2 } }] };
    expect(cycleLook(cycle, 0.5, { lighting: { ambient: '#fff' } }).lighting).toEqual({ ambient: '#fff', exposure: 1.5 });
    expect(cycleLook(cycle, 1.5, {}).lighting.exposure).toBe(1.5);    // wraps from the last back to the first
    expect(advanceCycle({ phase: 0, target: 1, ease: 1, count: 2, period: 0 }, 100)).toBeCloseTo(1, 5);
    expect(advanceCycle({ phase: 1.5, count: 2, period: 4 }, 1)).toBeCloseTo(0, 5);
  });

  it('eases toward a target a rule set, and re-applies the 2D ambient as it moves', async () => {
    const { game, renderer, scene } = await make(level({
      lighting: { ambient: '#000000' },
      cycle: { states: [{ name: 'day', lighting: { ambient: '#000000' } }, { name: 'night', lighting: { ambient: '#ffffff' } }], ease: 100 },
      rules: [{ when: { event: 'start' }, then: [{ do: 'cycle', target: 1 }] }]
    }), { headless: false });
    const ambient = vi.spyOn(renderer, 'setAmbientLight');
    expect(scene.cycle.phase).toBe(0);
    game.step(1);
    expect(scene.cycle.target).toBe(1);
    scene.update(1);
    expect(scene.cycle.phase).toBeCloseTo(1, 3);
    expect(ambient).toHaveBeenLastCalledWith(expect.stringMatching(/^(rgb\(255, 255, 255\)|#ffffff)$/));
    game.destroy();
  });
});
