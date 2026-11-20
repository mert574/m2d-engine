import { describe, it, expect, afterEach } from 'vitest';
import { initPhysics } from 'm2d-engine/physics';
import { M2D } from 'm2d-engine';
import { NetClient } from 'm2d-engine/net';
import { startServer, until } from './helpers.js';
import { INPUT, GAME_OPTIONS, registerYard } from './fixtures/yardGame.js';

/**
 * A three-dimensional match on a real server: the worker loads the 3D
 * solver from the match's `game.dimensions`, and clients that built the
 * same 3D scene receive positions, quaternions and velocities and agree
 * with each other on all of them.
 */

const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function joinYard(env, player, { held = () => [], heading = () => 0 } = {}) {
  await initPhysics({ dimensions: 3 });
  const game = new M2D(null, { headless: true, ...GAME_OPTIONS });
  // The join banner would be one block per test in the suite's output.
  game.netLogLevel = 0;
  registerYard(game);
  game.input.setSnapshotSource(() => ({ down: held(), heading: heading() }));
  const net = await NetClient.connect(game, { url: env.url, ticket: env.ticket(player, 'm1'), schema: INPUT });
  const timer = setInterval(() => game.step(1), 1000 / 60);
  cleanup.push(() => { clearInterval(timer); net.close(); game.destroy(); });
  return { game, net };
}

const near = (a, b, tolerance) => Math.abs(a - b) < tolerance;

describe('a 3D match', () => {
  it('drives a remote hero the way its player\'s view faces: the heading crosses the wire', async () => {
    const env = await startServer('yardMatch');
    cleanup.push(() => env.stop());
    // Ann walks "down" her screen while facing +x; Bob watches her hero on his replica.
    const ann = await joinYard(env, 'ann', { held: () => ['ArrowDown'], heading: () => Math.PI / 2 });
    const bob = await joinYard(env, 'bob');
    const annOnBob = () => [...bob.game.entities].find((e) => e.name === 'Hero' && e.playerId === 'ann');
    await until(() => annOnBob());
    const start = { ...annOnBob().position };
    await until(() => annOnBob().position.x > start.x + 0.5);
    expect(Math.abs(annOnBob().position.z - start.z)).toBeLessThan(0.2);
  });


  it('two players walk on both ground axes and agree on where everything is', async () => {
    const env = await startServer('yardMatch');
    cleanup.push(() => env.stop());
    const ann = await joinYard(env, 'ann', { held: () => ['ArrowRight'] });
    const bob = await joinYard(env, 'bob', { held: () => ['ArrowDown'] });
    const heroes = (client) => [...client.game.entities].filter((e) => e.name === 'Hero' && e.playerId);
    await until(() => heroes(ann).length === 2 && heroes(bob).length === 2);

    expect(ann.game.physics.dimensions).toBe(3);
    const start = Object.fromEntries(heroes(ann).map((e) => [e.playerId, { ...e.position }]));
    await until(() => {
      const now = Object.fromEntries(heroes(ann).map((e) => [e.playerId, e.position]));
      return now.ann.x > start.ann.x + 0.5 && now.bob.z > start.bob.z + 0.5;
    });

    // Heroes stand on the slab, not inside it, and never left the ground.
    for (const hero of heroes(ann)) expect(hero.position.y).toBeGreaterThan(0.9);

    // The crate fell, tipped and came to rest, so the two clients are not
    // compared mid-tumble, where the time between messages is a different pose.
    const crate = [...ann.game.entities].find((e) => e.name === 'Crate');
    let last = null;
    await until(() => {
      const q = crate.body.rotation;
      const still = last !== null && ['x', 'y', 'z', 'w'].every((k) => Math.abs(q[k] - last[k]) < 1e-3);
      last = { x: q.x, y: q.y, z: q.z, w: q.w };
      return crate.position.y < 1 && Math.abs(q.w) < 0.9999 && still;
    });

    // Both clients agree on every transform, give or take the time between messages.
    for (const entity of ann.game.entities) {
      const there = bob.game.entityById(entity.netId);
      expect(there, entity.name).toBeTruthy();
      for (const k of ['x', 'y', 'z']) expect(near(there.position[k], entity.position[k], 0.3), `${entity.name}.${k}`).toBe(true);
      for (const k of ['x', 'y', 'z', 'w']) expect(near(there.body.rotation[k], entity.body.rotation[k], 0.1), `${entity.name}.q${k}`).toBe(true);
    }
    expect(ann.game.player.playerId).toBe('ann');
    expect(bob.game.player.playerId).toBe('bob');
  });
});
