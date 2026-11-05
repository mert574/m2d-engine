/**
 * The players in a game, mounted as `game.players`.
 *
 * Every game has one: the `local` player, whose input is the game's own
 * `game.input.snapshot`. A single-player game never needs to know more. A
 * server adds a `Player` per connection and feeds each one its snapshots
 * (from an `InputGate`) and its intents (through an `IntentQueue`), and the
 * same actors and constraints run unchanged, because they read input
 * through `entity.input`: the snapshot of the player who owns the entity,
 * or the local player's when nobody does.
 *
 * Ownership is `entity.playerId`. A player's input reaches only the
 * entities that carry their id, which is the whole of "a client drives
 * only its own entities". `player.avatar` is the one entity the game
 * treats as the player's body, for distance checks on intents.
 *
 * Each tick, before anything updates, `sample` takes every player's
 * snapshot and `applyIntents` runs the intents filed for the tick in a
 * deterministic order: players by id, rotated by the tick so a different
 * player goes first each tick, then each player's by sequence number.
 * When two players want the last of something in the same tick, the one
 * whose turn it is gets it and the other is refused by the game's own
 * rule; the order is a function of the tick, so every replay agrees.
 */

import { InputSnapshot } from './input/snapshot.js';
import { IntentQueue } from '../net/intents.js';

export class Player {
  /**
   * @param {import('./m2d.js').M2D} game
   * @param {string} id
   * @param {boolean} local - Reads the game's own input.
   */
  constructor(game, id, local) {
    this.game = game;
    this.id = id;
    this.local = local;
    /** The entity the game treats as this player's body. @type {import('./entity.js').Entity|null} */
    this.avatar = null;
    /** Any per-player state the game keeps: inventory, gold, score. */
    this.state = {};
    /** @type {IntentQueue|null} */
    this.intents = null;
    this.#snapshot = InputSnapshot.empty();
    this.#source = null;
    this.#nextSeq = 1;
    this.#waiting = new Map();
    /** Events for this player's presentation, raised by simulation code. See `notify`. */
    this.events = [];
    this.#listeners = new Map();
  }

  #snapshot;
  #source;
  #nextSeq;
  #waiting;
  #listeners;

  /**
   * Tell this player's presentation that something happened: a pickup, a
   * level complete, a hit to show. Called from simulation code. Alone, the
   * local player's listeners hear it after the frame's ticks; on a server,
   * the event travels to the player's client, whose listeners hear it.
   * `data` must be plain data.
   *
   * @param {string} name
   * @param {object} [data]
   */
  notify(name, data = {}) {
    // Bounded: a player whose events nobody drains must not grow forever.
    if (this.events.length >= 256) this.events.shift();
    this.events.push([name, data]);
  }

  /**
   * Listen for `notify` events. Presentation code: a HUD, a sound, a
   * screen. Returns a function that stops listening.
   * @param {string} name
   * @param {(data: object) => void} handler
   */
  on(name, handler) {
    let set = this.#listeners.get(name);
    if (!set) this.#listeners.set(name, set = new Set());
    set.add(handler);
    return () => set.delete(handler);
  }

  /** Hand events to listeners. The engine calls it each frame for the local player. */
  dispatch(events) {
    for (const [name, data] of events) {
      for (const handler of [...(this.#listeners.get(name) ?? [])]) handler(data);
    }
  }

  /** Take the events raised since the last drain. */
  drainEvents() {
    return this.events.splice(0);
  }

  /** This tick's input. The local player's is the game's snapshot. */
  get snapshot() {
    return this.local ? this.game.input.snapshot : this.#snapshot;
  }

  /**
   * Where a remote player's snapshots come from, called once per tick. On
   * a server, `() => gate.take(game.time.steps)`.
   * @param {(() => InputSnapshot|object|null)|null} source
   */
  setSnapshotSource(source) {
    if (this.local) throw new Error('M2D players: the local player reads game.input; set a snapshot source on game.input instead');
    this.#source = source ?? null;
  }

  /** Take this tick's snapshot. The engine calls it. */
  sample() {
    if (this.local) return;
    const fed = this.#source?.();
    this.#snapshot = fed instanceof InputSnapshot
      ? fed
      : fed ? InputSnapshot.from(fed) : InputSnapshot.empty();
  }

  /** The entities this player owns. */
  get entities() {
    return [...this.game.entities].filter((entity) => entity.playerId === this.id);
  }

  /**
   * Make a request of the simulation as this player, the way a client
   * does: filed now, applied at the start of the next tick. Resolves with
   * the result once it has run. A game uses this for its own UI, so the
   * same code works alone and online.
   *
   * @param {string} name
   * @param {object} [args]
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  send(name, args = {}) {
    // A client: the server runs the intent and the answer comes back.
    if (this.local && this.game.net) return this.game.net.sendIntent(name, args);
    if (!this.intents) return Promise.reject(new Error('M2D players: no intents are registered; call game.registerIntents first'));
    const seq = this.#nextSeq++;
    const filed = this.intents.submit({ seq, name, args });
    if (!filed.accepted) return Promise.resolve({ ok: false, reason: filed.reason });
    return new Promise((resolve) => { this.#waiting.set(seq, resolve); });
  }

  /**
   * Run the intents filed for `tick`; settle any `send` waiting on them.
   * The local player's results are consumed here. A remote player's stay
   * on `intents.results` for the connection to send back.
   */
  applyIntents(tick) {
    if (!this.intents) return;
    this.intents.apply(tick, this, this.game);
    const results = this.local ? this.intents.drainResults() : this.intents.results;
    if (this.#waiting.size === 0) return;
    for (const result of results) {
      const resolve = this.#waiting.get(result.seq);
      if (!resolve) continue;
      this.#waiting.delete(result.seq);
      resolve(result.ok ? { ok: true } : { ok: false, reason: result.reason });
    }
  }
}

export class Players {
  /** @param {import('./m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
    /** @type {Map<string, Player>} */
    this.map = new Map();
    /** @type {import('../net/intents.js').IntentSet|null} */
    this.intentSet = null;
    /** The player at the keyboard. */
    this.local = this.add('local', { local: true });
  }

  /**
   * Add a player. On a server, one per connection.
   * @param {string} id - Unique, stable for the connection's life.
   * @param {object} [options]
   * @param {boolean} [options.local=false]
   * @param {import('../net/input.js').ViolationMeter} [options.meter] - Shared with the player's input gate.
   */
  add(id, { local = false, meter } = {}) {
    if (typeof id !== 'string' || id === '') throw new Error('M2D players: a player id must be a non-empty string');
    if (this.map.has(id)) throw new Error(`M2D players: '${id}' is already a player`);
    const player = new Player(this.game, id, local);
    if (this.intentSet) player.intents = this.#queueFor(meter);
    player.meter = meter ?? null;
    this.map.set(id, player);
    return player;
  }

  /** Remove a player. Their entities keep their `playerId` and read empty input. */
  remove(id) {
    if (id === 'local') throw new Error('M2D players: the local player cannot be removed');
    return this.map.delete(id);
  }

  get(id) {
    return this.map.get(id) ?? null;
  }

  has(id) {
    return this.map.has(id);
  }

  /** Every player, by id, which is the order intents apply in. */
  get all() {
    return [...this.map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /**
   * The bodies the world should treat as "a player": every player's living
   * avatar, or `game.player` when no player has claimed one (a scene that
   * never set `players.local.avatar`). Simulation code that used to read
   * `game.player` reads this instead, so an enemy on a server, where
   * `game.player` is null and every knight belongs to someone, still has
   * someone to hunt.
   * @returns {import('./entity.js').Entity[]}
   */
  get avatars() {
    const game = this.game;
    const out = [];
    let claimed = false;
    for (const player of this.map.values()) {
      const avatar = player.avatar;
      if (!avatar) continue;
      claimed = true;
      if (!avatar.dead && game.entities.has(avatar)) out.push(avatar);
    }
    if (!claimed && game.player && !game.player.dead && game.entities.has(game.player)) out.push(game.player);
    return out;
  }

  /** Whether an entity is one of the `avatars`. */
  isAvatar(entity) {
    return !!entity && this.avatars.includes(entity);
  }

  /**
   * The living avatar nearest a point, within `range`, or null. Ties go to
   * the player with the lower id, so a server and a replay agree.
   * @param {{x: number, y: number}} position
   * @param {number} [range=Infinity]
   */
  nearestAvatar(position, range = Infinity) {
    let best = null;
    let bestDistance = range;
    for (const avatar of this.avatars) {
      const distance = Math.hypot(avatar.position.x - position.x, avatar.position.y - position.y);
      const closer = distance < bestDistance
        || (distance === bestDistance && best && String(avatar.playerId) < String(best.playerId));
      if (closer) {
        best = avatar;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Install the game's intents. Every current and future player gets a queue. */
  useIntents(intentSet) {
    this.intentSet = intentSet;
    for (const player of this.map.values()) player.intents = intentSet ? this.#queueFor(player.meter) : null;
  }

  /** Take every player's snapshot for this tick. */
  sample() {
    for (const player of this.map.values()) player.sample();
  }

  /**
   * The order intents apply in on `tick`: players by id, starting from the
   * one whose turn it is. A fixed order would hand every same-tick contest
   * to the lowest id.
   */
  turnOrder(tick) {
    const all = this.all;
    if (all.length < 2) return all;
    const start = tick % all.length;
    return [...all.slice(start), ...all.slice(0, start)];
  }

  /** Run the intents filed for `tick`, in turn order, then by seq. */
  applyIntents(tick) {
    if (!this.intentSet) return;
    for (const player of this.turnOrder(tick)) player.applyIntents(tick);
  }

  #queueFor(meter) {
    const game = this.game;
    return new IntentQueue(this.intentSet, {
      clock: () => game.time.steps,
      ticksPerSecond: Math.round(1 / game.time.fixedTimestep),
      meter: meter ?? undefined
    });
  }
}
