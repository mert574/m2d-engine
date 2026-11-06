import { describe, it, expect } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Constraint } from '../src/core/constraint.js';
import { CAPTURE_AT, prepareCoverage, SCENE, OTHER, ARENA_ACTORS, fingerprint } from './helpers/scenarios.js';

/**
 * `game.snapshot()` and `game.restore()`: the ticks after a restore are the
 * ticks after the snapshot, bit for bit, whatever happened in between.
 */

function headless(seed = 5) {
  return new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 2000, seed });
}

async function arena({ seed = 7, actors = [], objects = [], hooks = {} } = {}) {
  const game = headless(seed);
  for (const actor of [...ARENA_ACTORS, ...actors]) game.registerActor(actor.name, actor);
  const scene = { ...SCENE, layers: [{ name: 'main', objects: [...SCENE.layers[0].objects, ...objects] }] };
  game.sceneManager.addScene('arena', { fetch: async () => scene, ...hooks });
  game.sceneManager.addScene('other', { fetch: async () => OTHER });
  await game.sceneManager.switchTo('arena');
  game.setupCollisionHandlers();
  return game;
}

/** Hold these keys, with the press edge on the first tick after each change. */
function controller(game) {
  let held = [];
  let changed = true;
  game.input.setSnapshotSource(() => {
    const snapshot = { down: held, pressed: changed ? held : [] };
    changed = false;
    return snapshot;
  });
  return (...codes) => { held = codes; changed = true; };
}

describe('snapshot and restore', () => {
  for (const sceneName of ['grove', 'keep']) {
    it(`'${sceneName}': the run after a restore is the run after the snapshot, again and again`, async () => {
      const game = headless();
      const capture = await prepareCoverage(game, sceneName);
      game.step(100);
      const snapshot = game.snapshot();
      game.step(CAPTURE_AT - 100);
      const first = capture();
      expect(first.steps).toBe(CAPTURE_AT);

      for (let i = 0; i < 2; i++) {
        game.restore(snapshot);
        expect(game.time.steps).toBe(100);
        game.step(CAPTURE_AT - 100);
        expect(capture()).toEqual(first);
      }
      game.destroy();
    });
  }

  it('entities spawned after the snapshot go, and ones removed after it come back as themselves', async () => {
    const game = await arena();
    const hold = controller(game);
    hold('ArrowRight');
    game.step(20);
    const snapshot = game.snapshot();
    const before = [...game.entities];
    const bees = before.filter((e) => e.name === 'Bee');
    const beeAt = { ...bees[0].body.position };
    game.step(160); // rockets fly, things die
    const later = [...game.entities].filter((e) => e.name === 'Rocket' && !before.includes(e));
    expect(later.length).toBeGreaterThan(0);
    // Take a bee out by hand as well.
    game.entities.delete(bees[0]);
    game.physics.remove(bees[0].body);

    game.restore(snapshot);
    expect([...game.entities]).toEqual(before);
    expect(game.entityById(bees[0].netId)).toBe(bees[0]);
    expect(game.physics.bodies).toContain(bees[0].body);
    expect(bees[0].body.position).toEqual(beeAt);
    const rockets = (list) => list.filter((e) => e.name === 'Rocket');
    expect(rockets([...game.entities])).toEqual(rockets(before));
    game.destroy();
  });

  it('rewinding and replaying with corrected input ends where the corrected run ends', async () => {
    // What client prediction does: guess, get corrected, rewind, resimulate.
    const truth = await arena({ seed: 9 });
    const holdTruth = controller(truth);
    holdTruth('ArrowRight');
    truth.step(40);
    holdTruth('ArrowLeft', 'Space');
    truth.step(80);
    const expected = fingerprint(truth);
    truth.destroy();

    const game = await arena({ seed: 9 });
    const hold = controller(game);
    hold('ArrowRight');
    game.step(40);
    const snapshot = game.snapshot();
    hold('ArrowRight'); // the guess: kept going right
    game.step(80);
    expect(fingerprint(game)).not.toEqual(expected);
    game.restore(snapshot);
    hold('ArrowLeft', 'Space'); // the truth arrives
    game.step(80);
    expect(fingerprint(game)).toEqual(expected);
    game.destroy();
  });

  it('game-time timers fire again after a restore; ones armed later are gone', async () => {
    const game = await arena();
    const fired = [];
    game.time.after(1, () => fired.push(`early@${game.time.steps}`));
    game.step(30);
    const snapshot = game.snapshot();
    game.time.after(0.1, () => fired.push(`late@${game.time.steps}`));
    const wall = game.time.after(5, () => {}, { unscaled: true });
    game.step(60);
    expect(fired).toEqual(['late@36', 'early@60']);
    game.restore(snapshot);
    expect(game.time.timers.has(wall)).toBe(true);
    game.step(60);
    expect(fired).toEqual(['late@36', 'early@60', 'early@60']);
    game.destroy();
  });

  it('restores containers in place, so a reference held elsewhere stays live', async () => {
    class Shared extends Constraint {
      constructor(entity, effects) { super(entity); this.effects = effects; }
      fixedUpdate(dt) { this.effects.charge += dt; }
    }
    class Holder extends Entity {
      name = 'Holder';
      constructor(body, sprite, game) {
        super(body, sprite, game);
        this.effects = { charge: 0, marks: [] };
        this.addConstraint('shared', new Shared(this, this.effects));
      }
      fixedUpdate(dt) {
        super.fixedUpdate(dt);
        if (this.game.time.steps % 10 === 0) this.effects.marks.push(this.game.time.steps);
      }
    }
    const game = await arena({ actors: [Holder], objects: [{ id: 'floor-2', prefab: 'floor', x: 50, y: 50, width: 10, height: 10 }] });
    const holder = game.createEntity({ type: 'Holder', x: 900, y: 100, width: 10, height: 10, physics: { bodyType: 'static' } });
    game.entities.add(holder);
    game.physics.add(holder.body);
    const effects = holder.effects;
    game.step(20);
    const snapshot = game.snapshot();
    game.step(25);
    holder.extra = 'added later';
    game.restore(snapshot);
    expect(holder.effects).toBe(effects);
    expect(holder.getConstraint('shared').effects).toBe(effects);
    expect(effects).toEqual({ charge: holder.effects.charge, marks: [10, 20] });
    expect(effects.charge).toBeCloseTo(20 / 60, 12);
    expect('extra' in holder).toBe(false);
    game.step(10);
    expect(effects.marks).toEqual([10, 20, 30]);
    game.destroy();
  });

  it('uses an entity\'s own saveState and loadState when it has them', async () => {
    class Custom extends Entity {
      name = 'Custom';
      constructor(body, sprite, game) { super(body, sprite, game); this.counter = 0; this.loads = 0; }
      fixedUpdate(dt) { super.fixedUpdate(dt); this.counter++; }
      saveState() { return { counter: this.counter }; }
      loadState(state) { this.counter = state.counter; this.loads++; }
    }
    const game = await arena({ actors: [Custom] });
    const custom = game.createEntity({ type: 'Custom', x: 900, y: 100, width: 10, height: 10, physics: { bodyType: 'static' } });
    game.entities.add(custom);
    game.physics.add(custom.body);
    game.step(5);
    const snapshot = game.snapshot();
    game.step(5);
    game.restore(snapshot);
    expect(custom.counter).toBe(5);
    expect(custom.loads).toBe(1);
    game.destroy();
  });

  it('carries tracked state, and drops the registration when the scene changes', async () => {
    let waves = 0;
    const game = await arena({ hooks: { onFixedUpdate() { if (game.time.steps % 30 === 0) waves++; } } });
    game.trackState('waves', { save: () => waves, load: (saved) => { waves = saved; } });
    game.step(60);
    const snapshot = game.snapshot();
    game.step(60);
    expect(waves).toBe(4);
    game.restore(snapshot);
    expect(waves).toBe(2);
    await game.sceneManager.switchTo('other');
    expect(game.trackedState.size).toBe(0);
    expect(() => game.trackState('x', {})).toThrow(/save, load/);
    game.destroy();
  });

  it('restores player state and undoes what intents did after the snapshot', async () => {
    const game = await arena();
    const local = game.players.local;
    local.state = { gold: 10, bag: ['rope'] };
    const bag = local.state.bag;
    const snapshot = game.snapshot();
    local.state.gold = 0;
    local.state.bag.push('lamp');
    game.restore(snapshot);
    expect(local.state).toEqual({ gold: 10, bag: ['rope'] });
    expect(local.state.bag).toBe(bag);
    game.destroy();
  });

  it('refuses another scene, a tick in progress and junk', async () => {
    const game = await arena();
    const snapshot = game.snapshot();
    expect(() => game.restore({})).toThrow(/not a snapshot/);
    let inside = null;
    game.time.after(0, () => {
      try { game.snapshot(); } catch (error) { inside = error.message; }
    });
    game.step(1);
    expect(inside).toMatch(/between ticks/);
    await game.sceneManager.switchTo('other');
    expect(() => game.restore(snapshot)).toThrow(/scene it was taken in/);
    game.destroy();
  });
});
