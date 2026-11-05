import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { issueTicket, TicketVerifier } from '../src/tickets.js';

/** Tickets, attacked: anything but a fresh, honestly signed, unused ticket is refused. */

const SECRET = 'a'.repeat(32);
const NOW = 1_800_000_000_000;

const forge = (payload, secret = SECRET) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`v1.${body}`).digest('base64url');
  return `v1.${body}.${sig}`;
};
const claims = (over = {}) => ({ sub: 'ann', match: 'm1', exp: NOW / 1000 + 60, jti: 'abcdefgh12', ...over });

describe('tickets', () => {
  it('a fresh ticket verifies once', () => {
    const verifier = new TicketVerifier(SECRET);
    const ticket = issueTicket(SECRET, { player: 'ann', match: 'm1', now: NOW });
    expect(verifier.verify(ticket, NOW)).toEqual({ ok: true, player: 'ann', match: 'm1' });
    expect(verifier.verify(ticket, NOW)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('refuses a short secret', () => {
    expect(() => new TicketVerifier('short')).toThrow(/32 bytes/);
    expect(() => issueTicket('short', { player: 'a', match: 'b' })).toThrow(/32 bytes/);
  });

  it('refuses bad ids when issuing', () => {
    expect(() => issueTicket(SECRET, { player: 'a b', match: 'm' })).toThrow();
    expect(() => issueTicket(SECRET, { player: 'a', match: 'x'.repeat(65) })).toThrow();
  });

  const verifier = () => new TicketVerifier(SECRET);
  const cases = [
    ['nothing', undefined, 'missing'],
    ['a number', 5, 'missing'],
    ['an empty string', '', 'malformed'],
    ['no version', forge(claims()).slice(3), 'malformed'],
    ['another version', 'v2' + forge(claims()).slice(2), 'malformed'],
    ['an extra part', forge(claims()) + '.x', 'malformed'],
    ['a short signature', forge(claims()).slice(0, -1), 'malformed'],
    ['a huge ticket', `v1.${'A'.repeat(5000)}.${'A'.repeat(43)}`, 'malformed'],
    ['the wrong secret', forge(claims(), 'b'.repeat(32)), 'signature'],
    ['a tampered payload', (() => { const [v, , s] = forge(claims()).split('.'); return `${v}.${Buffer.from(JSON.stringify(claims({ sub: 'admin' }))).toString('base64url')}.${s}`; })(), 'signature'],
    ['a flipped signature bit', (() => { const t = forge(claims()); return t.slice(0, -2) + (t.at(-2) === 'A' ? 'B' : 'A') + t.at(-1); })(), 'signature'],
    ['expired', forge(claims({ exp: NOW / 1000 - 10 })), 'expired'],
    ['good for too long', forge(claims({ exp: NOW / 1000 + 3600 })), 'lifetime'],
    ['an extra claim', forge({ ...claims(), admin: true }), 'malformed'],
    ['a missing claim', forge({ sub: 'ann', match: 'm1', exp: NOW / 1000 + 60 }), 'malformed'],
    ['a bad player id', forge(claims({ sub: '../etc' })), 'malformed'],
    ['a non-integer expiry', forge(claims({ exp: NOW / 1000 + 0.5 })), 'malformed'],
    ['a string expiry', forge(claims({ exp: String(NOW / 1000 + 60) })), 'malformed'],
    ['a short ticket id', forge(claims({ jti: 'abc' })), 'malformed'],
    ['an array payload', forge([1, 2, 3]), 'malformed'],
    ['a JSON __proto__', (() => { const body = Buffer.from('{"sub":"a","match":"m","exp":1,"jti":"abcdefgh","__proto__":{}}').toString('base64url'); return `v1.${body}.${createHmac('sha256', SECRET).update(`v1.${body}`).digest('base64url')}`; })(), 'malformed']
  ];
  for (const [name, ticket, reason] of cases) {
    it(`refuses ${name}`, () => {
      expect(verifier().verify(ticket, NOW)).toEqual({ ok: false, reason });
    });
  }

  it('tolerates a little clock skew and no more', () => {
    expect(verifier().verify(forge(claims({ exp: NOW / 1000 - 3 })), NOW).ok).toBe(true);
    expect(verifier().verify(forge(claims({ exp: NOW / 1000 - 6 })), NOW).reason).toBe('expired');
  });

  it('fails closed when it cannot remember another ticket, and recovers as old ones expire', () => {
    const small = new TicketVerifier(SECRET, { maxRemembered: 2 });
    expect(small.verify(forge(claims({ jti: 'aaaaaaaa1' })), NOW).ok).toBe(true);
    expect(small.verify(forge(claims({ jti: 'aaaaaaaa2' })), NOW).ok).toBe(true);
    expect(small.verify(forge(claims({ jti: 'aaaaaaaa3' })), NOW).reason).toBe('busy');
    const later = NOW + 120_000;
    expect(small.verify(forge(claims({ jti: 'aaaaaaaa4', exp: later / 1000 + 60 })), later).ok).toBe(true);
  });
});
