import { describe, it, expect, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Coin } from '../src/actors/coin.js';
import { InputSnapshot } from '../src/core/input/snapshot.js';
import { InputActions } from '../src/core/input/actions.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from './helpers/environment.js';
import { keyDown } from './helpers/input.js';
import { SCENE_VERSION, SceneLoader } from '../src/core/sceneLoader.js';
import { fillTemplate } from '../src/core/counters.js';

/**
 * The rules' newer events and actions — counters, named input actions,
 * world events, what the simulation tells the player — and the HUD that
 * shows them: counter templates, a ratio meter, a minimap styled by
 * property, the ability bar and the dialogue.
 */

installWindowStub();
stubDocumentListeners();

class Hero extends Entity {
  name = 'Player';
}
class Gate extends Entity {
  sealed = true;
}

function level(world = {}, extra = {}) {
  return {
    version: SCENE_VERSION, type: 'level', name: 'count',
    world: { width: 400, height: 300, gravity: { x: 0, y: 0 }, player: 'hero', ...world },
    prefabs: {
      hero: { actor: 'Hero', physics: { bodyType: 'dynamic' } },
      coin: { actor: 'Coin', physics: { bodyType: 'static', isSensor: true, category: 'coin' } },
      gate: { actor: 'Gate', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'main', objects: [
      { id: 'hero', prefab: 'hero', x: 50, y: 50, width: 10, height: 10 },
      { id: 'coin-1', prefab: 'coin', x: 200, y: 50, width: 10, height: 10 },
      { id: 'coin-2', prefab: 'coin', x: 220, y: 50, width: 10, height: 10 },
      { id: 'coin-3', prefab: 'coin', x: 240, y: 50, width: 10, height: 10 },
      { id: 'gate', prefab: 'gate', x: 300, y: 50, width: 20, height: 20 }
    ] }],
    ...extra
  };
}

async function make(scene, { headless = true, actions = {} } = {}) {
  const renderer = headless ? undefined : new RecordingRenderer();
  const game = new M2D(headless ? null : displayCanvas(320, 180), {
    ...(headless ? { headless: true } : { width: 320, height: 180, renderer, devConsole: false, performanceStats: false }),
    worldWidth: 400, worldHeight: 300, seed: 1, actions
  });
  game.registerActor('Hero', Hero);
  game.registerActor('Gate', Gate);
  if (!headless) vi.spyOn(game.soundManager, 'playSound').mockImplementation(() => {});
  game.sceneManager.addScene('count', { fetch: async () => scene });
  game.sceneManager.addScene('menu', { fetch: async () => ({ version: SCENE_VERSION, type: 'level', name: 'menu', prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo('count');
  return { game, renderer, scene: game.sceneManager.getCurrentScene() };
}

const collect = (scene, id) => {
  const coin = scene.entitiesById.get(id);
  coin.dead = true;
  scene.game.entities.delete(coin);
  scene.game.physics.remove(coin.body);
};

describe('counters', () => {
  it('tally a prefab\'s objects as placed, remaining and taken, and keep plain counts', async () => {
    const { game, scene } = await make(level({ counters: {
      total: { prefab: 'coin', count: 'placed' },
      left: { prefab: 'coin', count: 'remaining' },
      taken: { prefab: 'coin' },
      score: { initial: 5 }
    } }));
    expect(scene.counters.snapshot()).toEqual({ total: 3, left: 3, taken: 0, score: 5 });
    collect(scene, 'coin-2');
    expect(scene.counters.snapshot()).toEqual({ total: 3, left: 2, taken: 1, score: 5 });
    scene.counters.set('taken', 99);
    expect(scene.counters.get('taken')).toBe(1);
    game.destroy();
  });

  it('fill a text\'s {name} holes, leaving an unknown name visible', () => {
    const counters = { has: (name) => name === 'a', get: () => 2 };
    expect(fillTemplate('A {a} B {b}', counters)).toBe('A 2 B {b}');
    expect(fillTemplate('plain', counters)).toBe('plain');
  });

  it('count up through rules, and a count rule fires when it is reached', async () => {
    const { game, scene } = await make(level({
      counters: { taken: { prefab: 'coin' }, bells: {} },
      rules: [
        { when: { event: 'start' }, then: [{ do: 'count', counter: 'bells', add: 2 }] },
        { when: { event: 'count', counter: 'bells', atLeast: 2 }, then: [{ do: 'count', counter: 'bells', set: 10 }] },
        { when: { event: 'count', counter: 'taken', atLeast: 2 }, then: [{ do: 'set', object: 'gate', property: 'sealed', value: false }] }
      ]
    }));
    game.step(1);
    expect(scene.counters.get('bells')).toBe(10);
    collect(scene, 'coin-1');
    game.step(1);
    expect(scene.entitiesById.get('gate').sealed).toBe(true);
    collect(scene, 'coin-3');
    game.step(1);
    expect(scene.entitiesById.get('gate').sealed).toBe(false);
    game.destroy();
  });

  it('hold a plain counter between its min and max, however it is set', async () => {
    const { game, scene } = await make(level({
      counters: { dial: { initial: 1000, min: 0, max: 3000 } },
      rules: [{ when: { event: 'start' }, then: [{ do: 'count', counter: 'dial', add: 5000 }] }]
    }));
    game.step(1);
    expect(scene.counters.get('dial')).toBe(3000);
    scene.counters.add('dial', -9000);
    expect(scene.counters.get('dial')).toBe(0);
    game.destroy();
  });

  it('start a counter inside its range even when the initial is outside it', async () => {
    const { game, scene } = await make(level({ counters: { dial: { initial: -40, min: 0 } } }));
    expect(scene.counters.get('dial')).toBe(0);
    game.destroy();
  });

  it('refuse a rule that names an undeclared counter', () => {
    const loader = new SceneLoader(null);
    expect(() => loader.load(level({ rules: [{ when: { event: 'count', counter: 'nope', atLeast: 1 }, then: [] }] }), 'count'))
      .toThrow(/no counter named 'nope'/);
  });
});

describe('gravity bound to a counter', () => {
  it('opens at the counter and follows what a rule does to it', async () => {
    const { game, scene } = await make(level({
      gravity: { x: 0, y: 1000 },
      counters: { pull: { initial: 400, min: 0, max: 900 } },
      gravityBind: [{ counter: 'pull', axis: 'y' }],
      rules: [{ when: { event: 'action', action: 'heavier' }, once: false, then: [{ do: 'count', counter: 'pull', add: 300 }] }]
    }), { actions: { heavier: ['KeyH'] } });

    // The level opens at what the counter says, not at world.gravity.
    expect(game.physics.gravity.y).toBe(400);

    let pressed = [];
    game.input.setSnapshotSource(() => InputSnapshot.from({ pressed }));
    pressed = ['KeyH'];
    game.step(1);
    expect(game.physics.gravity.y).toBe(700);
    // And it stops at the counter's own ceiling rather than running on.
    game.step(1);
    game.step(1);
    expect(game.physics.gravity.y).toBe(900);
    // The axis nobody bound is left where the world put it.
    expect(game.physics.gravity.x).toBe(0);
    game.destroy();
  });

  it('leaves gravity alone when the counter it names is not declared', async () => {
    const { game } = await make(level({
      gravity: { x: 0, y: 1000 },
      gravityBind: [{ counter: 'pull', axis: 'y' }]
    }));
    game.step(1);
    expect(game.physics.gravity.y).toBe(1000);
    game.destroy();
  });
});

describe('rule events', () => {
  it('fire on a named input action pressed at the tick', async () => {
    const { game, scene } = await make(level({ rules: [
      { when: { event: 'action', action: 'open' }, then: [{ do: 'set', object: 'gate', property: 'sealed', value: false }] }
    ] }), { actions: { open: ['KeyQ', 'Enter'] } });
    let pressed = [];
    game.input.setSnapshotSource(() => InputSnapshot.from({ pressed }));
    game.step(2);
    expect(scene.entitiesById.get('gate').sealed).toBe(true);
    pressed = ['Enter'];
    game.step(1);
    expect(scene.entitiesById.get('gate').sealed).toBe(false);
    game.destroy();
  });

  it('fire on a world event raised by game code, in the tick it was raised', async () => {
    const { game, scene } = await make(level({ rules: [
      { when: { event: 'emit', name: 'bell' }, then: [{ do: 'remove', object: 'gate' }] }
    ] }));
    game.step(1);
    expect(game.entities.has(scene.entitiesById.get('gate'))).toBe(true);
    scene.entitiesById.get('hero').fixedUpdate = function () { this.game.events.emit('bell'); };
    game.step(1);
    expect(scene.entitiesById.get('gate').dead).toBe(true);
    game.destroy();
  });

  it('answer what the simulation tells the player on the screen, with presentation only', async () => {
    const { game, scene } = await make(level({ rules: [
      { when: { event: 'notify', name: 'opened' }, then: [{ do: 'notice', text: 'OPEN' }, { do: 'sound', key: 'chime' }] }
    ] }, { hud: [{ type: 'notice', id: 'notice', x: 0, y: 0 }] }), { headless: false });
    game.players.local.notify('opened');
    game.players.local.dispatch(game.players.local.drainEvents());
    expect(scene.hud.elements.get('notice').text).toBe('OPEN');
    expect(game.soundManager.playSound).toHaveBeenCalledWith('chime');
    game.destroy();
  });

  it('refuse a notify rule that would change the world', () => {
    const loader = new SceneLoader(null);
    expect(() => loader.load(level({ rules: [{ when: { event: 'notify', name: 'x' }, then: [{ do: 'remove', object: 'gate' }] }] }), 'count'))
      .toThrow(/notify rule .* may only/);
  });

  it('toggle the cycle\'s target back and forth', async () => {
    const cycle = { states: [{ lighting: { ambient: '#ffffff' } }, { lighting: { ambient: '#000000' } }] };
    const { game, scene } = await make(level({ cycle, rules: [
      { when: { event: 'action', action: 'turn' }, then: [{ do: 'cycle', target: 1, toggle: true }], once: false }
    ] }), { actions: { turn: ['KeyT'] } });
    let pressed = ['KeyT'];
    game.input.setSnapshotSource(() => InputSnapshot.from({ pressed }));
    game.step(1);
    expect(scene.cycle.target).toBe(1);
    game.step(1);
    expect(scene.cycle.target).toBe(0);
    pressed = [];
    game.step(1);
    expect(scene.cycle.target).toBe(0);
    game.destroy();
  });
});

describe('the HUD reads the game', () => {
  it('shows counters in a text template and follows them', async () => {
    const { game, scene } = await make(level({ counters: { taken: { prefab: 'coin' }, total: { prefab: 'coin', count: 'placed' } } }, {
      hud: [{ type: 'text', id: 'count', x: 0, y: 0, properties: { text: 'COINS {taken} / {total}' } }]
    }), { headless: false });
    const text = scene.hud.elements.get('count');
    expect(text.text).toBe('COINS 0 / 3');
    collect(scene, 'coin-1');
    text.update(0.016);
    expect(text.text).toBe('COINS 1 / 3');
    game.destroy();
  });

  it('fills a meter from a ratio field, coloured full when it is', async () => {
    class Charge { constructor() { this.charge = 0.5; } }
    const { game, scene } = await make(level({}, {
      hud: [{ type: 'meter', id: 'boost', x: 0, y: 0, bind: { constraint: 'charge', ratio: 'charge' }, properties: { color: '#666', full: '#fd6' } }]
    }), { headless: false });
    const hero = scene.entitiesById.get('hero');
    const charge = new Charge();
    hero.getConstraint = (slot) => (slot === 'charge' ? charge : null);
    const meter = scene.hud.elements.get('boost');
    expect(meter.value()).toEqual({ current: 0.5, max: 1 });
    expect(meter.color(0.5)).toBe('#666');
    expect(meter.color(1)).toBe('#fd6');
    game.destroy();
  });

  it('plots a minimap by prefab with a style per property value, and rings its target', async () => {
    const { game, scene } = await make(level({}, {
      hud: [{
        type: 'minimap', id: 'map', x: 0, y: 0, target: 'gate',
        plot: { coin: '#ffd66e', gate: { shape: 'ring', color: '#78dcff', size: 5, by: { property: 'sealed', values: { true: { color: '#9a70ff' } } } } }
      }]
    }), { headless: false });
    const map = scene.hud.elements.get('map');
    const gate = scene.entitiesById.get('gate');
    expect(map.target).toBe(gate);
    expect(map.plot(scene.entitiesById.get('coin-1'))).toEqual({ shape: 'dot', color: '#ffd66e', size: 3 });
    expect(map.plot(gate)).toEqual({ shape: 'ring', color: '#9a70ff', size: 5 });
    gate.sealed = false;
    expect(map.plot(gate).color).toBe('#78dcff');
    expect(map.plot(scene.entitiesById.get('hero'))).toBeNull();
    game.destroy();
  });

  it('opens a dialogue from a say rule and advances it on the interact action', async () => {
    const { game, scene } = await make(level({ rules: [
      { when: { event: 'start' }, then: [{ do: 'say', speaker: 'Warden', lines: ['One.', 'Two.'] }] }
    ] }, { hud: [{ type: 'dialogue', id: 'talk', x: 0, y: -40, properties: { advance: 'interact' } }] }), { headless: false, actions: { interact: ['KeyF'] } });
    game.step(1);
    const dialogue = scene.hud.elements.get('talk');
    expect(dialogue.open).toBe(true);
    expect(dialogue.speaker).toBe('Warden');
    expect(dialogue.advanceHint).toBe('F');
    keyDown(game, 'KeyF');
    game.input.flush();
    keyDown(game, 'KeyF');
    game.input.flush();
    expect(dialogue.index).toBe(1);
    game.destroy();
  });

  it('leaves a dialogue with no advance action to the game, typing on game time', async () => {
    const { game, scene } = await make(level({}, { hud: [{ type: 'dialogue', id: 'talk', x: 0, y: -40, properties: { advance: '', clock: 'game' } }] }), { headless: false, actions: { interact: ['KeyE'] } });
    const dialogue = scene.hud.elements.get('talk');
    dialogue.start('Oswin', ['One.', 'Two.']);
    keyDown(game, 'KeyE');
    game.input.flush();
    expect(dialogue.index).toBe(0);
    expect(dialogue.clock()).toBe(game.time.elapsed);
    game.destroy();
  });

  it('plots an entity\'s own trail on the minimap', async () => {
    const { game, scene, renderer } = await make(level({}, {
      hud: [{ type: 'minimap', id: 'map', x: 0, y: 0, plot: { gate: { shape: 'trail', color: '#a87', size: 3 } } }]
    }), { headless: false });
    scene.entitiesById.get('gate').trail = [{ x: 0, y: 0 }, { x: 200, y: 150 }, { x: 400, y: 300 }];
    renderer.reset();
    scene.hud.elements.get('map').drawTree?.(0.016) ?? scene.drawUI(0.016);
    expect(renderer.optionsFor('drawPath').some((path) => path.strokeStyle === '#a87' && path.points.length === 3)).toBe(true);
    game.destroy();
  });

  it('builds an ability bar over the player\'s Abilities', async () => {
    const { game, scene } = await make(level({}, {
      hud: [{ type: 'abilityBar', id: 'bar', x: 0, y: -14, anchor: 'bottom' }]
    }), { headless: false });
    const abilities = { list: [{ id: 'dash', key: 'Digit1' }] };
    scene.entitiesById.get('hero').getConstraint = (slot) => (slot === 'abilities' ? abilities : null);
    expect(scene.hud.elements.get('bar').source()).toBe(abilities);
    game.destroy();
  });
});

describe('named input actions', () => {
  it('read through a snapshot, rebind, persist and reset', () => {
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
    try {
      const actions = new InputActions({ menu: ['Escape'], jump: ['Space', 'KeyW'] }, { storageKey: 'test' });
      const snapshot = InputSnapshot.from({ down: ['KeyW'], pressed: ['KeyW'] });
      expect(actions.pressed('jump', snapshot)).toBe(true);
      expect(actions.down('menu', snapshot)).toBe(false);
      actions.rebind('menu', ['KeyP']);
      expect(JSON.parse(store.get('test'))).toEqual({ menu: ['KeyP'] });
      expect(new InputActions({ menu: ['Escape'] }, { storageKey: 'test' }).codes('menu')).toEqual(['KeyP']);
      actions.reset();
      expect(actions.codes('menu')).toEqual(['Escape']);
      expect(() => actions.rebind('nope', ['KeyA'])).toThrow(/no action named 'nope'/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('are listed in the settings menu, and the next key rebinds one', async () => {
    const { SettingsMenu } = await import('../src/core/ui/settingsMenu.js');
    const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer: new RecordingRenderer(), devConsole: false, performanceStats: false, actions: { menu: ['Escape'] } });
    const menu = new SettingsMenu(game);
    const rows = menu.items().filter((item) => item.section === 'Controls');
    expect(rows.map((row) => row.label)).toEqual(['Menu', 'Reset controls']);
    expect(rows[0].value()).toBe('Escape');
    rows[0].activate();
    expect(rows[0].value()).toBe('Press a key…');
    const event = { type: 'keydown', code: 'KeyM', consume: vi.fn() };
    menu.catcher.handleInput(event);
    expect(game.actions.codes('menu')).toEqual(['KeyM']);
    expect(event.consume).toHaveBeenCalled();
    game.destroy();
  });
});
