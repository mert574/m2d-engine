import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { M2D } from 'm2d-engine/core/m2d.js';
import { NetClient } from 'm2d-engine/net/client.js';
import { createServer, issueTicket } from 'm2d-server';
import { GAME_OPTIONS, INPUT, registerWatch } from './fixtures/watchGame.mjs';

/**
 * The ladder on a real m2d-server: the match simulates a watcher that
 * spots the joining player, hunts, telegraphs and strikes; the client runs
 * no behaviour of its own and still watches the whole of it arrive —
 * `state` and `lastSeen` on the behaviour, the windup on the attack — which
 * is what lets a client draw a telegraph it never simulated.
 */

const SECRET = 'w'.repeat(40);
let server, url, client;

beforeAll(async () => {
  // The match worker imports `m2d-kit/ai` as a shipped game would: the
  // built dist, so the build runs first and cannot be stale.
  execFileSync('npm', ['run', '--silent', 'build'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe']
  });
  server = createServer({ match: new URL('./fixtures/watchMatch.mjs', import.meta.url), secret: SECRET, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${await server.start()}/play`;
}, 120000);

afterAll(async () => {
  client?.stop();
  await server?.stop();
});

async function until(check, timeout = 30000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('the ladder online', () => {
  it('a client that simulates nothing watches the watcher spot, hunt, telegraph and strike', async () => {
    const game = new M2D(null, { headless: true, ...GAME_OPTIONS });
    game.netLogLevel = 0;
    registerWatch(game);
    game.input.setSnapshotSource(() => ({ down: [] }));
    const net = await NetClient.connect(game, {
      url, ticket: issueTicket(SECRET, { player: 'witness', match: 'watch' }), schema: INPUT
    });
    const timer = setInterval(() => game.step(1), 1000 / 60);
    client = { stop() { clearInterval(timer); net.close(); } };

    await until(() => game.players.local?.avatar && !game.sceneManager.loading);
    const avatar = game.players.local.avatar;
    const npc = () => [...game.entities].find((entity) => entity.sceneId === 'npc');
    await until(() => npc());

    const behavior = () => npc().getConstraint('behavior');
    const attack = () => npc().getConstraint('attack');
    const seen = new Set();
    let sawWindup = false;
    let sawLastSeen = false;

    // The server's simulation arrives field by field; collect the rungs.
    await until(() => {
      seen.add(behavior().state);
      if (attack().isWindingUp) sawWindup = true;
      if (behavior().lastSeen) sawLastSeen = true;
      return seen.has('alert') && sawWindup && seen.has('recover');
    }, 60000);

    expect(sawLastSeen).toBe(true);
    // It walked the room: the replica stands within reach of the avatar.
    expect(Math.hypot(npc().position.x - avatar.position.x, npc().position.y - avatar.position.y))
      .toBeLessThan(120);
    // And the strike landed on the server's truth, replicated back.
    await until(() => avatar.getConstraint('health').currentHealth < 100, 30000);
  }, 120000);
});
