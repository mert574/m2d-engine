import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { ViolationMeter } from 'm2d-engine/net/input.js';
import { Wall, Torch, Ember, Stair, Creature, Knight, Quartermaster } from '../src/iso/keepActors.js';
import { keepIntents, newPurse, newStock, purse, WARES, SATCHEL_SIZE } from '../src/iso/keepIntents.js';

/**
 * Cinder Keep's whole simulation, headless, with the real scene: the
 * actors load without a renderer, embers go to whoever gathers them, and
 * the satchel and the shop run through intents as the sender, with the
 * quartermaster's distance rule and the game's own refusals in force.
 */

const KEEP = JSON.parse(readFileSync(new URL('../src/iso/scenes/keep.json', import.meta.url), 'utf8'));
const WORLD = { width: 64 * 64, height: 48 * 64 };

async function keep() {
  const game = new M2D(null, { headless: true, worldWidth: WORLD.width, worldHeight: WORLD.height, seed: 3 });
  for (const [name, actor] of Object.entries({ ObliquePlayer: Knight, Ghost: Creature, Wall, Torch, Coin: Ember, Trigger: Stair, Quartermaster })) {
    game.registerActor(name, actor);
  }
  game.sceneManager.addScene('keep', { fetch: async () => KEEP });
  await game.sceneManager.switchTo('keep');
  game.setupCollisionHandlers();
  game.registerIntents(keepIntents);
  const local = game.players.local;
  local.state = newPurse();
  local.avatar = game.player;
  const vendor = [...game.entities].find((e) => e instanceof Quartermaster);
  return { game, local, vendor };
}

/** Put the knight at a spot, standing still. */
function placeKnight(game, x, y) {
  game.player.body.setPosition({ x, y });
  game.player.body.setVelocity({ x: 0, y: 0 });
}

/** Send as the local player and run the tick it lands on. */
async function ask(game, local, name, args) {
  const pending = local.send(name, args);
  game.step(1);
  return pending;
}

beforeAll(async () => { await initPhysics(); });

describe('Cinder Keep headless', () => {
  it('loads the real keep with no renderer and ticks it', async () => {
    const { game, vendor } = await keep();
    expect(game.entities.size).toBeGreaterThan(600);
    expect(vendor).toBeTruthy();
    expect(game.step(60)).toBe(60);
    game.destroy();
  });

  it('an ember goes to the purse of the knight who gathers it', async () => {
    const { game, local } = await keep();
    const ember = [...game.entities].find((e) => e instanceof Ember);
    const before = game.entities.size;
    placeKnight(game, ember.position.x, ember.position.y);
    game.step(3);
    expect(game.entities.size).toBe(before - 1);
    expect(purse(local).embers).toBe(1);
    game.destroy();
  });
});

describe('the quartermaster', () => {
  it('sells and buys back within reach, and refuses from across the room', async () => {
    const { game, local, vendor } = await keep();
    purse(local).embers = 7;
    placeKnight(game, vendor.position.x + 60, vendor.position.y + 20);

    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'charm' })).toEqual({ ok: true });
    expect(purse(local)).toEqual({ embers: 2, satchel: ['charm', null, null, null, null, null] });
    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'tonic' })).toEqual({ ok: false, reason: 'not-enough-embers' });
    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'oil' })).toEqual({ ok: true });
    expect(await ask(game, local, 'sell', { vendor: vendor.netId, slot: 0 })).toEqual({ ok: true });
    expect(purse(local)).toEqual({ embers: 2, satchel: [null, 'oil', null, null, null, null] });
    expect(await ask(game, local, 'sell', { vendor: vendor.netId, slot: 0 })).toEqual({ ok: false, reason: 'empty-slot' });

    placeKnight(game, vendor.position.x + 300, vendor.position.y);
    expect(await ask(game, local, 'sell', { vendor: vendor.netId, slot: 1 })).toEqual({ ok: false, reason: 'too-far' });
    expect(purse(local).satchel[1]).toBe('oil');
    game.destroy();
  });

  it('refuses what was never declared, before any rule runs', async () => {
    const { game, local, vendor } = await keep();
    purse(local).embers = 99;
    placeKnight(game, vendor.position.x + 40, vendor.position.y);
    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'crown' })).toEqual({ ok: false, reason: 'args' });
    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'tonic', price: 0 })).toEqual({ ok: false, reason: 'args' });
    expect(await ask(game, local, 'buy', { vendor: game.player.netId, ware: 'tonic' })).toEqual({ ok: false, reason: 'wrong-entity' });
    expect(await ask(game, local, 'sell', { vendor: vendor.netId, slot: SATCHEL_SIZE })).toEqual({ ok: false, reason: 'args' });
    expect(purse(local).embers).toBe(99);
    game.destroy();
  });
});

/** A second knight by the trader, owned and driven by a new player. */
function addGuest(game, vendor, id, dx) {
  const meter = new ViolationMeter();
  const player = game.players.add(id, { meter });
  player.state = newPurse();
  player.avatar = game.spawn({
    type: 'ObliquePlayer', x: vendor.position.x + dx, y: vendor.position.y + 20, width: 28, height: 28,
    physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 }, playerId: id
  });
  return player;
}

describe('two players and the last charm', () => {
  it('in the same tick exactly one gets it, and nothing is duplicated', async () => {
    const winners = new Set();
    for (let round = 0; round < 6; round++) {
      const { game, vendor } = await keep();
      game.step(round); // a different tick each round, so a different player goes first
      const ann = addGuest(game, vendor, 'ann', 40);
      const bob = addGuest(game, vendor, 'bob', 70);
      purse(ann).embers = 10;
      purse(bob).embers = 10;
      expect(vendor.stock.charm).toBe(1);

      ann.intents.submit({ seq: 1, name: 'buy', args: { vendor: vendor.netId, ware: 'charm' } });
      bob.intents.submit({ seq: 1, name: 'buy', args: { vendor: vendor.netId, ware: 'charm' } });
      game.step(1);

      const results = { ann: ann.intents.drainResults()[0], bob: bob.intents.drainResults()[0] };
      const won = Object.entries(results).filter(([, r]) => r.ok).map(([id]) => id);
      const lost = Object.entries(results).filter(([, r]) => !r.ok);
      expect(won).toHaveLength(1);
      expect(lost).toEqual([[lost[0][0], { seq: 1, ok: false, reason: 'sold-out' }]]);
      const charms = [ann, bob].flatMap((p) => purse(p).satchel).filter((w) => w === 'charm');
      expect(charms).toHaveLength(1);
      expect(vendor.stock.charm).toBe(0);
      // The loser kept their embers; the winner paid once.
      expect(purse(ann).embers + purse(bob).embers).toBe(20 - WARES.charm.price);
      winners.add(won[0]);
      game.destroy();
    }
    // Turns rotate with the tick, so neither player wins every tie.
    expect([...winners].sort()).toEqual(['ann', 'bob']);
  });

  it('selling it back restocks it for the other player', async () => {
    const { game, vendor } = await keep();
    const ann = addGuest(game, vendor, 'ann', 40);
    const bob = addGuest(game, vendor, 'bob', 70);
    purse(ann).embers = 10;
    purse(bob).embers = 10;
    ann.intents.submit({ seq: 1, name: 'buy', args: { vendor: vendor.netId, ware: 'charm' } });
    game.step(1);
    ann.intents.submit({ seq: 2, name: 'sell', args: { vendor: vendor.netId, slot: 0 } });
    bob.intents.submit({ seq: 1, name: 'buy', args: { vendor: vendor.netId, ware: 'charm' } });
    game.step(1);
    // In one tick the sale and the purchase race too; whichever runs first decides.
    const bobResult = bob.intents.drainResults()[0];
    const charms = [ann, bob].flatMap((p) => purse(p).satchel).filter((w) => w === 'charm').length;
    expect(charms + vendor.stock.charm).toBe(1);
    if (!bobResult.ok) {
      expect(bobResult.reason).toBe('sold-out');
      bob.intents.submit({ seq: 2, name: 'buy', args: { vendor: vendor.netId, ware: 'charm' } });
      game.step(1);
      expect(bob.intents.drainResults()[0]).toEqual({ seq: 2, ok: true });
    }
    expect(purse(bob).satchel).toContain('charm');
    expect(purse(ann).satchel).not.toContain('charm');
    expect(vendor.stock).toEqual({ ...newStock(), charm: 0 });
    game.destroy();
  });
});

describe('the satchel', () => {
  it('moves items between slots and uses them on the knight', async () => {
    const { game, local } = await keep();
    const mine = purse(local);
    mine.satchel[0] = 'tonic';
    mine.satchel[1] = 'charm';
    mine.satchel[2] = 'oil';

    expect(await ask(game, local, 'moveItem', { from: 0, to: 5 })).toEqual({ ok: true });
    expect(mine.satchel).toEqual([null, 'charm', 'oil', null, null, 'tonic']);
    expect(await ask(game, local, 'moveItem', { from: 0, to: 1 })).toEqual({ ok: false, reason: 'empty-slot' });
    expect(await ask(game, local, 'moveItem', { from: 1, to: 2 })).toEqual({ ok: true });
    expect(mine.satchel).toEqual([null, 'oil', 'charm', null, null, 'tonic']);

    const knight = game.player;
    expect(await ask(game, local, 'use', { slot: 5 })).toEqual({ ok: false, reason: 'unhurt' });
    knight.getConstraint('health').takeDamage(50);
    const hurt = knight.getConstraint('health').currentHealth;
    expect(await ask(game, local, 'use', { slot: 5 })).toEqual({ ok: true });
    expect(knight.getConstraint('health').currentHealth).toBe(hurt + 40);
    expect(await ask(game, local, 'use', { slot: 2 })).toEqual({ ok: true });
    expect(knight.effects.shieldLeft).toBeGreaterThan(4.9);
    const abilities = knight.getConstraint('abilities');
    abilities.list[0].remaining = 3;
    expect(await ask(game, local, 'use', { slot: 1 })).toEqual({ ok: true });
    expect(abilities.list.every((a) => a.remaining === 0)).toBe(true);
    expect(mine.satchel).toEqual([null, null, null, null, null, null]);
    game.destroy();
  });

  it('a second player has a purse of their own and cannot reach into the first', async () => {
    const { game, local, vendor } = await keep();
    const other = addGuest(game, vendor, 'guest', 50);

    purse(local).embers = 10;
    purse(other).embers = 3;
    // The guest buys with their own embers; the local purse is untouched.
    expect(other.intents.submit({ seq: 1, name: 'buy', args: { vendor: vendor.netId, ware: 'tonic' } }).accepted).toBe(true);
    game.step(1);
    expect(other.intents.drainResults()).toEqual([{ seq: 1, ok: true }]);
    expect(purse(other)).toEqual({ embers: 0, satchel: ['tonic', null, null, null, null, null] });
    expect(purse(local).embers).toBe(10);
    game.destroy();
  });
});

describe('rolling the keep back', () => {
  it('a restore undoes a purchase: the charm, the embers and the stock all return', async () => {
    const { game, local, vendor } = await keep();
    purse(local).embers = 9;
    placeKnight(game, vendor.position.x + 50, vendor.position.y + 20);
    game.step(2);
    const snapshot = game.snapshot();
    const satchel = purse(local).satchel;
    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'charm' })).toEqual({ ok: true });
    expect(vendor.stock.charm).toBe(0);
    game.player.getConstraint('health').takeDamage(30);
    game.step(30);

    game.restore(snapshot);
    expect(vendor.stock.charm).toBe(1);
    expect(purse(local)).toEqual({ embers: 9, satchel: [null, null, null, null, null, null] });
    expect(purse(local).satchel).toBe(satchel);
    expect(game.player.getConstraint('health').currentHealth).toBe(game.player.getConstraint('health').maxHealth);
    // And the world goes on from there as if the purchase never happened.
    expect(await ask(game, local, 'buy', { vendor: vendor.netId, ware: 'charm' })).toEqual({ ok: true });
    game.destroy();
  });
});

