import { describe, it, expect, afterEach } from 'vitest';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { NetClient } from 'm2d-engine/net/client.js';
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

async function joinYard(env, player, { held = () => [] } = {}) {
  await initPhysics({ dimensions: 3 });
  const game = new M2D(null, { headless: true, ...GAME_OPTIONS });
  registerYard(game);
  game.input.setSnapshotSource(() => ({ down: held() }));
  const net = await NetClient.connect(game, { url: env.url, ticket: env.ticket(player, 'm1'), schema: INPUT });
  const timer = setInterval(() => game.step(1), 1000 / 60);
  cleanup.push(() => { clearInterval(timer); net.close(); game.destroy(); });
  return { game, net };
}

const near = (a, b, tolerance) => Math.abs(a - b) < tolerance;

describe('a 3D match', () => {
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

    // The crate fell and tipped; its rotation reached both clients.
    const crate = [...ann.game.entities].find((e) => e.name === 'Crate');
    await until(() => crate.position.y < 1 && Math.abs(crate.body.rotation.w) < 0.9999);

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
