import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { request, bytes } from '../src/pipeline/http.mjs';

/**
 * The pipeline's one way onto the network: a dropped connection, a body cut
 * short and the server's own 5xx are asked again; a 404 and malformed
 * content are not, because waiting would not change them.
 */

const servers: Server[] = [];
afterAll(() => { for (const server of servers) server.close(); });

/** A server that answers each hit in turn with one of the given behaviours. */
async function serving(...plan: Array<(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void>) {
  let hits = 0;
  const server = createServer((req, res) => { const act = plan[Math.min(hits, plan.length - 1)]; hits++; act!(req, res); });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/file`, hits: () => hits };
}
const reset = (req: import('node:http').IncomingMessage) => req.socket.destroy();
const status = (code: number) => (_req: unknown, res: import('node:http').ServerResponse) => { res.writeHead(code); res.end(); };
const body = (text: string) => (_req: unknown, res: import('node:http').ServerResponse) => { res.writeHead(200); res.end(text); };
/** Half the promised body, then the socket dropped once that half is on the wire. */
const truncated = (text: string) => (_req: unknown, res: import('node:http').ServerResponse) => {
  res.writeHead(200, { 'content-length': text.length * 2 });
  res.write(text, () => setTimeout(() => res.socket?.destroy(), 20));
};
/** No waiting between attempts: the test is about what is retried, not how long it takes. */
const atOnce = { pause: () => Promise.resolve() };

describe('a request that survives the network', () => {
  it('asks again after a reset, a body cut short and a 503, and gets the file', async () => {
    const { url, hits } = await serving(reset, truncated('half'), status(503), body('the file'));
    expect(Buffer.from(await bytes(url, atOnce)).toString()).toBe('the file');
    expect(hits()).toBe(4);
  });

  it('gives up at once on a 404', async () => {
    const { url, hits } = await serving(status(404));
    await expect(request(url, (response) => response.text(), { what: 'the file', ...atOnce })).rejects.toThrow(/^the file: 404$/);
    expect(hits()).toBe(1);
  });

  it('does not ask again for content that arrived whole and made no sense', async () => {
    const { url, hits } = await serving(body('not json'));
    await expect(request(url, (response) => response.json(), atOnce)).rejects.toThrow(/Unexpected token|not valid JSON/);
    expect(hits()).toBe(1);
  });

  it('gives up on an attempt that goes quiet, and tries the next one', async () => {
    const quiet = (_req: unknown, res: import('node:http').ServerResponse) => { res.writeHead(200); };
    const { url, hits } = await serving(quiet, body('the file'));
    expect(await request(url, (response) => response.text(), { ...atOnce, timeoutMs: 100 })).toBe('the file');
    expect(hits()).toBe(2);
  });

  it('passes its headers along', async () => {
    const { url } = await serving((req, res) => { res.writeHead(200); res.end(req.headers['user-agent']); });
    expect(await request(url, (response) => response.text(), { headers: { 'User-Agent': 'm2d test' } })).toBe('m2d test');
  });
});
