/**
 * The wire between a client and the server, outside the game.
 *
 * Every client message is a JSON text frame `{ t, m }`:
 *
 * | `t` | `m` |
 * | --- | --- |
 * | `in` | One tick's input, checked by the player's `InputGate` |
 * | `do` | An intent, `{ seq, name, args }`, checked by the player's `IntentQueue` |
 * | `ping` | A number the server echoes back as `{ t: 'pong', m }` |
 *
 * The envelope is checked here, on the connection's thread, before
 * anything reaches the match: a plain object with exactly those two
 * fields, a known `t`. What `m` holds is the match's to judge.
 */

export const CLOSE = Object.freeze({
  /** Nothing heard from the client for too long. */
  idle: 4000,
  /** The same player connected again; the newer connection wins. */
  replaced: 4001,
  /** Not JSON, not text, or not an envelope. */
  malformed: 4002,
  /** The match has as many players as it takes. */
  full: 4003,
  /** Too many messages, or too many invalid ones. */
  violation: 4008,
  /** The client did not read what it was sent fast enough. */
  slow: 4009,
  /** The match is over, or its worker stopped. */
  ended: 4010,
  /** The server is shutting down. */
  shutdown: 1001
});

const TYPES = new Set(['in', 'do', 'ping']);

/**
 * Parse and check one client frame. Never throws.
 * @param {string} text
 * @returns {{ok: true, t: string, m: unknown} | {ok: false}}
 */
export function decodeEnvelope(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const keys = Object.keys(value);
  if (keys.length !== 2 || !('t' in value) || !('m' in value)) return { ok: false };
  if (typeof value.t !== 'string' || !TYPES.has(value.t)) return { ok: false };
  if (value.t === 'ping' && !Number.isFinite(value.m)) return { ok: false };
  return { ok: true, t: value.t, m: value.m };
}
