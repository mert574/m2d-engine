import { describe, it, expect, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/physics/index.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { M2D } from '../src/core/m2d.js';
import { InputSchema, InputGate, ViolationMeter } from '../src/net/input.js';
import { Replicator } from '../src/net/replication.js';
import { NetClient } from '../src/net/client.js';
import { ObliquePlayer } from '../src/actors/obliquePlayer.js';
import { Platform } from '../src/actors/platform.js';

/**
 * A client that moves on the tick it presses a key.
 *
 * A headless server game and a headless replica, joined by an in-memory
 * socket with latency in both directions: a message sent on one side
 * arrives a fixed number of ticks later on the other, the way a real one
 * does. The client runs its own avatar's movement as it sends the input
 * and corrects it when the server's answer catches up; these pin that the
 * early movement happens, that the two agree, and that a disagreement is
 * taken from the server without throwing away the input sent since.
 */

const SCHEMA = new InputSchema({
  keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
  pointer: { bounds: { left: 0, top: 0, right: 1280, bottom: 960 }, buttons: 1 }
});

/** A room with a wall to walk into, and nothing that moves on its own. */
const ROOM = {
  version: SCENE_VERSION, type: 'level', name: 'room',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: {
    wall: { actor: 'Platform', physics: { bodyType: 'static' } },
    knight: { actor: 'ObliquePlayer', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'wall-top', prefab: 'wall', x: 640, y: 8, width: 1280, height: 16 },
    { id: 'wall-bottom', prefab: 'wall', x: 640, y: 952, width: 1280, height: 16 },
    { id: 'wall-left', prefab: 'wall', x: 8, y: 480, width: 16, height: 960 },
    { id: 'wall-right', prefab: 'wall', x: 900, y: 480, width: 16, height: 960 }
  ] }]
};

/** A dynamic-bodied avatar, which no client can run on its own. */
const DYNAMIC_ROOM = {
  ...ROOM,
  prefabs: { ...ROOM.prefabs, knight: { actor: 'ObliquePlayer', physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.2 } } }
};

function build(scene) {
  const game = new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 960, seed: 11 });
  for (const actor of [ObliquePlayer, Platform]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('room', { fetch: async () => scene });
  return game;
}

/**
 * A server and a client, `delay` ticks apart each way.
 *
 * `hold(...codes)` sets what the client's player is holding. `advance(n)`
 * runs n ticks on both sides, carrying messages across the wire as their
 * delay expires.
 */
async function pair({ delay = 9, scene = ROOM, predict = true, sendEvery = 2 } = {}) {
  const server = build(scene);
  await server.sceneManager.switchTo('room');
  server.setupCollisionHandlers();
  const meter = new ViolationMeter();
  const player = server.players.add('ann', { meter });
  const gate = new InputGate(SCHEMA, { meter, startTick: server.time.steps, maxAhead: 120 });
  player.setSnapshotSource(() => gate.take(server.time.steps));
  const avatar = server.spawn({ type: 'ObliquePlayer', x: 200, y: 400, width: 28, height: 28,
    physics: scene === DYNAMIC_ROOM
      ? { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.2 }
      : { bodyType: 'character', shape: 'circle', frictionAir: 0.2 },
    playerId: 'ann'
  });
  player.avatar = avatar;
  const replicator = new Replicator(server, player);

  const client = build(scene);
  const held = { codes: [], click: null };
  client.input.setSnapshotSource(() => {
    const click = held.click;
    held.click = null;
    return {
      down: held.codes,
      pressed: held.codes,
      pointer: click
        ? { world: click, buttons: 1, isDown: true, pressed: true, pressedButtons: 1 }
        : { world: { x: 0, y: 0 }, buttons: 0 }
    };
  });

  /** In flight: `{ at, payload }`, delivered once the tick count reaches `at`. */
  const toServer = [];
  const toClient = [];
  let ticks = 0;
  let reported = { missed: 0, late: 0, early: 0 };

  const socket = {
    readyState: 1,
    send(data) { toServer.push({ at: ticks + delay, payload: JSON.parse(data) }); },
    close(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); },
    deliver(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  };

  const net = new NetClient(client, socket, { schema: SCHEMA, predict });
  socket.deliver({
    t: 'welcome', you: 'ann', tick: server.time.steps, tickRate: 60, sendEvery,
    scene: 'room', signature: server.sceneSignature, full: replicator.full()
  });
  await net.ready;

  const clientAvatar = () => client.entityById(avatar.netId);

  function advance(count = 1) {
    for (let i = 0; i < count; i++) {
      ticks++;
      // The client's tick: sample, predict, send.
      client.step(1);
      // What has arrived at the server by now.
      while (toServer.length && toServer[0].at <= ticks) {
        const { t, m } = toServer.shift().payload;
        if (t === 'in') gate.submit(m);
      }
      server.step(1);
      if (server.time.steps % sendEvery === 0) {
        const message = { t: 'state', ...replicator.delta(server.events.take()) };
        // What the real worker reports, so the client can steer by it.
        const margin = gate.readMargin();
        message.g = [gate.missed - reported.missed, gate.counts.late - reported.late, gate.counts.early - reported.early, margin];
        reported = { missed: gate.missed, late: gate.counts.late, early: gate.counts.early };
        toClient.push({ at: ticks + delay, payload: message });
      }
      while (toClient.length && toClient[0].at <= ticks) socket.deliver(toClient.shift().payload);
    }
  }

  return { server, client, net, avatar, clientAvatar, held, advance, gate, replicator, socket };
}

beforeAll(async () => {
  await initPhysics();
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('client prediction', () => {
  it('moves the local avatar on the tick the key goes down, before the server has heard', async () => {
    const { client, clientAvatar, held, net } = await pair();
    const mine = clientAvatar();
    const start = { ...mine.position };
    expect(net.predictor.entity).toBe(mine);

    held.codes = ['ArrowRight'];
    // One client tick. Nothing has reached the server, and no state has
    // come back; only the prediction has run.
    client.step(1);
    expect(mine.position.x).toBeGreaterThan(start.x);
    expect(net.predictor.history.size).toBeGreaterThan(0);
  });

  it('agrees with the server across a 150 ms round trip', async () => {
    const { avatar, clientAvatar, held, advance, net } = await pair({ delay: 9 });
    const mine = clientAvatar();
    held.codes = ['ArrowRight'];
    // The first stretch is the lead finding the length of the trip; input
    // arrives late until it has.
    advance(120);
    const settledLate = net.gate.late;

    held.codes = ['ArrowDown'];
    advance(120);
    held.codes = [];
    advance(60);

    // Both moved a long way from the start.
    expect(distance(avatar.position, { x: 200, y: 400 })).toBeGreaterThan(100);
    // Nothing more arrived too late to be used.
    expect(net.gate.late).toBe(settledLate);
    // The client's copy is ahead of the server's by the ticks still in
    // flight, so the two are compared at the same tick: what the client
    // predicted for a tick is what the server says happened on it.
    expect(net.predictor.lastError).toBeLessThan(2);
    // Ahead, not adrift: the gap is a fraction of a second of walking.
    expect(mine.position.y).toBeCloseTo(avatar.position.y, 0);
  });

  it('steers the lead up until the server stops seeing late input', async () => {
    // A long delay with the starting lead guarantees late input at first.
    const { net, held, advance } = await pair({ delay: 14 });
    held.codes = ['ArrowRight'];
    advance(40);
    expect(net.lead).toBeGreaterThan(2);
    advance(200);
    const lateSoFar = net.gate.late;
    advance(120);
    // Once the lead covers the trip, nothing more arrives late and the
    // margin settles near what the client aims for.
    expect(net.gate.late).toBe(lateSoFar);
    expect(net.gate.margin).toBeGreaterThanOrEqual(0);
    expect(net.lead).toBeLessThanOrEqual(120);
  });

  it('takes the server\'s word on a disagreement and replays the input sent since', async () => {
    const { avatar, clientAvatar, held, advance, net } = await pair({ delay: 9 });
    const mine = clientAvatar();
    held.codes = ['ArrowRight'];
    advance(30);
    const before = net.predictor.corrections;

    // The server shoves the knight somewhere the client could not know
    // about, while the client keeps walking right.
    avatar.body.setPosition({ x: avatar.position.x, y: avatar.position.y + 120 });
    avatar.body.syncInterpolation();
    advance(40);

    expect(net.predictor.corrections).toBeGreaterThan(before);
    // The client took the shove...
    expect(mine.position.y).toBeGreaterThan(480);
    expect(mine.position.y).toBeCloseTo(avatar.position.y, 0);
    // ...without losing the walking it did while the news was travelling:
    // what it predicts for a tick still matches what the server says of it,
    // and it is still ahead along the walk rather than back at the shove.
    expect(net.predictor.lastError).toBeLessThan(2);
    expect(mine.position.x).toBeGreaterThanOrEqual(avatar.position.x - 1);
  });

  it('gives a correction up gradually, so it is not seen as a jump', async () => {
    const { avatar, clientAvatar, held, advance, net } = await pair({ delay: 9 });
    const mine = clientAvatar();
    held.codes = ['ArrowRight'];
    advance(30);
    avatar.body.setPosition({ x: avatar.position.x, y: avatar.position.y + 60 });
    avatar.body.syncInterpolation();
    advance(20);

    const offset = net.predictor.offset;
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0);
    // The drawn position still carries the old offset...
    net.predictor.beforeDraw(0);
    const drawn = mine.body.renderOverride;
    expect(drawn).not.toBeNull();
    // ...and loses it over about a tenth of a second.
    for (let frame = 0; frame < 60; frame++) net.predictor.beforeDraw(1 / 60);
    expect(Math.hypot(net.predictor.offset.x, net.predictor.offset.y)).toBeLessThan(0.05);
    expect(mine.body.renderOverride.x).toBeCloseTo(mine.position.x, 1);
  });

  it('keeps the heading it predicted rather than the server\'s older copy', async () => {
    const { clientAvatar, held, advance } = await pair({ delay: 9 });
    const mine = clientAvatar();
    held.codes = ['ArrowRight'];
    advance(40);
    const facingRight = mine.heading;
    // Turn, and let exactly one state arrive carrying the old heading.
    held.codes = ['ArrowUp'];
    advance(4);
    expect(mine.heading).not.toBeCloseTo(facingRight, 3);
  });

  it('does not predict an avatar whose body cannot be advanced alone', async () => {
    const { clientAvatar, held, client, net } = await pair({ scene: DYNAMIC_ROOM });
    const mine = clientAvatar();
    expect(net.predictor.entity).toBeNull();
    const start = { ...mine.position };
    held.codes = ['ArrowRight'];
    client.step(1);
    // Nothing moves until the server says so.
    expect(mine.position.x).toBeCloseTo(start.x, 5);
  });

  it('can be turned off and on again on a live connection', async () => {
    const { avatar, clientAvatar, held, net, advance } = await pair();
    const mine = clientAvatar();
    held.codes = ['ArrowRight'];
    advance(40);
    // Predicting, the client's own avatar is ahead of the server's: it has
    // already run the input still in flight.
    expect(mine.position.x).toBeGreaterThan(avatar.position.x);

    net.setPredicting(false);
    expect(net.predictor).toBeNull();
    expect(net.view.predicted.has(mine.netId)).toBe(false);
    expect(mine.body.renderOverride).toBeNull();
    advance(40);
    // Not predicting, it is behind: it shows the newest state that reached it.
    expect(mine.position.x).toBeLessThan(avatar.position.x);

    net.setPredicting(true);
    expect(net.predictor.entity).toBe(mine);
    expect(net.view.predicted.has(mine.netId)).toBe(true);
    advance(40);
    expect(mine.position.x).toBeGreaterThan(avatar.position.x);
  });

  it('draws further behind when asked to ride out a worse connection', async () => {
    const { net, held, advance } = await pair();
    const base = net.view.delay;
    held.codes = ['ArrowRight'];
    advance(20);
    const behindBefore = net.serverTick - net.view.renderTick;
    net.view.extraDelay = 6;
    expect(net.view.delay).toBe(base + 6);
    advance(40);
    // The clock follows the new delay rather than sticking at the old one.
    const behindAfter = net.serverTick - net.view.renderTick;
    expect(behindAfter).toBeGreaterThan(behindBefore + 3);
  });

  it('logs the connection\'s life, and more of it when asked', async () => {
    // Only the net layer's lines; the engine debug-logs its scene building
    // through the same console.
    const all = [];
    const lines = { get length() { return all.filter(([, t]) => t.startsWith('[net]')).length; },
      some: (fn) => all.filter(([, t]) => t.startsWith('[net]')).some(fn),
      every: (fn) => all.filter(([, t]) => t.startsWith('[net]')).every(fn) };
    const info = console.info;
    const debug = console.debug;
    console.info = (...args) => all.push(['info', args.join(' ')]);
    console.debug = (...args) => all.push(['debug', args.join(' ')]);
    try {
      const { client, net, held, advance } = await pair({ delay: 14 });
      // Level 1 by default: joining and what was joined, not the detail.
      expect(lines.some(([, text]) => text.includes('joined as'))).toBe(true);
      expect(lines.every(([kind]) => kind === 'info')).toBe(true);

      client.netLogLevel = 2;
      held.codes = ['ArrowRight'];
      advance(60);
      // The lead being steered is the detail worth seeing.
      expect(lines.some(([kind, text]) => kind === 'debug' && text.includes('lead'))).toBe(true);

      client.netLogLevel = 0;
      const quiet = lines.length;
      advance(60);
      expect(lines.length).toBe(quiet);
    } finally {
      console.info = info;
      console.debug = debug;
    }
  });

  it('counts what crosses the wire', async () => {
    const { net, held, advance } = await pair();
    held.codes = ['ArrowRight'];
    advance(60);
    expect(net.stats.messagesOut).toBeGreaterThan(0);
    expect(net.stats.bytesOut).toBeGreaterThan(0);
    expect(net.stats.messagesIn).toBeGreaterThan(0);
    expect(net.stats.bytesIn).toBeGreaterThan(0);
  });

  it('can be turned off, leaving the avatar drawn from the server', async () => {
    const { clientAvatar, held, client, net, advance } = await pair({ predict: false });
    expect(net.predictor).toBeNull();
    const mine = clientAvatar();
    const start = { ...mine.position };
    held.codes = ['ArrowRight'];
    client.step(1);
    expect(mine.position.x).toBeCloseTo(start.x, 5);
    advance(40);
    expect(mine.position.x).toBeGreaterThan(start.x);
  });
});
