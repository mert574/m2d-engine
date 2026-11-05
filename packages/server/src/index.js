/**
 * m2d-server: run m2d-engine games as authoritative matches.
 *
 *   import { createServer } from 'm2d-server';
 *   const server = createServer({
 *     match: new URL('./keepMatch.js', import.meta.url),
 *     secret: process.env.TICKET_SECRET,
 *     origins: ['https://play.example.com']
 *   });
 *   await server.start();
 *
 * The match module's default export is `defineMatch(...)`; see match.js.
 */

export { createServer } from './server.js';
export { defineMatch, removeEntitiesOf } from './match.js';
export { issueTicket, TicketVerifier } from './tickets.js';
export { CLOSE, decodeEnvelope } from './protocol.js';
export { TokenBucket, KeyedLimiter } from './limits.js';
