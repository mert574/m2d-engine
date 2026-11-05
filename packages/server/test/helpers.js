import WebSocket from 'ws';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { NetClient } from 'm2d-engine/net/client.js';
import { createServer, issueTicket } from '../src/index.js';
import { INPUT, GAME_OPTIONS, registerArena } from './fixtures/arenaGame.js';

export const SECRET = 's'.repeat(40);

/** A server on a free port, with one of the fixture match modules. */
export async function startServer(fixture = 'arenaMatch', options = {}) {
  const server = createServer({ match: new URL(`./fixtures/${fixture}.js`, import.meta.url), secret: SECRET, host: '127.0.0.1', ...options });
  const port = await server.start();
  const url = `ws://127.0.0.1:${port}/play`;
  return {
    server, port, url,
    ticket: (player, match = 'm1') => issueTicket(SECRET, { player, match }),
    stop: () => server.stop()
  };
}

/** A client game connected as `player`, ticking in real time. */
export async function joinAs(env, player, { match = 'm1', held = () => [] } = {}) {
  await initPhysics();
  const game = new M2D(null, { headless: true, ...GAME_OPTIONS });
  registerArena(game);
  game.input.setSnapshotSource(() => ({ down: held() }));
  const net = await NetClient.connect(game, { url: env.url, ticket: env.ticket(player, match), schema: INPUT });
  const timer = setInterval(() => game.step(1), 1000 / 60);
  const closed = new Promise((resolve) => net.on('close', resolve));
  let left = false;
  return {
    game, net, closed,
    leave() {
      if (left) return;
      left = true;
      clearInterval(timer);
      net.close();
      game.destroy();
    },
    stopTicking() { clearInterval(timer); }
  };
}

/** A raw socket, for saying things a well-behaved client never would. */
export function rawSocket(url, { ticket, origin, query = '' } = {}) {
  const target = ticket === undefined ? `${url}${query}` : `${url}?ticket=${encodeURIComponent(ticket)}${query}`;
  const ws = new WebSocket(target, { origin, perMessageDeflate: false });
  const messages = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const opened = new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (req, res) => reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })));
    ws.on('error', (error) => reject(error));
  });
  const closed = new Promise((resolve) => ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  return { ws, messages, opened, closed };
}

/** Poll until `check` returns something truthy. */
export async function until(check, { timeout = 5000, every = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}
