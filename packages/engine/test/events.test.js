import { describe, it, expect, vi } from 'vitest';
import { WorldEvents } from '../src/core/events.js';
import { Entity } from '../src/core/entity.js';
import { Health } from '../src/constraints/health.js';
import { DamageFlash } from '../src/constraints/damageFlash.js';
import { makeTestGame, makeBody } from './helpers/testGame.js';

/**
 * World events: what the simulation says happened, and the presentation
 * that hears it. The point of the channel is that the two can be in
 * different processes, so these drive both halves by hand — raise on one
 * side, deliver on the other, as a server and a client do.
 */

function walker(game, { id = 1, x = 0, y = 0 } = {}) {
  const entity = new Entity(makeBody(game, x, y, 16, 16, { bodyType: 'static' }), null, game);
  entity.netId = id;
  game.entities.add(entity);
  game.entitiesById.set(id, entity);
  return entity;
}

describe('WorldEvents', () => {
  it('queues what simulation raises and delivers nothing until it is taken', () => {
    const game = makeTestGame();
    const heard = vi.fn();
    game.events.on('spark', heard);
    game.events.emit('spark', { at: { x: 1, y: 2 } });
    expect(game.events.pending).toBe(1);
    expect(heard).not.toHaveBeenCalled();
    game.events.dispatch(game.events.take());
    expect(heard).toHaveBeenCalledWith({ at: { x: 1, y: 2 } });
    expect(game.events.pending).toBe(0);
  });

  it('reaches the entity it names, through its constraints', () => {
    const game = makeTestGame();
    const entity = walker(game, { id: 4 });
    const flash = new DamageFlash(entity);
    entity.addConstraint('damageFlash', flash);
    expect(flash.timeLeft).toBe(0);
    game.events.emit('damage', { id: 4, amount: 10 });
    game.events.dispatch(game.events.take());
    expect(flash.timeLeft).toBeGreaterThan(0);
  });

  it('a client raises nothing of its own', () => {
    const game = makeTestGame();
    game.replica = true;
    game.events.emit('damage', { id: 1 });
    expect(game.events.pending).toBe(0);
    // But it delivers what the server sent.
    const entity = walker(game, { id: 1 });
    const flash = new DamageFlash(entity);
    entity.addConstraint('damageFlash', flash);
    game.events.dispatch([['damage', { id: 1, amount: 3 }]]);
    expect(flash.timeLeft).toBeGreaterThan(0);
  });

  it('holds a bounded queue when nobody drains it', () => {
    const game = makeTestGame();
    for (let i = 0; i < 400; i++) game.events.emit('spark', { i });
    expect(game.events.pending).toBe(256);
    // The newest survive; the oldest are dropped.
    const taken = game.events.take();
    expect(taken[taken.length - 1][1].i).toBe(399);
  });

  it('an unknown entity and a listener-less event are both harmless', () => {
    const game = makeTestGame();
    expect(() => game.events.dispatch([['damage', { id: 999 }], ['nobody-listens', {}]])).not.toThrow();
  });

  it('clear drops listeners and anything queued', () => {
    const game = makeTestGame();
    const heard = vi.fn();
    game.events.on('spark', heard);
    game.events.emit('spark', {});
    game.events.clear();
    expect(game.events.pending).toBe(0);
    game.events.dispatch([['spark', {}]]);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('Health raises what a hit looks like', () => {
  it('a hit and a death are events, beside the state they change', () => {
    const game = makeTestGame();
    const entity = walker(game, { id: 2, x: 40, y: 80 });
    const onDamage = vi.fn();
    const onDeath = vi.fn();
    const health = new Health(entity, { maxHealth: 30, invulnerableDuration: 0, onDamage, onDeath });
    entity.addConstraint('health', health);

    health.takeDamage(10);
    expect(onDamage).toHaveBeenCalledTimes(1);
    expect(game.events.take()).toEqual([['damage', { amount: 10, id: 2, at: { x: 40, y: 80 } }]]);

    health.takeDamage(50); // more than is left: the event reports what was taken
    expect(onDeath).toHaveBeenCalledTimes(1);
    expect(game.events.take()).toEqual([
      ['damage', { amount: 20, id: 2, at: { x: 40, y: 80 } }],
      ['death', { id: 2, at: { x: 40, y: 80 } }]
    ]);
  });

  it('an invulnerable entity raises nothing, and healing says so', () => {
    const game = makeTestGame();
    const entity = walker(game, { id: 3 });
    const health = new Health(entity, { maxHealth: 50, invulnerableDuration: 1 });
    entity.addConstraint('health', health);
    health.takeDamage(10);
    game.events.take();
    health.takeDamage(10); // still invulnerable
    expect(game.events.pending).toBe(0);
    health.heal(5);
    expect(game.events.take()).toEqual([['heal', { amount: 5, id: 3, at: { x: 0, y: 0 } }]]);
    health.heal(500); // only the 5 still missing: the amount is capped at max health
    expect(game.events.take()).toEqual([['heal', { amount: 5, id: 3, at: { x: 0, y: 0 } }]]);
    health.heal(5); // full now, nothing to say
    expect(game.events.pending).toBe(0);
  });

  it('the flash happens on whichever side is drawing, not where damage was dealt', () => {
    const server = makeTestGame();
    const client = makeTestGame();
    const onServer = walker(server, { id: 9 });
    const health = new Health(onServer, { maxHealth: 100, invulnerableDuration: 0 });
    onServer.addConstraint('health', health);
    // The client's copy has the flash; the server's has none to run.
    const onClient = walker(client, { id: 9 });
    const flash = new DamageFlash(onClient);
    onClient.addConstraint('damageFlash', flash);

    health.takeDamage(25);
    const sent = server.events.take();
    expect(flash.timeLeft).toBe(0);
    client.events.dispatch(sent);
    expect(flash.timeLeft).toBeGreaterThan(0);
  });
});
