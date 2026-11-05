import { describe, it, expect } from 'vitest';
import { decodeEnvelope } from '../src/protocol.js';
import { TokenBucket, KeyedLimiter } from '../src/limits.js';

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
