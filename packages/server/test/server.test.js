import { describe, it, expect, afterEach } from 'vitest';
import { startServer, joinAs, rawSocket, until } from './helpers.js';
import { CLOSE } from '../src/protocol.js';

/**
 * A real server, real worker threads and real sockets. Clients are headless
 * games running `NetClient`, or raw sockets for what a hostile client sends.
 */

const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function server(fixture, options) {
  const env = await startServer(fixture, options);
  cleanup.push(() => env.stop());
  return env;
}
async function join(env, player, options) {
  const client = await joinAs(env, player, options);
  cleanup.push(() => client.leave());
  return client;
}

describe('two players in one match', () => {
  it('each drives their own avatar and sees the other', async () => {
    const env = await server();
    const ann = await join(env, 'ann', { held: () => ['ArrowRight'] });
    const bob = await join(env, 'bob', { held: () => ['ArrowLeft'] });
    const avatars = (client) => [...client.game.entities].filter((e) => e.name === 'Player' && e.playerId);
    await until(() => avatars(ann).length === 2 && avatars(bob).length === 2);
    const start = Object.fromEntries(avatars(ann).map((e) => [e.playerId, e.position.x]));
    await until(() => {
      const now = Object.fromEntries(avatars(ann).map((e) => [e.playerId, e.position.x]));
      return now.ann > start.ann + 40 && now.bob < start.bob - 40;
    });
    // Both clients agree on where both avatars are, give or take the time between messages.
    for (const avatar of avatars(ann)) {
      const there = bob.game.entityById(avatar.netId);
      expect(Math.abs(there.position.x - avatar.position.x)).toBeLessThan(30);
    }
    expect(ann.game.player.playerId).toBe('ann');
    expect(bob.game.player.playerId).toBe('bob');
  });

  it('two players buying the last charm at once: one gets it, and both see it gone', async () => {
    const env = await server();
    const ann = await join(env, 'ann');
    const bob = await join(env, 'bob');
    const vendorId = [...ann.game.entities].find((e) => e.name === 'Vendor').netId;
    const [a, b] = await Promise.all([
      ann.game.players.local.send('buy', { vendor: vendorId }),
      bob.game.players.local.send('buy', { vendor: vendorId })
    ]);
    const outcomes = [a, b].map((r) => (r.ok ? 'ok' : r.reason)).sort();
    expect(outcomes).toEqual(['ok', 'sold-out']);
    await until(() => ann.game.entityById(vendorId).stock === 0 && bob.game.entityById(vendorId).stock === 0);
    const charms = ann.game.players.local.state.charms + bob.game.players.local.state.charms;
    expect(charms).toBe(1);
  });
});

describe('the door: nothing gets a socket without a good ticket', () => {
  const refused = async (env, options) => {
    const { opened } = rawSocket(env.url, options);
    return opened.then(() => 'opened', (error) => error.status);
  };

  it('refuses a missing, forged or reused ticket before upgrading', async () => {
    const env = await server();
    expect(await refused(env, {})).toBe(401);
    expect(await refused(env, { ticket: 'v1.e30.' + 'A'.repeat(43) })).toBe(401);
    const ticket = env.ticket('ann');
    const first = rawSocket(env.url, { ticket });
    await first.opened;
    expect(await refused(env, { ticket })).toBe(401);
    first.ws.close();
  });

  it('refuses another path and a foreign origin', async () => {
    const env = await server('arenaMatch', { origins: ['https://play.example'] });
    const { opened } = rawSocket(env.url.replace('/play', '/admin'), { ticket: env.ticket('ann') });
    expect(await opened.then(() => 'opened', (e) => e.status)).toBe(404);
    expect(await refused(env, { ticket: env.ticket('ann'), origin: 'https://evil.example' })).toBe(403);
    const good = rawSocket(env.url, { ticket: env.ticket('bob'), origin: 'https://play.example' });
    await good.opened;
    good.ws.close();
  });

  it('caps connections per address and upgrade attempts per address', async () => {
    const env = await server('arenaMatch', { maxConnectionsPerIp: 2, upgradesPerIpPerMinute: 3 });
    const a = rawSocket(env.url, { ticket: env.ticket('a') });
    const b = rawSocket(env.url, { ticket: env.ticket('b') });
    await Promise.all([a.opened, b.opened]);
    expect(await refused(env, { ticket: env.ticket('c') })).toBe(429);
    a.ws.close();
    await a.closed;
    await until(() => env.server.connections.size === 1);
    // Three attempts in the minute are spent (the refused one counts); even a good ticket waits.
    expect(await refused(env, { ticket: env.ticket('d') })).toBe(429);
    b.ws.close();
  });

  it('a match that is full turns the next player away', async () => {
    const env = await server();
    const sockets = ['a', 'b', 'c'].map((p) => rawSocket(env.url, { ticket: env.ticket(p) }));
    await Promise.all(sockets.map((s) => s.opened));
    await until(() => sockets.every((s) => s.messages.some((m) => m.t === 'welcome')));
    const fourth = rawSocket(env.url, { ticket: env.ticket('d') });
    expect((await fourth.closed).code).toBe(CLOSE.full);
    for (const s of sockets) s.ws.close();
  });
});

describe('a connected client that misbehaves', () => {
  const welcomed = async (env, player) => {
    const socket = rawSocket(env.url, { ticket: env.ticket(player) });
    await socket.opened;
    await until(() => socket.messages.some((m) => m.t === 'welcome'));
    return socket;
  };

  it('a flood is cut off', async () => {
    const env = await server();
    const s = await welcomed(env, 'ann');
    for (let i = 0; i < 400; i++) s.ws.send(JSON.stringify({ t: 'ping', m: i }));
    expect((await s.closed).code).toBe(CLOSE.violation);
  });

  it('frames that are not envelopes are tolerated a few times, then cut off', async () => {
    const env = await server();
    const s = await welcomed(env, 'ann');
    for (const junk of ['nope', '[]', '{"t":"admin","m":1}', '{"t":"in"}', '5']) s.ws.send(junk);
    await new Promise((r) => setTimeout(r, 200));
    expect(s.ws.readyState).toBe(s.ws.OPEN);
    s.ws.send('{"x":1}');
    expect((await s.closed).code).toBe(CLOSE.malformed);
  });

  it('a binary frame, or an oversized one, closes the connection', async () => {
    const env = await server();
    const binary = await welcomed(env, 'ann');
    binary.ws.send(Buffer.from([1, 2, 3]));
    expect((await binary.closed).code).toBe(CLOSE.malformed);
    const big = await welcomed(env, 'bob');
    big.ws.send(JSON.stringify({ t: 'in', m: 'x'.repeat(10000) }));
    expect((await big.closed).code).toBe(1009);
  });

  it('invalid inputs and intents trip the meter and kick only that player', async () => {
    const env = await server();
    const honest = await join(env, 'ann', { held: () => ['ArrowRight'] });
    const s = await welcomed(env, 'mallory');
    for (let i = 0; i < 30; i++) {
      s.ws.send(JSON.stringify({ t: i % 2 ? 'in' : 'do', m: { tick: -1, held: 'all', player: 'ann' } }));
    }
    expect((await s.closed).code).toBe(CLOSE.violation);
    // The honest player is still in the game and still moving.
    const before = honest.game.player.position.x;
    await until(() => honest.game.player.position.x > before + 10);
    expect(honest.net.open).toBe(true);
  });

  it('a silent client is closed for idling', async () => {
    const env = await server('arenaMatch', { idleMs: 400 });
    const s = await welcomed(env, 'ann');
    expect((await s.closed).code).toBe(CLOSE.idle);
  });

  it('a client that does not read is disconnected, not buffered for', async () => {
    const env = await server('arenaMatch', { maxBufferedBytes: 64 * 1024 });
    const s = await welcomed(env, 'ann');
    s.ws._socket.pause();
    // Keep the idle timer away; the server's sends pile up behind the paused socket.
    const keepAlive = setInterval(() => { try { s.ws.send(JSON.stringify({ t: 'ping', m: 1 })); } catch {} }, 100);
    try {
      await until(() => env.server.connections.size === 0, { timeout: 20000 });
    } finally {
      clearInterval(keepAlive);
      s.ws._socket.resume();
    }
    const { code } = await s.closed;
    expect([CLOSE.slow, 1006]).toContain(code);
  });
});

describe('connections come and go', () => {
  it('a player who reconnects in time keeps their avatar and their state', async () => {
    const env = await server();
    const first = await join(env, 'ann');
    const vendor = [...first.game.entities].find((e) => e.name === 'Vendor').netId;
    expect(await first.game.players.local.send('buy', { vendor })).toEqual({ ok: true });
    const avatarId = first.game.player.netId;
    first.leave();
    const again = await join(env, 'ann');
    expect(again.game.player.netId).toBe(avatarId);
    await until(() => again.game.players.local.state.charms === 1);
    // Sequence numbers start over on the new connection and still work.
    expect(await again.game.players.local.send('buy', { vendor })).toEqual({ ok: false, reason: 'sold-out' });
  });

  it('one who does not is removed from the match', async () => {
    const env = await server();
    const watcher = await join(env, 'bob');
    const ann = await join(env, 'ann');
    const annAvatar = ann.game.player.netId;
    await until(() => watcher.game.entityById(annAvatar));
    ann.leave();
    await until(() => !watcher.game.entityById(annAvatar), { timeout: 4000 });
  });

  it('connecting again elsewhere replaces the old connection', async () => {
    const env = await server();
    const old = await join(env, 'ann');
    await join(env, 'ann');
    expect((await old.closed).code).toBe(CLOSE.replaced);
  });

  it('stopping the server closes every connection', async () => {
    const env = await startServer();
    const ann = await joinAs(env, 'ann');
    await env.stop();
    expect((await ann.closed).code).toBe(CLOSE.shutdown);
    ann.leave();
  });
});

describe('a match that breaks takes down only itself', () => {
  for (const [fixture, reason, options] of [
    ['crashMatch', /match error: game code bug/],
    ['loopMatch', /stopped responding/, { watchdogMs: 1000 }],
    ['memoryMatch', /match (error|stopped)/, { memoryMb: 48 }],
    ['spawnMatch', /entity limit/]
  ]) {
    it(`${fixture}: its players are told, a healthy match on the same server carries on`, async () => {
      const env = await server(fixture, options);
      const healthy = await join(env, 'ann', { match: 'good', held: () => ['ArrowRight'] });
      const doomed = await join(env, 'bob', { match: 'bad' });
      const ended = new Promise((resolve) => env.server.once('matchEnded', resolve));
      const { code, reason: closeReason } = await doomed.closed;
      expect(code).toBe(CLOSE.ended);
      expect((await ended).reason).toMatch(reason);
      expect(closeReason).toMatch(reason);
      const before = healthy.game.player.position.x;
      await until(() => healthy.game.player.position.x > before + 10);
      expect(healthy.net.open).toBe(true);
      expect(env.server.matches.has('bad')).toBe(false);
    });
  }
});
