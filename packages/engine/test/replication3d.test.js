import { describe, it, expect, beforeAll } from 'vitest';
import { fakeSocket } from './helpers/net.js';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { initPhysics } from '../src/core/physics/index.js';
import { InputSchema, InputGate, ViolationMeter } from '../src/net/input.js';
import { Replicator, applyState } from '../src/net/replication.js';
import { NetClient } from '../src/net/client.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { Quat } from '../src/core/math.js';

/**
 * Replication of a three-dimensional game: a headless 3D server and a
 * headless 3D replica, joined by an in-memory socket, as `replication.test.js`
 * does for 2D. The transform on the wire is a position, a quaternion and a
 * velocity, and the replica must agree with the server on all three.
 */

const SCHEMA = new InputSchema({ keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] });

class Ground extends Entity { name = 'Ground'; }
class Crate extends Entity { name = 'Crate'; }
class Hero extends Entity {
  name = 'Hero';
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const input = this.input;
    const v = this.body.velocity;
    this.body.setVelocity({
      x: input.isDown('ArrowRight') ? 1.5 : input.isDown('ArrowLeft') ? -1.5 : 0,
      y: v.y,
      z: input.isDown('ArrowDown') ? 1.5 : input.isDown('ArrowUp') ? -1.5 : 0
    });
  }
}

const YARD = {
  version: SCENE_VERSION, type: 'level', name: 'yard',
  world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
  prefabs: {
    ground: { actor: 'Ground', physics: { bodyType: 'static' } },
    crate: { actor: 'Crate', physics: { bodyType: 'dynamic', friction: 0.5 } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'ground', x: 0, y: 0, z: 0, width: 20, height: 0.2, depth: 20 },
    // A step under one side of the crate, so it lands on an edge and topples.
    { id: 'step', prefab: 'ground', x: 0.6, y: 0.3, z: 0.2, width: 0.4, height: 0.4, depth: 0.4 },
    { id: 'crate-1', prefab: 'crate', x: 0.3, y: 3, z: 0.2, width: 0.4, height: 0.4, depth: 0.4 }
  ] }]
};

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

function build() {
  const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 11 });
  for (const actor of [Ground, Crate, Hero]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('yard', { fetch: async () => YARD });
  return game;
}

async function pair() {
  const server = build();
  await server.sceneManager.switchTo('yard');
  server.setupCollisionHandlers();
  const meter = new ViolationMeter();
  const ann = server.players.add('ann', { meter });
  ann.state = {};
  const gate = new InputGate(SCHEMA, { meter, startTick: server.time.steps });
  ann.setSnapshotSource(() => gate.take(server.time.steps));
  const avatar = server.spawn({
    type: 'Hero', x: -3, y: 1, z: -3, width: 0.6, height: 1.8, depth: 0.6,
    physics: { bodyType: 'character', shape: 'capsule' }, playerId: 'ann'
  });
  ann.avatar = avatar;
  const replicator = new Replicator(server, ann);

  const client = build();
  const socket = fakeSocket();
  const net = new NetClient(client, socket, { schema: SCHEMA, lead: 0 });
  socket.deliver({
    t: 'welcome', you: 'ann', tick: server.time.steps, tickRate: 60,
    scene: 'yard', signature: server.sceneSignature, full: replicator.full()
  });
  await net.ready;

  const pump = () => {
    for (const { t, m } of socket.outbox.splice(0)) if (t === 'in') gate.submit(m);
    server.step(1);
    socket.deliver({ t: 'state', ...replicator.delta() });
  };
  return { server, client, net, pump, avatar, replicator };
}

const places = (v, n) => Math.round(v * n) / n || 0;
const positionOf = (e) => ['x', 'y', 'z'].map((k) => places(e.position[k], 10000));
const rotationOf = (e) => ['x', 'y', 'z', 'w'].map((k) => places(e.body.rotation[k], 10000));

describe('replicating a 3D game', () => {
  it('spawns with a third axis and a depth', async () => {
    const { client, avatar } = await pair();
    const mirror = client.entityById(avatar.netId);
    expect(mirror?.name).toBe('Hero');
    expect(mirror.position).toEqual(avatar.position);
    expect(mirror.body.size).toEqual({ x: 0.6, y: 1.8, z: 0.6 });
    expect(mirror.body.shape).toBe('capsule');
    expect(client.player).toBe(mirror);
  });

  it('packs a position, a quaternion and a velocity', async () => {
    const { server, replicator, avatar } = await pair();
    server.step(1);
    const delta = replicator.delta();
    const record = delta.update.find((r) => r.id === avatar.netId);
    expect(record.p).toHaveLength(10);
    const [x, y, z, qx, qy, qz, qw, vx, vy, vz] = record.p;
    expect([x, z]).toEqual([-3, -3]);
    expect(y).toBeCloseTo(1, 1);
    expect([qx, qy, qz, qw]).toEqual([0, 0, 0, 1]);
    expect([vx, vz]).toEqual([0, 0]);
    expect(vy).toBeLessThanOrEqual(0);
  });

  it('the replica agrees with the server on every transform, rotation included', async () => {
    const { server, client, pump, avatar } = await pair();
    const mirror = client.entityById(avatar.netId);
    const crate = server.sceneManager.getCurrentScene().entitiesById.get('crate-1');
    const drawsAtBuild = client.rng.draws;

    client.input.setSnapshotSource(() => ({ down: ['ArrowRight', 'ArrowDown'] }));
    for (let i = 0; i < 120; i++) {
      client.step(1);
      pump();
    }

    // The hero walked on both ground axes, and the crate landed and tipped.
    expect(avatar.position.x).toBeGreaterThan(-2);
    expect(avatar.position.z).toBeGreaterThan(-2);
    expect(crate.position.y).toBeLessThan(1);
    expect(Math.abs(crate.body.rotation.w)).toBeLessThan(0.9999);

    for (const entity of server.entities) {
      const replica = client.entityById(entity.netId);
      expect(replica, entity.name).toBeTruthy();
      expect(positionOf(replica), entity.name).toEqual(positionOf(entity));
      expect(rotationOf(replica), entity.name).toEqual(rotationOf(entity));
    }
    expect(positionOf(mirror)).toEqual(positionOf(avatar));
    // The replica ran no simulation of its own.
    expect(client.time.steps).toBe(120);
    expect(client.rng.draws).toBe(drawsAtBuild);
  });

  it('applies a packed 3D transform straight onto a body', async () => {
    const { client, avatar } = await pair();
    const turn = Quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 3);
    applyState(client, { tick: 1, update: [{
      id: avatar.netId, p: [1, 2, 3, turn.x, turn.y, turn.z, turn.w, 0.5, 0, -0.5]
    }] });
    const mirror = client.entityById(avatar.netId);
    expect(mirror.position).toEqual({ x: 1, y: 2, z: 3 });
    for (const k of ['x', 'y', 'z', 'w']) expect(mirror.body.rotation[k]).toBeCloseTo(turn[k], 5);
    expect(mirror.body.velocity.x).toBeCloseTo(0.5, 5);
    expect(mirror.body.velocity.z).toBeCloseTo(-0.5, 5);
  });
});
