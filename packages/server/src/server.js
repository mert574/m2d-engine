/**
 * The match server: an HTTP server whose only job is WebSocket upgrades to
 * `path`, each carrying a ticket. Everything a stranger can send is checked
 * before it costs much:
 *
 * 1. Upgrade attempts are rate limited per address, then capped in total
 *    and per address, before the ticket is even read.
 * 2. The `Origin`, when there is one, must be on the allow list.
 * 3. The ticket is verified (signature, expiry, single use) before the
 *    upgrade completes; a bad one never becomes a WebSocket.
 * 4. Frames are capped in size by the WebSocket layer and binary frames are
 *    refused. Compression is on, which is safe here because `maxPayload` is
 *    enforced against the *decompressed* size, so a small frame that
 *    inflates enormously is rejected at the same 4 KB as any other; and
 *    because the contexts are not carried over between messages, so a
 *    connection costs a zlib window per message rather than one held open
 *    for its lifetime. Turn it off with `compress: false`.
 * 5. Each connection has a message rate limit and an envelope check; the
 *    match's own gate and intent queue judge the content.
 * 6. Idle connections and peers that stop answering pings are closed, and
 *    one that does not read what it is sent is disconnected rather than
 *    buffered for.
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { TicketVerifier, issueTicket } from './tickets.js';
import { KeyedLimiter, TokenBucket } from './limits.js';
import { CLOSE, decodeEnvelope } from './protocol.js';
import { MatchHost } from './matchHost.js';

const DEFAULTS = {
  path: '/play',
  host: '0.0.0.0',
  port: 0,
  origins: null,
  trustProxy: false,
  maxConnections: 1000,
  maxConnectionsPerIp: 8,
  upgradesPerIpPerMinute: 30,
  maxMatches: 50,
  maxMessageBytes: 4096,
  messagesPerSecond: 120,
  messageBurst: 240,
  maxEnvelopeErrors: 5,
  idleMs: 15000,
  pingMs: 10000,
  maxBufferedBytes: 1 << 20,
  compress: true,
  compressThreshold: 256,
  memoryMb: 256,
  watchdogMs: 5000,
  devTickets: false
};

const REASON_STATUS = { missing: 401, malformed: 401, signature: 401, expired: 401, lifetime: 401, replayed: 401, busy: 503 };

function reject(socket, status, text) {
  if (socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
  socket.destroy();
}

/**
 * @param {object} options
 * @param {string|URL} options.match - URL of the module whose default export is `defineMatch(...)`
 * @param {string|Buffer} options.secret - Shared with the lobby; at least 32 bytes
 * @param {string[]} [options.origins] - Allowed `Origin` headers. Connections without one (non-browser clients) are allowed
 * @param {boolean} [options.devTickets=false] - Serve `GET /dev/ticket?player=&match=` for local development. Never in production
 */
export function createServer(options) {
  const config = { ...DEFAULTS, ...options };
  if (!config.match) throw new Error('m2d-server: createServer needs `match`, the URL of a match module');
  // A match reports in four times a second; a watchdog shorter than a second would end healthy ones.
  if (!(config.watchdogMs >= 1000)) throw new Error('m2d-server: watchdogMs must be at least 1000');
  const verifier = new TicketVerifier(config.secret, config.tickets);
  const upgrades = new KeyedLimiter(config.upgradesPerIpPerMinute / 60, config.upgradesPerIpPerMinute);
  const matches = new Map();
  const perIp = new Map();
  const connections = new Set();
  const origins = config.origins ? new Set(config.origins) : null;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxMessageBytes,
    // State messages are JSON full of repeated keys and so compress to about
    // half, which on a busy level is the cheapest bandwidth there is. The
    // inflation-bomb worry that had this off belongs to the inbound side,
    // and `maxPayload` already bounds that after decompression. Context
    // takeover is refused in both directions: holding a zlib window per
    // connection for its lifetime is a per-client memory cost a server
    // taking a thousand of them should not pay, and the dictionary buys
    // little when each message is a few hundred bytes.
    perMessageDeflate: config.compress
      ? {
          serverNoContextTakeover: true,
          clientNoContextTakeover: true,
          // Below this a frame's header costs more than the saving.
          threshold: config.compressThreshold,
          concurrencyLimit: 10
        }
      : false,
    clientTracking: false
  });

  const addressOf = (req) => {
    if (config.trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  function send(connection, message) {
    const ws = connection.ws;
    if (ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > config.maxBufferedBytes) {
      closeConnection(connection, CLOSE.slow, 'not reading');
      return;
    }
    ws.send(JSON.stringify(message));
  }

  function closeConnection(connection, code, reason) {
    const ws = connection.ws;
    if (connection.closing) return;
    connection.closing = true;
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ t: 'bye', reason }));
        ws.close(code, reason.slice(0, 120));
      }
    } catch { /* already gone */ }
    // A peer that does not finish the close handshake is cut off.
    setTimeout(() => ws.terminate(), 2000).unref?.();
  }

  function hostFor(id) {
    let host = matches.get(id);
    if (host && !host.ended) return host;
    host = new MatchHost(id, {
      module: config.match,
      memoryMb: config.memoryMb,
      watchdogMs: config.watchdogMs,
      send,
      close: closeConnection,
      onEnd: (ended) => {
        if (matches.get(id) === ended) matches.delete(id);
        server.emit('matchEnded', { id, reason: ended.reason });
      }
    });
    matches.set(id, host);
    return host;
  }

  function onConnection(ws, ip, ticket) {
    const connection = {
      ws, ip, player: ticket.player, closing: false,
      lastHeard: Date.now(), alive: true, envelopeErrors: 0,
      bucket: new TokenBucket(config.messagesPerSecond, config.messageBurst)
    };
    connections.add(connection);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const host = hostFor(ticket.match);
    connection.host = host;

    ws.on('pong', () => { connection.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (connection.closing) return;
      connection.lastHeard = Date.now();
      if (!connection.bucket.take()) {
        closeConnection(connection, CLOSE.violation, 'too many messages');
        return;
      }
      if (isBinary) {
        closeConnection(connection, CLOSE.malformed, 'text frames only');
        return;
      }
      const envelope = decodeEnvelope(data.toString('utf8'));
      if (!envelope.ok) {
        if (++connection.envelopeErrors > config.maxEnvelopeErrors) closeConnection(connection, CLOSE.malformed, 'malformed messages');
        return;
      }
      if (envelope.t === 'ping') {
        send(connection, { t: 'pong', m: envelope.m });
        return;
      }
      host.forward(connection.player, connection, envelope.t, envelope.m);
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      connections.delete(connection);
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip); else perIp.set(ip, left);
      host.drop(connection.player, connection);
    });

    host.join(connection.player, connection);
  }

  const server = http.createServer((req, res) => {
    if (config.devTickets && req.method === 'GET' && req.url.startsWith('/dev/ticket')) {
      const url = new URL(req.url, 'http://local');
      const origin = req.headers.origin;
      if (origin && origins?.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
      try {
        const ticket = issueTicket(config.secret, { player: url.searchParams.get('player'), match: url.searchParams.get('match') ?? 'dev' });
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(ticket);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(error.message);
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  });

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const ip = addressOf(req);
    if (!upgrades.take(ip)) return reject(socket, 429, 'too many attempts');
    if (connections.size >= config.maxConnections) return reject(socket, 503, 'server full');
    if ((perIp.get(ip) ?? 0) >= config.maxConnectionsPerIp) return reject(socket, 429, 'too many connections');
    const origin = req.headers.origin;
    if (origin !== undefined && origins && !origins.has(origin)) return reject(socket, 403, 'origin not allowed');

    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch {
      return reject(socket, 400, 'bad request');
    }
    if (url.pathname !== config.path) return reject(socket, 404, 'not found');
    const ticket = verifier.verify(url.searchParams.get('ticket'));
    if (!ticket.ok) return reject(socket, REASON_STATUS[ticket.reason] ?? 401, `ticket ${ticket.reason}`);
    const existing = matches.get(ticket.match);
    if ((!existing || existing.ended) && matches.size >= config.maxMatches) return reject(socket, 503, 'no room for another match');

    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip, ticket));
  });

  // One timer for every connection: idle ones close, unresponsive ones are cut off.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const connection of connections) {
      if (now - connection.lastHeard > config.idleMs) closeConnection(connection, CLOSE.idle, 'idle');
    }
  }, 1000);
  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) { connection.ws.terminate(); continue; }
      connection.alive = false;
      try { connection.ws.ping(); } catch { /* closing */ }
    }
  }, config.pingMs);
  sweep.unref?.();
  heartbeat.unref?.();

  return Object.assign(server, {
    /** Start listening. Resolves with the bound port. */
    start() {
      if (config.devTickets) console.warn('m2d-server: devTickets is on; anyone can get a ticket. Never use this in production.');
      return new Promise((resolve) => server.listen(config.port, config.host, () => resolve(server.address().port)));
    },
    /** Close every connection and match, and stop listening. */
    async stop() {
      clearInterval(sweep);
      clearInterval(heartbeat);
      for (const connection of connections) closeConnection(connection, CLOSE.shutdown, 'server shutting down');
      await Promise.all([...matches.values()].map((host) => host.stop()));
      matches.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    },
    matches,
    connections
  });
}
