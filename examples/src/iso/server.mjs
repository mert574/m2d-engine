// Cinder Keep's match server, for local play:
//
//   node examples/src/iso/server.mjs
//
// then open the keep with `?online=ws://127.0.0.1:8787` in two windows.
//
// This is a development server: it hands a ticket to anyone who asks at
// /dev/ticket. A real deployment gets tickets from its lobby, which signs
// them with the same secret (see m2d-server's tickets.js), and turns
// `devTickets` off.

import { createServer } from 'm2d-server';

const port = Number(process.env.PORT ?? 8787);
const secret = process.env.TICKET_SECRET ?? 'cinder-keep-development-secret-not-for-production';
const origins = (process.env.ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(',');

const server = createServer({
  match: new URL('./keepMatch.js', import.meta.url),
  secret,
  port,
  host: process.env.HOST ?? '127.0.0.1',
  origins,
  devTickets: true
});

const bound = await server.start();
console.log(`Cinder Keep match server on ws://127.0.0.1:${bound}/play (origins: ${origins.join(', ')})`);
server.on('matchEnded', ({ id, reason }) => console.log(`match ${id} ended: ${reason}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
