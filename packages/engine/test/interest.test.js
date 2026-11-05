import { describe, it, expect, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/physics/index.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { M2D } from '../src/core/m2d.js';
import { Replicator, applyState, baselineOf } from '../src/net/replication.js';
import { ObliquePlayer } from '../src/actors/obliquePlayer.js';
import { Ghost } from '../src/actors/ghost.js';
import { Platform } from '../src/actors/platform.js';

/**
 * Interest management: each client is told about what its player is near,
 * and a join does not repeat the level the client has just built for
 * itself.
 *
 * Both halves are about the same thing — a client's share of the world —
 * so they are driven the same way: a server game, a client game built from
 * the same scene, and messages carried by hand.
 */

/** A long hall with a creature at each end and scenery throughout. */
const HALL = {
  version: SCENE_VERSION, type: 'level', name: 'hall',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: {
    wall: { actor: 'Platform', physics: { bodyType: 'static' } },
    creature: { actor: 'Ghost', physics: { bodyType: 'dynamic', frictionAir: 0.05 } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'wall-top', prefab: 'wall', x: 2000, y: 8, width: 4000, height: 16 },
    { id: 'wall-bottom', prefab: 'wall', x: 2000, y: 992, width: 4000, height: 16 },
    { id: 'creature-near', prefab: 'creature', x: 400, y: 500, width: 32, height: 32 },
    { id: 'creature-far', prefab: 'creature', x: 3600, y: 500, width: 32, height: 32 }
  ] }]
};

function build() {
  const game = new M2D(null, { headless: true, worldWidth: 4000, worldHeight: 1000, seed: 3 });
  for (const actor of [ObliquePlayer, Ghost, Platform]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('hall', { fetch: async () => HALL });
  return game;
}

async function pair({ interest = { radius: 800 } } = {}) {
  const server = build();
  await server.sceneManager.switchTo('hall');
  server.setupCollisionHandlers();
  const player = server.players.add('ann');
  const avatar = server.spawn({ type: 'ObliquePlayer', x: 400, y: 500, width: 28, height: 28,
    physics: { bodyType: 'character', shape: 'circle' }, playerId: 'ann'
  });
  player.avatar = avatar;
  const replicator = new Replicator(server, player, { interest });

  const client = build();
  await client.sceneManager.switchTo('hall');
  client.replica = true;

  const creatures = [...server.entities].filter((e) => e.name === 'Ghost');
  const send = (message) => {
    applyState(client, message, {});
    return message;
  };
  return { server, client, player, avatar, replicator, creatures, send };
}

const bytes = (message) => JSON.stringify(message).length;
const clientCopy = (client, entity) => client.entityById(entity.netId);

beforeAll(async () => {
  await initPhysics();
});

describe('what a joining client is sent', () => {
  it('does not repeat the scene it has just built', async () => {
    const { replicator } = await pair({ interest: null });
    const full = replicator.full();
    // The avatar was spawned after the build, so it is the one thing the
    // client cannot have: everything else matches what it built.
    expect(full.spawn).toHaveLength(1);
    expect(full.update ?? []).toHaveLength(1);
    // A few hundred bytes for the one entity the client is missing, rather
    // than the whole hall.
    expect(bytes(full)).toBeLessThan(700);
  });

  it('sends what has changed since the match began', async () => {
    const { server, replicator, creatures } = await pair({ interest: null });
    // The match has been running: a creature has wandered and been hurt.
    server.step(30);
    creatures[0].getConstraint('health').takeDamage(40);
    const full = replicator.full();
    const ids = (full.update ?? []).map((record) => record.id);
    expect(ids).toContain(creatures[0].netId);
    const hurt = full.update.find((record) => record.id === creatures[0].netId);
    expect(hurt.c.health.currentHealth).toBe(60);
    // The walls have not moved and are not mentioned.
    const walls = [...server.entities].filter((e) => e.name === 'Platform');
    for (const wall of walls) expect(ids).not.toContain(wall.netId);
  });

  it('a baseline is the same state the replicator would have recorded', async () => {
    const { server, creatures } = await pair({ interest: null });
    const baseline = baselineOf(creatures[0]);
    expect(baseline.p).toBe(server.sceneBaseline.get(creatures[0].netId).p);
    expect(baseline.f.get('health.currentHealth')).toBe('100');
  });
});

describe('what the transform costs', () => {
  it('diffs position, angle and velocity apart', async () => {
    const { server, replicator, creatures } = await pair({ interest: null });
    replicator.full();
    const walker = creatures[0];
    // A creature crossing a flat floor: it moves and never rotates. Set
    // rather than simulated, since Chase would steer it somewhere of its own.
    walker.body.setPosition({ x: 500, y: 500 });
    walker.body.setVelocity({ x: 40, y: 0 });
    const first = replicator.delta().update.find((r) => r.id === walker.netId);
    expect(first.p).toBeDefined();
    expect(first.v).toEqual([40, 0]);
    expect(first.a).toBeUndefined(); // still zero, as it was at the build

    // Moving on at the same speed: only the position is news.
    walker.body.setPosition({ x: 540, y: 500 });
    const second = replicator.delta().update.find((r) => r.id === walker.netId);
    expect(second.p).toBeDefined();
    expect(second.v).toBeUndefined();
    expect(second.a).toBeUndefined();
  });

  it('rounds a position to a tenth of a pixel and a speed to whole units', async () => {
    const { server, replicator, creatures } = await pair({ interest: null });
    replicator.full();
    const walker = creatures[0];
    walker.body.setPosition({ x: 123.456789, y: 456.123456 });
    walker.body.setVelocity({ x: 12.345, y: -67.891 });
    const record = replicator.delta().update.find((r) => r.id === walker.netId);
    expect(record.p).toEqual([123.5, 456.1]);
    expect(record.v).toEqual([12, -68]);
  });

  it('calls a crawl a standstill, so a settled entity stops sending velocity', async () => {
    const { server, replicator, creatures } = await pair({ interest: null });
    replicator.full();
    const walker = creatures[0];
    walker.body.setVelocity({ x: 0.4, y: -0.3 });
    walker.body.setPosition({ x: 300, y: 300 });
    const record = replicator.delta().update.find((r) => r.id === walker.netId);
    // Below a pixel a second is not motion worth a number.
    expect(record.v).toBeUndefined();
  });

  it('always sends a player their own avatar\'s position, so prediction has something to check', async () => {
    const { server, avatar, replicator } = await pair({ interest: null });
    replicator.full();
    // The avatar has not moved at all: nothing has changed about it.
    for (let i = 0; i < 3; i++) {
      server.step(1);
      const record = replicator.delta().update?.find((r) => r.id === avatar.netId);
      expect(record?.p, 'the owner always hears where their own avatar is').toBeDefined();
    }
    // Another entity standing just as still says nothing.
    const walls = [...server.entities].filter((e) => e.name === 'Platform');
    server.step(1);
    const ids = (replicator.delta().update ?? []).map((r) => r.id);
    for (const wall of walls) expect(ids).not.toContain(wall.netId);
  });
});

describe('interest management', () => {
  it('sends the creature nearby and hides the one far away', async () => {
    const { client, replicator, creatures, send } = await pair({ interest: { radius: 800 } });
    const near = creatures[0]; // at 400, with the avatar
    const far = creatures[1]; // at 3600
    const full = send({ t: 'state', ...replicator.full() });

    expect(full.hide).toContain(far.netId);
    expect(full.hide).not.toContain(near.netId);
    // The client keeps it — the scene built it — but stops drawing it.
    expect(clientCopy(client, far)).not.toBeNull();
    expect(clientCopy(client, far).visible).toBe(false);
    expect(clientCopy(client, near).visible).toBe(true);
  });

  it('never hides scenery, so the level does not flicker', async () => {
    const { server, replicator, send } = await pair({ interest: { radius: 400 } });
    const full = send({ t: 'state', ...replicator.full() });
    const walls = [...server.entities].filter((e) => e.name === 'Platform');
    for (const wall of walls) expect(full.hide ?? []).not.toContain(wall.netId);
  });

  it('shows an entity again, whole, when the player comes back to it', async () => {
    const { server, client, avatar, replicator, creatures, send } = await pair({ interest: { radius: 800 } });
    const far = creatures[1];
    send({ t: 'state', ...replicator.full() });
    expect(clientCopy(client, far).visible).toBe(false);

    // Hurt it while the player is nowhere near: the client is told nothing.
    far.getConstraint('health').takeDamage(30);
    server.step(2);
    send({ t: 'state', ...replicator.delta() });
    expect(clientCopy(client, far).getConstraint('health').currentHealth).toBe(100);

    // Walk over to it. The whole entity arrives, not a diff against what
    // the client last knew.
    avatar.body.setPosition({ x: 3600, y: 500 });
    server.step(2);
    const message = send({ t: 'state', ...replicator.delta() });
    const record = message.update.find((r) => r.id === far.netId);
    expect(record.c.health.currentHealth).toBe(70);
    expect(record.f.visible).toBe(true);
    expect(clientCopy(client, far).visible).toBe(true);
    expect(clientCopy(client, far).getConstraint('health').currentHealth).toBe(70);
  });

  it('does not flicker something sitting on the boundary', async () => {
    const { server, avatar, replicator, creatures } = await pair({ interest: { radius: 800 } });
    const far = creatures[1];
    replicator.full();
    // Just inside: it comes into interest.
    far.body.setPosition({ x: avatar.position.x + 790, y: 500 });
    server.step(1);
    expect(replicator.delta().hide ?? []).not.toContain(far.netId);
    // Just outside the radius but inside the hysteresis: it stays.
    far.body.setPosition({ x: avatar.position.x + 850, y: 500 });
    server.step(1);
    expect(replicator.delta().hide ?? []).not.toContain(far.netId);
    // Well beyond: now it goes.
    far.body.setPosition({ x: avatar.position.x + 1000, y: 500 });
    server.step(1);
    expect(replicator.delta().hide).toContain(far.netId);
  });

  it('keeps world events to what the player could see', async () => {
    const { avatar, replicator } = await pair({ interest: { radius: 800 } });
    replicator.full();
    const heard = replicator.worldEvents([
      ['damage', { id: 1, at: { x: avatar.position.x + 100, y: 500 } }],
      ['damage', { id: 2, at: { x: avatar.position.x + 3000, y: 500 } }],
      ['fanfare', {}]
    ]);
    expect(heard.map(([, data]) => data.id ?? 'none')).toEqual([1, 'none']);
  });

  it('sends the whole world when the match asks for no interest', async () => {
    const { replicator, creatures } = await pair({ interest: null });
    const full = replicator.full();
    expect(full.hide).toBeUndefined();
    expect(replicator.shown.has(creatures[1].netId)).toBe(true);
  });

  it('always sends the player their own avatar, however the world is filtered', async () => {
    const { server, avatar, replicator } = await pair({ interest: { radius: 10 } });
    replicator.full();
    avatar.body.setPosition({ x: 2000, y: 500 });
    server.step(1);
    const message = replicator.delta();
    expect((message.hide ?? [])).not.toContain(avatar.netId);
    expect(message.update.some((record) => record.id === avatar.netId)).toBe(true);
  });
});
