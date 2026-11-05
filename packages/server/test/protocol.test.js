import { describe, it, expect, afterEach } from 'vitest';
import { decodeEnvelope } from '../src/protocol.js';
import { TokenBucket, KeyedLimiter } from '../src/limits.js';
import { startServer, rawSocket, until } from './helpers.js';

describe('envelopes', () => {
  it('accepts the three kinds', () => {
    expect(decodeEnvelope('{"t":"in","m":{"tick":1,"held":0}}')).toEqual({ ok: true, t: 'in', m: { tick: 1, held: 0 } });
    expect(decodeEnvelope('{"t":"do","m":null}').ok).toBe(true);
    expect(decodeEnvelope('{"t":"ping","m":12.5}').ok).toBe(true);
  });
  for (const text of ['', 'not json', 'null', '[]', '5', '"in"', '{}', '{"t":"in"}', '{"m":1}',
    '{"t":"in","m":1,"x":2}', '{"t":"admin","m":1}', '{"t":5,"m":1}', '{"t":"ping","m":"x"}', '{"t":"ping","m":null}',
    '{"__proto__":{"t":"in"},"m":1}']) {
    it(`refuses ${JSON.stringify(text)}`, () => expect(decodeEnvelope(text).ok).toBe(false));
  }
});

describe('limits', () => {
  it('a bucket spends its burst, then refills at its rate', () => {
    const bucket = new TokenBucket(10, 3, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(100)).toBe(true);
    expect(bucket.take(100)).toBe(false);
  });

  it('keys are limited apart, and the table forgets refilled keys rather than growing', () => {
    const limiter = new KeyedLimiter(1, 1, 2);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    expect(limiter.take('b', 0)).toBe(true);
    expect(limiter.take('c', 0)).toBe(false); // table full of fresh keys: fail closed
    expect(limiter.take('c', 5000)).toBe(true); // a and b refilled and were forgotten
    expect(limiter.buckets.size).toBe(1);
  });
});

describe('compression', () => {
  /**
   * `permessage-deflate` is on by default. State messages are JSON full of
   * repeated keys, so they halve; the worry that once had it switched off
   * is an inbound frame that inflates enormously, which `maxPayload` bounds
   * because `ws` enforces it against the decompressed size.
   */
  let env;

  afterEach(async () => {
    await env?.stop();
    env = null;
  });

  it('negotiates with a client that offers it, and talks normally over it', async () => {
    env = await startServer();
    const client = rawSocket(env.url, { ticket: env.ticket('zip'), deflate: true });
    const ws = await client.opened;
    expect(ws.extensions).toContain('permessage-deflate');
    await until(() => client.messages.some((m) => m.t === 'welcome'));
    // And it answers over the compressed connection.
    ws.send(JSON.stringify({ t: 'ping', m: 7 }));
    const pong = await until(() => client.messages.find((m) => m.t === 'pong'));
    expect(pong.m).toBe(7);
    ws.close();
  });

  it('still refuses a frame that is small compressed and huge inflated', async () => {
    env = await startServer('arenaMatch', { maxMessageBytes: 2048 });
    const client = rawSocket(env.url, { ticket: env.ticket('bomb'), deflate: true });
    const ws = await client.opened;
    await until(() => client.messages.some((m) => m.t === 'welcome'));
    // A megabyte of one repeated character: a few hundred bytes on the wire.
    ws.send(JSON.stringify({ t: 'in', m: 'a'.repeat(1024 * 1024) }));
    const { code } = await client.closed;
    // 1009 is "message too big": the limit is applied to what it inflates to.
    expect(code).toBe(1009);
  });

  it('can be turned off', async () => {
    env = await startServer('arenaMatch', { compress: false });
    const client = rawSocket(env.url, { ticket: env.ticket('plain'), deflate: true });
    const ws = await client.opened;
    expect(ws.extensions).toBe('');
    await until(() => client.messages.some((m) => m.t === 'welcome'));
    ws.close();
  });
});
