/**
 * Tickets: how a lobby tells a match server who may join which match.
 *
 * The lobby (your own service: accounts, matchmaking) signs a short-lived
 * ticket with a secret it shares with the match servers. The match server
 * checks the signature with no database and no call back to the lobby.
 *
 *   v1.<payload>.<signature>
 *
 * `payload` is base64url JSON with exactly four fields:
 *
 * | Field | Meaning |
 * | --- | --- |
 * | `sub` | The player id: letters, digits, `_` and `-`, 1 to 64 |
 * | `match` | The match id, same alphabet |
 * | `exp` | Expiry, in whole seconds since the epoch |
 * | `jti` | A random id, 8 to 64 of the same alphabet. A ticket is good once |
 *
 * `signature` is base64url HMAC-SHA256 over `v1.<payload>` with the
 * secret. There is one algorithm and it is not named in the ticket, so
 * there is nothing to downgrade. The verifier refuses a ticket that lives
 * longer than `maxTtl`, so a leaked one cannot be good for long, and
 * remembers every `jti` it accepted until it expires, so one cannot be
 * used twice.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const JTI = /^[A-Za-z0-9_-]{8,64}$/;
const SHAPE = /^v1\.([A-Za-z0-9_-]{1,700})\.([A-Za-z0-9_-]{43})$/;
const FIELDS = ['exp', 'jti', 'match', 'sub'];

function keyOf(secret) {
  const key = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw new Error('m2d-server: a ticket secret must be at least 32 bytes');
  }
  return key;
}

const sign = (key, body) => createHmac('sha256', key).update(`${VERSION}.${body}`).digest('base64url');

/**
 * Sign a ticket. For the lobby, and for tests.
 * @param {string|Buffer} secret
 * @param {object} claims
 * @param {string} claims.player
 * @param {string} claims.match
 * @param {number} [claims.ttl=60] - Seconds it is good for
 * @param {number} [claims.now=Date.now()] - In ms
 */
export function issueTicket(secret, { player, match, ttl = 60, now = Date.now() }) {
  const key = keyOf(secret);
  if (!ID.test(player ?? '') || !ID.test(match ?? '')) throw new Error('m2d-server: player and match ids are 1 to 64 of A-Z a-z 0-9 _ -');
  if (!Number.isInteger(ttl) || ttl < 1) throw new Error('m2d-server: ttl is a whole number of seconds');
  const payload = { sub: player, match, exp: Math.floor(now / 1000) + ttl, jti: randomBytes(12).toString('base64url') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${VERSION}.${body}.${sign(key, body)}`;
}

const refuse = (reason) => ({ ok: false, reason });

export class TicketVerifier {
  /**
   * @param {string|Buffer} secret
   * @param {object} [options]
   * @param {number} [options.maxTtl=300] - Longest a ticket may be good for, in seconds
   * @param {number} [options.leeway=5] - Clock skew tolerated, in seconds
   * @param {number} [options.maxRemembered=100000] - Used ticket ids kept. Past it, new tickets are refused until old ones expire
   */
  constructor(secret, { maxTtl = 300, leeway = 5, maxRemembered = 100000 } = {}) {
    this.key = keyOf(secret);
    this.maxTtl = maxTtl;
    this.leeway = leeway;
    this.maxRemembered = maxRemembered;
    /** jti -> exp, for tickets already used. */
    this.used = new Map();
  }

  /**
   * Check a ticket and use it up. Never throws.
   * @param {unknown} ticket
   * @param {number} [now=Date.now()] - In ms
   * @returns {{ok: true, player: string, match: string} | {ok: false, reason: string}}
   */
  verify(ticket, now = Date.now()) {
    if (typeof ticket !== 'string') return refuse('missing');
    const parts = SHAPE.exec(ticket);
    if (!parts) return refuse('malformed');
    const [, body, signature] = parts;
    const expected = Buffer.from(sign(this.key, body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return refuse('signature');

    let payload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return refuse('malformed');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return refuse('malformed');
    const keys = Object.keys(payload).sort();
    if (keys.length !== FIELDS.length || keys.some((key, i) => key !== FIELDS[i])) return refuse('malformed');
    const { sub, match, exp, jti } = payload;
    if (typeof sub !== 'string' || !ID.test(sub) || typeof match !== 'string' || !ID.test(match)) return refuse('malformed');
    if (typeof jti !== 'string' || !JTI.test(jti) || !Number.isSafeInteger(exp)) return refuse('malformed');

    const seconds = now / 1000;
    if (exp + this.leeway < seconds) return refuse('expired');
    if (exp - seconds > this.maxTtl + this.leeway) return refuse('lifetime');

    if (this.used.has(jti)) return refuse('replayed');
    if (this.used.size >= this.maxRemembered) {
      for (const [id, until] of this.used) if (until + this.leeway < seconds) this.used.delete(id);
      // Fail closed: forgetting a used ticket would let it be used again.
      if (this.used.size >= this.maxRemembered) return refuse('busy');
    }
    this.used.set(jti, exp);
    return { ok: true, player: sub, match };
  }
}
