/**
 * Intents: the discrete requests a client makes of the simulation.
 *
 * Held input (see input.js) carries what a player is doing with the
 * controls: moving, aiming, firing. It cannot carry a choice that exists
 * only in the client's UI, such as which inventory slot to move an item to
 * or which of a vendor's wares to buy. Those are intents: named, typed
 * requests the game declares once, in the module both the browser and the
 * server import.
 *
 *   export const intents = defineIntents({
 *     moveItem: {
 *       args: { from: slot(SIZE), to: slot(SIZE) },
 *       rate: 10,
 *       run(player, { from, to }) {
 *         if (player.inventory.isEmpty(from)) return reject('empty-slot');
 *         player.inventory.swap(from, to);
 *       }
 *     },
 *     sell: {
 *       args: { slot: slot(SIZE), vendor: entity({ actor: 'Vendor', within: 96 }) },
 *       run(player, { slot, vendor }) { ... }
 *     }
 *   });
 *
 * A client sends `{ seq, name, args }`; `seq` counts up per connection.
 * The sender is always the connection the message came in on, never a
 * field of the message.
 *
 * ## When an intent runs
 *
 * An intent is not a remote procedure that changes state when a socket
 * message arrives. `IntentQueue.submit` files it for the *next* tick, and
 * `apply` runs the filed intents at the start of that tick, before any
 * entity updates, in a deterministic order: by player, then by `seq`.
 * State still changes only inside ticks, so replays, snapshots and the
 * determinism tests hold, and the client never chooses the tick.
 *
 * ## Three layers of checks
 *
 * 1. Static, generated from the declaration, in `IntentSet.decode`: the
 *    message shape, a known name, exactly the declared argument fields,
 *    each of the declared type and range. Never throws. A failure is a
 *    violation on the connection's `ViolationMeter`, like junk input.
 * 2. Rate: each intent declares how many a player may send per second;
 *    past it a submission is refused and counted as a violation.
 * 3. The game's own `run(player, args, context)`, which returns
 *    `reject(reason)` to refuse. Reference arguments are resolved first:
 *    `entity({ actor, owned, within })` turns a network id into the live
 *    entity and checks its actor, that the sender owns it and how far it
 *    is from the sender's avatar, so "act on something you do not own or
 *    are not near" is declared, not remembered in every `run`.
 *
 * Refusals in layer 3 are results the client receives (`{ seq, ok: false,
 * reason }`), not violations: an honest client's view can be a tick stale.
 */

import { ViolationMeter } from './input.ts';
import type { M2D } from '../core/m2d.js';
import type { Entity } from '../core/entity.ts';

const MESSAGE_FIELDS = ['seq', 'name', 'args'];
/** Sequence numbers older than this many below the highest seen are dropped as stale. */
const SEQ_WINDOW = 256;

/** A refusal: from `decode`, from a reference's `resolve`, or from a game's `run`. */
export interface Rejection { ok: false; reason: string; detail?: string }

const reject = (reason: string, detail?: string): Rejection => ({ ok: false, reason, detail });
const refusal = (reason: string, detail: string) => ({ accepted: false as const, reason, detail });

/** The sender an intent runs as: the members the engine's checks read. */
export interface IntentPlayer {
  id: string;
  avatar: Entity | null;
  [key: string]: unknown;
}

/** What `resolve` and `run` are handed besides the arguments. */
export interface IntentContext {
  game: M2D;
  player: IntentPlayer;
  tick: number;
}

/**
 * An argument type: a static `check` of the wire value, and for a
 * reference a `resolve` against the live world at apply time. `V` is what
 * crosses the wire, `R` what `run` receives.
 */
export interface ArgType<V, R = V> {
  readonly kind: string;
  check(value: unknown): string | null;
  resolve?(value: V, context: IntentContext): { ok: true; value: R } | Rejection;
  /**
   * Type-only: what `run` receives for this argument. Never set — it is
   * how `defineIntents` reads `R` off a type with no `resolve`.
   */
  readonly resolvesTo?: R;
}

/** Any argument type, whatever it carries. */
export type AnyArg = ArgType<never, unknown>;

/** The arguments `run` receives for a declaration's `args`. */
export type ResolvedArgs<A> = { [F in keyof A]: A[F] extends ArgType<never, infer R> ? R : never };

/** One intent as a game declares it. */
export interface IntentDeclaration<A extends Record<string, AnyArg>> {
  args?: A;
  /** Per second per player (default 5). */
  rate?: number;
  /** Returns `reject(reason)` to refuse; anything else is success. */
  run(player: IntentPlayer, args: ResolvedArgs<A>, context: IntentContext): unknown;
}

/** A filed intent, as the queue keeps it. */
interface Filed { seq: number; name: string; args: Record<string, unknown>; at: number }

/** The outcomes a queue counts. */
type QueueOutcome = 'shape' | 'seq' | 'name' | 'args' | 'rate' | 'duplicate' | 'stale';

/** Exactly these own keys on a plain object, no getters. */
function plainWithFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  for (const key of keys) {
    if (typeof key !== 'string' || !fields.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
  }
  return true;
}

// === Argument types ===
//
// Each is `{ check(value) -> null | reason, resolve?(value, context) -> {ok, value|reason} }`.
// `check` is static and never throws; `resolve` runs at apply time against
// the live world.

const safeInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

/** A whole number from `min` to `max` inclusive. */
export function int(min: number, max: number): ArgType<number> {
  if (!safeInt(min) || !safeInt(max) || min > max) throw new Error('M2D intents: int(min, max) needs whole numbers with min <= max');
  return { kind: 'int', check: (v) => (safeInt(v) && v >= min && v <= max ? null : `a whole number from ${min} to ${max}`) };
}

/** A slot index into a container of `size`. */
export function slot(size: number): ArgType<number> {
  if (!safeInt(size) || size < 1) throw new Error('M2D intents: slot(size) needs a whole number from 1 up');
  return { ...int(0, size - 1), kind: 'slot' };
}

/** A finite number from `min` to `max`. */
export function num(min: number, max: number): ArgType<number> {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error('M2D intents: num(min, max) needs finite numbers with min <= max');
  return { kind: 'num', check: (v) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? null : `a number from ${min} to ${max}`) };
}

export function bool(): ArgType<boolean> {
  return { kind: 'bool', check: (v) => (typeof v === 'boolean' ? null : 'true or false') };
}

/** A string of at most `maxLength` UTF-16 units. */
export function str(maxLength: number): ArgType<string> {
  if (!safeInt(maxLength) || maxLength < 0) throw new Error('M2D intents: str(maxLength) needs a whole number from 0 up');
  return { kind: 'str', check: (v) => (typeof v === 'string' && v.length <= maxLength ? null : `a string of at most ${maxLength} characters`) };
}

/** One of a fixed list of strings or numbers. */
export function oneOf<const T extends readonly (string | number)[]>(values: T): ArgType<T[number]> {
  if (!Array.isArray(values) || values.length === 0) throw new Error('M2D intents: oneOf needs a non-empty array');
  const set = new Set<unknown>(values);
  return { kind: 'oneOf', check: (v) => (((typeof v === 'string' || typeof v === 'number') && set.has(v)) ? null : `one of ${values.join(', ')}`) };
}

/** An array of at most `max` items of `type`. */
export function list<V, R>(type: ArgType<V, R>, max: number): ArgType<V[], R[]> {
  if (!type?.check || !safeInt(max) || max < 0) throw new Error('M2D intents: list(type, max) needs an argument type and a whole number');
  const resolveItem = type.resolve?.bind(type);
  return {
    kind: 'list',
    check(v: unknown) {
      if (!Array.isArray(v) || v.length > max) return `a list of at most ${max} items`;
      for (const item of v) {
        const why = type.check(item);
        if (why) return `a list whose items are each ${why}`;
      }
      return null;
    },
    resolve: resolveItem && ((v: V[], context: IntentContext) => {
      const out: R[] = [];
      for (const item of v) {
        const resolved = resolveItem(item, context);
        if (!resolved.ok) return resolved;
        out.push(resolved.value);
      }
      return { ok: true as const, value: out };
    })
  };
}

/**
 * A reference to a live entity by network id. `actor` restricts the
 * entity's `name`; `owned` requires the sender to own it
 * (`entity.playerId`); `within` caps how far, in px, it may be from the
 * sender's avatar — a number, or the target's own reach read off it on
 * the server (`(vendor) => vendor.tradeRadius`).
 */
export function entity({ actor, owned = false, within }: {
  actor?: string | string[];
  owned?: boolean;
  within?: number | ((target: Entity) => number);
} = {}): ArgType<number, Entity> {
  const actors = actor === undefined ? null : new Set(Array.isArray(actor) ? actor : [actor]);
  if (within !== undefined && typeof within !== 'function' && !(Number.isFinite(within) && within >= 0)) {
    throw new Error('M2D intents: entity({ within }) needs a non-negative number or a function of the target');
  }
  return {
    kind: 'entity',
    check: (v) => (safeInt(v) && v >= 1 ? null : 'an entity id'),
    resolve(id: number, { game, player }: IntentContext) {
      const target = game.entityById(id) as Entity | null | undefined;
      if (!target) return reject('no-such-entity');
      if (actors && !actors.has(target.name)) return reject('wrong-entity');
      if (owned && target.playerId !== player.id) return reject('not-owned');
      if (within !== undefined) {
        const avatar = player.avatar;
        if (!avatar) return reject('no-avatar');
        const reach: number = typeof within === 'function' ? within(target) : within;
        if (!(Number.isFinite(reach) && reach >= 0)) return reject('too-far');
        const dx = target.position.x - avatar.position.x;
        const dy = target.position.y - avatar.position.y;
        if (dx * dx + dy * dy > reach * reach) return reject('too-far');
      }
      return { ok: true as const, value: target };
    }
  };
}

// === The set ===

/**
 * A game's intents. Each `run` receives its arguments typed from its own
 * `args` declaration: `int()` a number, `entity()` the live Entity,
 * `oneOf(['a', 'b'])` the literal union.
 */
export function defineIntents<T extends Record<string, Record<string, AnyArg>>>(
  declarations: { [K in keyof T]: IntentDeclaration<T[K]> }
): IntentSet {
  return new IntentSet(declarations as Record<string, IntentDeclaration<Record<string, AnyArg>>>);
}

/** A declared intent, as the set keeps it. */
interface Declared {
  name: string;
  args: Record<string, AnyArg>;
  fields: string[];
  rate: number;
  run: IntentDeclaration<Record<string, AnyArg>>['run'];
}

export { reject };

export class IntentSet {
  intents: Map<string, Declared>;

  constructor(declarations: Record<string, IntentDeclaration<Record<string, AnyArg>>>) {
    if (!declarations || typeof declarations !== 'object') throw new Error('M2D intents: defineIntents needs an object of declarations');
    this.intents = new Map();
    for (const [name, declaration] of Object.entries(declarations)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name)) throw new Error(`M2D intents: '${name}' is not a valid intent name`);
      if (typeof declaration?.run !== 'function') throw new Error(`M2D intents: '${name}' needs a run(player, args, context) function`);
      const rate = declaration.rate ?? 5;
      if (!(Number.isFinite(rate) && rate > 0)) throw new Error(`M2D intents: '${name}' rate must be a positive number per second`);
      const args: Record<string, AnyArg> = declaration.args ?? {};
      for (const [field, type] of Object.entries(args)) {
        if (typeof type?.check !== 'function') throw new Error(`M2D intents: '${name}.${field}' needs an argument type such as int() or entity()`);
      }
      this.intents.set(name, { name, args, fields: Object.keys(args).sort(), rate, run: declaration.run });
    }
    Object.freeze(this);
  }

  get names(): string[] {
    return [...this.intents.keys()];
  }

  /** Check a message statically. Never throws. */
  decode(message: unknown): { ok: true; value: { seq: number; name: string; args: Record<string, unknown> } } | Rejection {
    try {
      return this.#decode(message);
    } catch {
      return reject('shape', 'the message could not be read');
    }
  }

  #decode(message: unknown): { ok: true; value: { seq: number; name: string; args: Record<string, unknown> } } | Rejection {
    if (!plainWithFields(message, MESSAGE_FIELDS)) return reject('shape', 'expected a plain object with exactly seq, name and args');
    const { seq, name, args } = message;
    if (!safeInt(seq) || seq < 1) return reject('seq', 'seq must be a whole number from 1 up');
    if (typeof name !== 'string' || !this.intents.has(name)) return reject('name', 'unknown intent');
    const intent = this.intents.get(name)!;
    if (!plainWithFields(args, intent.fields)) {
      return reject('args', `${name} takes exactly ${intent.fields.join(', ') || 'no arguments'}`);
    }
    const clean: Record<string, unknown> = {};
    for (const field of intent.fields) {
      const why = intent.args[field]!.check(args[field]);
      if (why) return reject('args', `${name}.${field} must be ${why}`);
      // Copy the primitive or the array; nothing from the wire is kept by reference.
      const value = args[field];
      clean[field] = Array.isArray(value) ? [...value] : value;
    }
    return { ok: true, value: { seq, name, args: clean } };
  }
}

// === The queue ===

/**
 * One player's intents: filed as they arrive, applied at the start of the
 * next tick. `clock` is the simulation's current tick; `ticksPerSecond`
 * scales the rate limits; `meter` is shared with the player's input gate.
 */
export class IntentQueue {
  set: IntentSet;
  clock: () => number;
  ticksPerSecond: number;
  meter: ViolationMeter;
  /** Filed, not yet applied, by seq. */
  pending: Map<number, Filed>;
  /** Results of applied intents, for the connection to send back. */
  results: { seq: number; ok: boolean; reason?: string }[];
  /** Refusals and drops by outcome. */
  counts: Record<QueueOutcome, number>;

  constructor(set: IntentSet, { clock, ticksPerSecond = 60, meter }: { clock?: () => number; ticksPerSecond?: number; meter?: ViolationMeter } = {}) {
    if (!(set instanceof IntentSet)) throw new Error('M2D intents: an IntentQueue needs an IntentSet');
    if (typeof clock !== 'function') throw new Error('M2D intents: an IntentQueue needs a clock() returning the current tick');
    this.set = set;
    this.clock = clock;
    this.ticksPerSecond = ticksPerSecond;
    this.meter = meter ?? new ViolationMeter();
    this.pending = new Map();
    this.results = [];
    this.counts = { shape: 0, seq: 0, name: 0, args: 0, rate: 0, duplicate: 0, stale: 0 };
    this.#highest = 0;
    this.#seen = new Set();
    this.#buckets = new Map();
  }

  #highest: number;
  #seen: Set<number>;
  #buckets: Map<string, { tokens: number; at: number }>;

  get exceeded(): boolean {
    return this.meter.exceeded;
  }

  /** File a message for the next tick. Never throws. */
  submit(message: unknown): { accepted: boolean; reason: string | null; detail?: string } {
    const decoded = this.set.decode(message);
    if (!decoded.ok) return this.#refuse(decoded.reason as QueueOutcome, decoded.detail ?? '', true);
    const { seq, name, args } = decoded.value;

    if (seq <= this.#highest - SEQ_WINDOW) return this.#refuse('stale', `seq ${seq} is too old`, false);
    if (this.#seen.has(seq)) return this.#refuse('duplicate', `seq ${seq} was already filed`, false);
    if (!this.#takeToken(name)) return this.#refuse('rate', `${name} is sent faster than its rate allows`, true);

    this.#seen.add(seq);
    if (seq > this.#highest) {
      this.#highest = seq;
      const floor = this.#highest - SEQ_WINDOW;
      for (const old of this.#seen) if (old <= floor) this.#seen.delete(old);
    }
    this.pending.set(seq, { seq, name, args, at: this.clock() + 1 });
    return { accepted: true, reason: null };
  }

  /**
   * Run everything filed for `tick` or earlier, in seq order, as `player`.
   * Called by the engine at the start of each tick. Returns the intents applied.
   */
  apply(tick: number, player: IntentPlayer, game: M2D): number {
    if (this.pending.size === 0) return 0;
    const due = [...this.pending.values()].filter((entry) => entry.at <= tick).sort((a, b) => a.seq - b.seq);
    for (const entry of due) {
      this.pending.delete(entry.seq);
      this.results.push({ seq: entry.seq, ...this.#run(entry, player, game, tick) });
    }
    return due.length;
  }

  /** Take the results of applied intents, oldest first. */
  drainResults(): { seq: number; ok: boolean; reason?: string }[] {
    return this.results.splice(0);
  }

  #run(entry: Filed, player: IntentPlayer, game: M2D, tick: number): { ok: boolean; reason?: string } {
    const intent = this.set.intents.get(entry.name)!;
    const context: IntentContext = { game, player, tick };
    const resolved: Record<string, unknown> = {};
    for (const field of intent.fields) {
      const type = intent.args[field]!;
      if (!type.resolve) { resolved[field] = entry.args[field]; continue; }
      // Checked by `decode` against this very type, so the wire value is its V.
      const result = type.resolve(entry.args[field] as never, context);
      if (!result.ok) return { ok: false, reason: result.reason };
      resolved[field] = result.value;
    }
    let outcome: unknown;
    try {
      outcome = intent.run(player, resolved as ResolvedArgs<Record<string, AnyArg>>, context);
    } catch (error) {
      console.error(`M2D intents: '${entry.name}' threw`, error);
      return { ok: false, reason: 'error' };
    }
    const answer = outcome as { ok?: unknown; reason?: unknown } | null;
    if (answer && typeof answer === 'object' && answer.ok === false && typeof answer.reason === 'string') {
      return { ok: false, reason: answer.reason };
    }
    return { ok: true };
  }

  /** Token bucket per intent: `rate` per second, holding at most a second's worth (at least 1). */
  #takeToken(name: string): boolean {
    const rate = this.set.intents.get(name)!.rate;
    const capacity = Math.max(1, rate);
    const now = this.clock();
    let bucket = this.#buckets.get(name);
    if (!bucket) {
      bucket = { tokens: capacity, at: now };
      this.#buckets.set(name, bucket);
    }
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.at) / this.ticksPerSecond) * rate);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  #refuse(reason: QueueOutcome, detail: string, violation: boolean) {
    this.counts[reason]++;
    if (violation) this.meter.record(this.clock());
    return refusal(reason, detail);
  }
}
