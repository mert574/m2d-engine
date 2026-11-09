import { describe, it, expect } from 'vitest';
import { fakeSocket } from './helpers/net.js';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { InputSchema, InputGate, ViolationMeter } from '../src/net/input.js';
import { defineIntents, reject, int } from '../src/net/intents.js';
import { Replicator, replicatedFields } from '../src/net/replication.js';
import { NetClient } from '../src/net/client.js';
import { SCENE, ARENA_ACTORS } from './helpers/scenarios.js';

/**
 * Replication without a network: a headless server game and a headless
 * replica, joined by an in-memory socket. What the server simulates, the
 * replica shows; what the replica's player presses, the server simulates.
 */

const SCHEMA = new InputSchema({ keys: ['ArrowLeft', 'ArrowRight', 'Space'] });

class Beacon extends Entity {
  name = 'Beacon';
  static replicated = ['lit', 'label'];
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.lit = false;
    this.label = options.label ?? 'none';
    this.secret = 'never sent';
  }
}

const intents = defineIntents({
  light: {
    args: { id: int(1, 10000) },
    run(player, { id }, { game }) {
      const beacon = game.entityById(id);
      if (!beacon || beacon.name !== 'Beacon') return reject('not-a-beacon');
      beacon.lit = true;
      player.state.lit = (player.state.lit ?? 0) + 1;
      player.notify('lit', { id });
    }
  }
});

function build() {
  const game = new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 2000, seed: 4 });
  for (const actor of [...ARENA_ACTORS, Beacon]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('arena', { fetch: async () => SCENE });
  game.registerIntents(intents);
  return game;
}

/** A server with one player, a replica connected to it, and a pump between them. */
async function pair() {
  const server = build();
  await server.sceneManager.switchTo('arena');
  server.setupCollisionHandlers();
  const meter = new ViolationMeter();
  const ann = server.players.add('ann', { meter });
  ann.state = {};
  const gate = new InputGate(SCHEMA, { meter, startTick: server.time.steps });
  ann.setSnapshotSource(() => gate.take(server.time.steps));
  const avatar = server.spawn({ type: 'Player', x: 300, y: 600, width: 32, height: 48, physics: { bodyType: 'dynamic', lockRotation: true, friction: 0.6 }, playerId: 'ann' });
  ann.avatar = avatar;
  const replicator = new Replicator(server, ann);

  const client = build();
  const socket = fakeSocket();
  const net = new NetClient(client, socket, { schema: SCHEMA, lead: 0 });
  socket.deliver({ t: 'welcome', you: 'ann', tick: server.time.steps, tickRate: 60, scene: 'arena', signature: server.sceneSignature, full: replicator.full() });
  await net.ready;

  /** One server tick: take the client's messages, step, send the change. */
  const pump = () => {
    for (const { t, m } of socket.outbox.splice(0)) {
      if (t === 'in') gate.submit(m);
      if (t === 'do') {
        const filed = ann.intents.submit(m);
        if (!filed.accepted) ann.intents.results.push({ seq: m.seq, ok: false, reason: filed.reason });
      }
    }
    server.step(1);
    socket.deliver({ t: 'state', ...replicator.delta() });
  };
  return { server, client, net, socket, pump, ann, avatar, gate };
}

// To the tenth of a pixel the wire carries; see net/replication.js.
const transformOf = (entity) => [entity.position.x, entity.position.y].map((v) => Math.round(v * 10) / 10);

describe('replication', () => {
  it('collects replicated fields along the class chain', () => {
    const game = build();
    const beacon = new Beacon(game.physics.createBox({ x: 0, y: 0, width: 4, height: 4 }), null, game);
    expect(replicatedFields(beacon)).toEqual(['elevation', 'visible', 'dead', 'lit', 'label']);
  });

  it('a replica builds the same scene, takes the server\'s spawn and follows its avatar', async () => {
    const { server, client, net, avatar } = await pair();
    expect(client.replica).toBe(true);
    expect(client.sceneSignature).toBe(server.sceneSignature);
    const mirror = client.entityById(avatar.netId);
    expect(mirror?.name).toBe('Player');
    expect(mirror.playerId).toBe('ann');
    expect(client.player).toBe(mirror);
    expect(net.you).toBe('ann');
    // The scene's own player is gone from neither: the server kept it, so the client did too.
    expect(client.entities.size).toBe(server.entities.size);
  });

  it('shows what the server simulates, and the server simulates what the replica presses', async () => {
    const { server, client, pump, avatar } = await pair();
    const mirror = client.entityById(avatar.netId);
    const start = avatar.position.x;
    const drawsAtBuild = client.rng.draws;
    client.input.setSnapshotSource(() => ({ down: ['ArrowRight'] }));
    for (let i = 0; i < 90; i++) {
      client.step(1); // the replica's tick: sample and send
      pump();
    }
    expect(avatar.position.x).toBeGreaterThan(start + 50);
    for (const entity of server.entities) {
      const replica = client.entityById(entity.netId);
      expect(replica, entity.name).toBeTruthy();
      expect(transformOf(replica)).toEqual(transformOf(entity));
    }
    expect(transformOf(mirror)).toEqual(transformOf(avatar));
    // The replica ran no simulation of its own.
    expect(client.time.steps).toBe(90);
    expect(client.rng.draws).toBe(drawsAtBuild);
  });

  it('spawns, declared fields and removals reach the replica; undeclared fields do not', async () => {
    const { server, client, pump } = await pair();
    const beacon = server.spawn({ type: 'Beacon', x: 700, y: 300, width: 20, height: 20, physics: { bodyType: 'static', isSensor: true }, options: { label: 'north' } });
    beacon.secret = 'changed on the server';
    pump();
    const mirror = client.entityById(beacon.netId);
    expect(mirror).toMatchObject({ name: 'Beacon', label: 'north', lit: false, secret: 'never sent' });
    beacon.lit = true;
    pump();
    expect(mirror.lit).toBe(true);
    server.entities.delete(beacon);
    server.physics.remove(beacon.body);
    pump();
    expect(client.entityById(beacon.netId)).toBeNull();
    expect(client.entities.has(mirror)).toBe(false);
  });

  it('constraint fields follow too: health and a new swing', async () => {
    const { client, pump, avatar } = await pair();
    const mirror = client.entityById(avatar.netId);
    let swings = 0;
    mirror.getConstraint('attack').onStart = () => { swings++; };
    avatar.getConstraint('health').takeDamage(30);
    avatar.getConstraint('attack').startAttack(1);
    pump();
    expect(mirror.getConstraint('health').currentHealth).toBe(avatar.getConstraint('health').currentHealth);
    expect(swings).toBe(1);
    pump();
    expect(swings).toBe(1); // the same swing is not replayed
  });

  it('intents go to the server and their answers, state and events come back', async () => {
    const { server, client, pump } = await pair();
    const beacon = server.spawn({ type: 'Beacon', x: 700, y: 300, width: 20, height: 20, physics: { bodyType: 'static', isSensor: true } });
    pump();
    const heard = [];
    client.players.local.on('lit', (data) => heard.push(data));
    const lit = client.players.local.send('light', { id: beacon.netId });
    const wrong = client.players.local.send('light', { id: 1 });
    const junk = client.players.local.send('light', { id: 'x' });
    pump();
    pump();
    expect(await lit).toEqual({ ok: true });
    expect(await wrong).toEqual({ ok: false, reason: 'not-a-beacon' });
    expect(await junk).toEqual({ ok: false, reason: 'args' });
    expect(client.players.local.state).toEqual({ lit: 1 });
    expect(heard).toEqual([{ id: beacon.netId }]);
    expect(client.entityById(beacon.netId).lit).toBe(true);
  });

  it('a tap on a tick that sent nothing goes out with the next message', async () => {
    const { net, socket } = await pair();
    const { InputSnapshot } = await import('../src/core/input/snapshot.js');
    socket.outbox.length = 0;
    // The clock estimate falls behind what was already sent: this tick sends nothing.
    net.lastSent = net.targetTick + 50;
    net.tick(InputSnapshot.from({ pressed: ['Space'], pointer: { pressedButtons: 0 } }));
    expect(socket.outbox.filter((m) => m.t === 'in')).toHaveLength(0);
    // The estimate catches up; the next message carries the tap as held.
    net.lastSent = net.targetTick - 1;
    net.tick(InputSnapshot.empty());
    const sent = socket.outbox.filter((m) => m.t === 'in');
    expect(sent).toHaveLength(1);
    expect(sent[0].m.held & (1 << SCHEMA.keys.indexOf('Space'))).not.toBe(0);
    // And only once.
    net.lastSent = net.targetTick - 1;
    net.tick(InputSnapshot.empty());
    expect(socket.outbox.filter((m) => m.t === 'in').at(-1).m.held).toBe(0);
  });

  it('a replica that built a different scene refuses to sync', async () => {
    const server = build();
    await server.sceneManager.switchTo('arena');
    const client = build();
    const socket = fakeSocket();
    const net = new NetClient(client, socket, { schema: SCHEMA });
    socket.deliver({ t: 'welcome', you: 'ann', tick: 0, tickRate: 60, scene: 'arena', signature: server.sceneSignature ^ 1, full: {} });
    await expect(net.ready).rejects.toThrow(/different scene/);
    expect(socket.readyState).toBe(3);
  });

  it('a replica refuses a server ticking at another rate', async () => {
    const client = build();
    const socket = fakeSocket();
    const net = new NetClient(client, socket, { schema: SCHEMA });
    socket.deliver({ t: 'welcome', you: 'ann', tick: 0, tickRate: 30, scene: 'arena', signature: 0, full: {} });
    await expect(net.ready).rejects.toThrow(/30 Hz/);
  });

  it('intents in flight resolve offline when the connection drops', async () => {
    const { client, socket } = await pair();
    const pending = client.players.local.send('light', { id: 1 });
    socket.close(4010, 'match ended');
    expect(await pending).toEqual({ ok: false, reason: 'offline' });
    expect(client.net.closed).toEqual({ code: 4010, reason: 'match ended' });
    expect(await client.players.local.send('light', { id: 1 })).toEqual({ ok: false, reason: 'offline' });
  });

  it('only the receiving player hears their state, events and results', async () => {
    const { server, pump, ann } = await pair();
    const bob = server.players.add('bob');
    bob.state = { gold: 99 };
    const bobStream = new Replicator(server, bob);
    bobStream.full();
    ann.state.secret = 'ann only';
    ann.notify('private');
    const forBob = bobStream.delta();
    expect(forBob.me).toBeUndefined();
    expect(forBob.ev).toBeUndefined();
    pump();
    expect(JSON.stringify(bobStream.delta())).not.toContain('ann only');
  });
});
