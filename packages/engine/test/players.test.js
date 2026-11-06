import { describe, it, expect } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { InputSchema, InputGate, ViolationMeter } from '../src/net/input.js';
import { defineIntents, reject, slot, entity } from '../src/net/intents.js';
import { InputSnapshot } from '../src/core/input/snapshot.js';
import { ARENA_ACTORS } from './helpers/scenarios.js';

/**
 * Players on a headless game: each one's input drives only the entities
 * that carry their id, intents run as the player who sent them, in a
 * deterministic order, and the whole thing is a function of the two
 * streams.
 */

const SIZE = 4;

/** Two players' avatars, two lanterns and a vendor, on a floor. */
const SCENE = {
  version: 2, type: 'level', name: 'market',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: {
    floor: { actor: 'Platform', physics: { bodyType: 'static' } },
    hero: { actor: 'Player', physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.3 } },
    thing: { actor: 'Platform', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'floor', x: 640, y: 700, width: 1280, height: 40 },
    { id: 'hero-a', prefab: 'hero', x: 300, y: 640, width: 32, height: 48 },
    { id: 'hero-b', prefab: 'hero', x: 900, y: 640, width: 32, height: 48 },
    { id: 'vendor', prefab: 'thing', x: 320, y: 600, width: 16, height: 16 }, // vendor near A
    { id: 'lantern-1', prefab: 'thing', x: 500, y: 600, width: 16, height: 16 }, // lantern
    { id: 'lantern-2', prefab: 'thing', x: 520, y: 600, width: 16, height: 16 } // lantern
  ] }]
};

const SCHEMA = new InputSchema({ keys: ['ArrowLeft', 'ArrowRight', 'Space'] });

const intents = defineIntents({
  moveItem: {
    args: { from: slot(SIZE), to: slot(SIZE) },
    run(player, { from, to }) {
      const inv = player.state.inventory;
      if (inv[from] === null) return reject('empty-slot');
      [inv[from], inv[to]] = [inv[to], inv[from]];
    }
  },
  sell: {
    args: { slot: slot(SIZE), vendor: entity({ actor: 'Vendor', within: 80 }) },
    run(player, { slot: at }) {
      if (player.state.inventory[at] === null) return reject('empty-slot');
      player.state.inventory[at] = null;
      player.state.gold += 5;
    }
  },
  take: {
    args: { item: entity({ actor: 'Lantern', within: 400 }) },
    run(player, { item }, { game }) {
      const free = player.state.inventory.indexOf(null);
      if (free === -1) return reject('full');
      player.state.inventory[free] = 'lantern';
      game.entities.delete(item);
      game.physics.remove(item.body);
    }
  }
});

async function market() {
  const game = new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 2000, seed: 7 });
  for (const actor of ARENA_ACTORS) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('market', { fetch: async () => SCENE });
  await game.sceneManager.switchTo('market');
  game.setupCollisionHandlers();
  game.registerIntents(intents);

  const [, heroA, heroB, vendor, lantern1, lantern2] = game.entities;
  vendor.name = 'Vendor';
  lantern1.name = 'Lantern';
  lantern2.name = 'Lantern';

  const players = {};
  for (const [id, hero] of [['a', heroA], ['b', heroB]]) {
    const meter = new ViolationMeter();
    const player = game.players.add(id, { meter });
    player.state = { inventory: Array(SIZE).fill(null), gold: 0 };
    player.avatar = hero;
    hero.playerId = id;
    const gate = new InputGate(SCHEMA, { meter });
    player.setSnapshotSource(() => gate.take(game.time.steps));
    players[id] = { player, hero, gate, meter };
  }
  return { game, players, vendor, lanterns: [lantern1, lantern2] };
}

const held = (tick, ...codes) => SCHEMA.encode(tick, InputSnapshot.from({ down: codes }));

describe('players', () => {
  it('each player\'s input drives only their own entity', async () => {
    const { game, players } = await market();
    const { a, b } = players;
    const startA = a.hero.position.x;
    const startB = b.hero.position.x;
    for (let tick = 1; tick <= 60; tick++) {
      a.gate.submit(held(tick, 'ArrowRight'));
      b.gate.submit(held(tick, 'ArrowLeft'));
      game.step(1);
    }
    expect(a.hero.position.x).toBeGreaterThan(startA + 50);
    expect(b.hero.position.x).toBeLessThan(startB - 50);
    expect(a.hero.input).toBe(a.player.snapshot);
    expect(a.player.entities).toEqual([a.hero]);
    game.destroy();
  });

  it('an entity nobody owns reads the local player, which is the game\'s input', async () => {
    const { game, players } = await market();
    players.a.hero.playerId = null;
    expect(players.a.hero.player).toBeNull();
    game.input.setSnapshotSource(() => ({ down: ['ArrowRight'] }));
    const start = players.a.hero.position.x;
    game.step(60);
    expect(players.a.hero.position.x).toBeGreaterThan(start + 50);
    expect(players.a.hero.input).toBe(game.input.snapshot);
    expect(game.players.local.snapshot).toBe(game.input.snapshot);
    game.destroy();
  });

  it('a removed player\'s entity reads nothing and stops', async () => {
    const { game, players } = await market();
    for (let tick = 1; tick <= 30; tick++) { players.a.gate.submit(held(tick, 'ArrowRight')); game.step(1); }
    expect(players.a.hero.velocity.x).toBeGreaterThan(10);
    game.players.remove('a');
    expect(players.a.hero.player).toBeNull();
    game.step(120);
    expect(Math.abs(players.a.hero.velocity.x)).toBeLessThan(1);
    expect(() => game.players.remove('local')).toThrow(/local/);
    game.destroy();
  });

  it('refuses a duplicate id and a bad one', async () => {
    const { game } = await market();
    expect(() => game.players.add('a')).toThrow(/already/);
    expect(() => game.players.add('')).toThrow(/non-empty/);
    expect(() => game.players.local.setSnapshotSource(() => null)).toThrow(/game\.input/);
    game.destroy();
  });

  it('network ids are stable across a re-entry and look up live entities', async () => {
    const { game, vendor, lanterns } = await market();
    const ids = [...game.entities].map((e) => e.netId);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
    expect(game.entityById(vendor.netId)).toBe(vendor);
    game.entities.delete(lanterns[0]);
    expect(game.entityById(lanterns[0].netId)).toBeNull();
    await game.sceneManager.switchTo('market');
    expect([...game.entities].map((e) => e.netId)).toEqual(ids);
    game.destroy();
  });
});

describe('intents through players', () => {
  it('run as the sender, at the start of the next tick, against the live world', async () => {
    const { game, players, vendor, lanterns } = await market();
    const { a, b } = players;
    expect(a.player.intents.submit({ seq: 1, name: 'take', args: { item: lanterns[0].netId } }).accepted).toBe(true);
    expect(b.player.intents.submit({ seq: 1, name: 'take', args: { item: lanterns[1].netId } }).accepted).toBe(true);
    expect(game.entities.has(lanterns[0])).toBe(true);
    game.step(1);
    expect(game.entities.has(lanterns[0])).toBe(false);
    expect(a.player.state.inventory).toEqual(['lantern', null, null, null]);
    // B is 400 px from the vendor; A is 20 px away.
    a.player.intents.submit({ seq: 2, name: 'sell', args: { slot: 0, vendor: vendor.netId } });
    b.player.intents.submit({ seq: 2, name: 'sell', args: { slot: 0, vendor: vendor.netId } });
    // The same lantern again: it is gone.
    b.player.intents.submit({ seq: 3, name: 'take', args: { item: lanterns[0].netId } });
    game.step(1);
    expect(a.player.intents.drainResults()).toEqual([{ seq: 1, ok: true }, { seq: 2, ok: true }]);
    expect(b.player.intents.drainResults()).toEqual([
      { seq: 1, ok: true }, { seq: 2, ok: false, reason: 'too-far' }, { seq: 3, ok: false, reason: 'no-such-entity' }
    ]);
    expect(a.player.state.gold).toBe(5);
    expect(b.player.state.gold).toBe(0);
    game.destroy();
  });

  it('a player cannot act through another player\'s queue', async () => {
    const { game, players, lanterns } = await market();
    // Whatever a message claims, the queue it arrives on decides who sent it.
    const forged = { seq: 1, name: 'take', args: { item: lanterns[0].netId }, player: 'a' };
    expect(players.b.player.intents.submit(forged).reason).toBe('shape');
    expect(players.b.meter.total).toBe(1);
    expect(players.a.meter.total).toBe(0);
    game.destroy();
  });

  it('apply in turn order, then seq, whatever order they arrived', async () => {
    const order = [];
    const spy = defineIntents({ mark: { run(player, _, { tick }) { order.push(`${player.id}@${tick}`); } } });
    const { game, players } = await market();
    game.registerIntents(spy);
    players.b.player.intents.submit({ seq: 1, name: 'mark', args: {} });
    players.a.player.intents.submit({ seq: 2, name: 'mark', args: {} });
    players.a.player.intents.submit({ seq: 1, name: 'mark', args: {} });
    game.step(1);
    const tick = game.time.steps;
    // Players by id are local, a, b; the tick picks who starts.
    const turn = game.players.turnOrder(tick).map((p) => p.id).filter((id) => id !== 'local');
    const expected = turn.flatMap((id) => (id === 'a' ? [`a@${tick}`, `a@${tick}`] : [`b@${tick}`]));
    expect(order).toEqual(expected);
    game.destroy();
  });

  it('every player gets the first turn in rotation', async () => {
    const { game } = await market();
    const firsts = new Set();
    for (let tick = 1; tick <= 3; tick++) firsts.add(game.players.turnOrder(tick)[0].id);
    expect([...firsts].sort()).toEqual(['a', 'b', 'local']);
    expect(game.players.turnOrder(7).map((p) => p.id)).toEqual(game.players.turnOrder(7).map((p) => p.id));
    game.destroy();
  });

  it('the local player sends and awaits, so the same game code works alone', async () => {
    const { game, lanterns } = await market();
    const local = game.players.local;
    local.state = { inventory: [null, null, null, null], gold: 0 };
    local.avatar = [...game.entities][1];
    const pending = local.send('take', { item: lanterns[0].netId });
    const refused = local.send('take', { item: 'not an id' });
    expect(await refused).toEqual({ ok: false, reason: 'args' });
    game.step(1);
    expect(await pending).toEqual({ ok: true });
    expect(local.state.inventory[0]).toBe('lantern');
    expect(await (async () => { const p = local.send('moveItem', { from: 3, to: 0 }); game.step(1); return p; })())
      .toEqual({ ok: false, reason: 'empty-slot' });
    game.destroy();
  });

  it('the whole run is a function of the two streams', async () => {
    const fingerprint = async () => {
      const { game, players, vendor, lanterns } = await market();
      for (let tick = 1; tick <= 120; tick++) {
        players.a.gate.submit(held(tick, tick < 60 ? 'ArrowRight' : 'ArrowLeft'));
        players.b.gate.submit(held(tick, 'ArrowLeft', 'Space'));
        if (tick === 10) players.a.player.intents.submit({ seq: 1, name: 'take', args: { item: lanterns[1].netId } });
        if (tick === 11) players.b.player.intents.submit({ seq: 1, name: 'take', args: { item: lanterns[1].netId } });
        if (tick === 12) players.a.player.intents.submit({ seq: 2, name: 'sell', args: { slot: 0, vendor: vendor.netId } });
        game.step(1);
      }
      const print = {
        a: { ...players.a.player.state, x: players.a.hero.position.x, results: players.a.player.intents.drainResults() },
        b: { ...players.b.player.state, x: players.b.hero.position.x, results: players.b.player.intents.drainResults() },
        entities: game.entities.size
      };
      game.destroy();
      return print;
    };
    const first = await fingerprint();
    expect(await fingerprint()).toEqual(first);
    expect(first.a.gold).toBe(5);
    expect(first.b.results).toEqual([{ seq: 1, ok: false, reason: 'no-such-entity' }]);
    expect(first.entities).toBe(5);
  });
});
