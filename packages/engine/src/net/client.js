/**
 * A game as a client of an `m2d-server` match.
 *
 *   const net = await NetClient.connect(game, { url, ticket, schema: INPUT });
 *
 * Connecting turns the game into a replica (`game.replica`): it loads the
 * match's scene from its own scene module, checks that it built the same
 * entities the server did, and from then on shows what the server sends
 * instead of simulating. Each tick it encodes the local input snapshot as
 * a message for the server tick it should arrive in time for, and
 * `game.players.local.send(name, args)` goes to the server and resolves
 * with the server's answer. Events the server's simulation raises for this
 * player reach `game.players.local.on(name, ...)` listeners.
 *
 * There is no prediction yet: the local avatar moves when the server says
 * it did, a round trip after the key went down.
 *
 * ## Messages
 *
 * To the server: `{ t: 'in', m: <input message> }` per tick,
 * `{ t: 'do', m: { seq, name, args } }` per intent and `{ t: 'ping', m: ms }`
 * every second. From it: `welcome` once, `state` (see net/replication.js),
 * `pong` and `bye` with a reason before the server closes.
 */

import { applyState } from './replication.js';
import { InputSnapshot } from '../core/input/snapshot.js';

/** Ticks of input sent ahead of the server's estimated clock. */
const DEFAULT_LEAD = 2;
/** A gap longer than this is not filled in tick by tick. */
const MAX_FILL = 8;

const now = () => performance.now();

export class NetClient {
  /**
   * Open a connection and resolve once the scene is loaded and in sync.
   *
   * @param {import('../core/m2d.js').M2D} game
   * @param {object} options
   * @param {string} options.url - `ws://` or `wss://`
   * @param {string} options.ticket - From the game's lobby
   * @param {import('./input.js').InputSchema} options.schema - The game's input alphabet
   * @param {typeof WebSocket} [options.WebSocket] - Defaults to the global
   * @param {number} [options.lead=2]
   * @returns {Promise<NetClient>}
   */
  static async connect(game, { url, ticket, schema, WebSocket = globalThis.WebSocket, lead } = {}) {
    if (typeof WebSocket !== 'function') throw new Error('M2D net: no WebSocket implementation available');
    const separator = url.includes('?') ? '&' : '?';
    const socket = new WebSocket(`${url}${separator}ticket=${encodeURIComponent(ticket)}`);
    const client = new NetClient(game, socket, { schema, lead });
    await client.ready;
    return client;
  }

  /**
   * @param {import('../core/m2d.js').M2D} game
   * @param {WebSocket} socket - Anything with `send`, `close`, `onmessage` and `onclose`
   */
  constructor(game, socket, { schema, lead = DEFAULT_LEAD } = {}) {
    if (!schema?.encode) throw new Error('M2D net: a NetClient needs the game\'s InputSchema');
    this.game = game;
    this.socket = socket;
    this.schema = schema;
    this.lead = lead;
    /** The server's id for this player. */
    this.you = null;
    this.tickRate = 60;
    /** The server tick of the newest message, and when it arrived. */
    this.serverTick = 0;
    this.serverTickAt = 0;
    /** Smoothed round trip, in ms. */
    this.rtt = 100;
    this.lastSent = 0;
    this.lastPing = 0;
    /**
     * Presses from ticks that sent nothing (the clock estimate did not move
     * on), held for the next message so a tap in one of them still arrives.
     */
    this.carried = { keys: new Set(), buttons: 0 };
    this.open = true;
    /** Why the connection ended: `{ code, reason }`, once it has. */
    this.closed = null;
    this.#seq = 0;
    this.#pending = new Map();
    this.#queue = [];
    this.#synced = false;
    this.#listeners = new Map();
    this.ready = new Promise((resolve, reject) => { this.#settle = { resolve, reject }; });

    socket.onmessage = (event) => this.#receive(event.data);
    socket.onclose = (event) => this.#ended(event.code, event.reason || this.byeReason || '');
    socket.onerror = () => {};
  }

  #seq;
  #pending;
  #queue;
  #synced;
  #listeners;
  #settle;

  /** `close` with `{ code, reason }` when the connection ends. Returns a function that stops listening. */
  on(name, handler) {
    let set = this.#listeners.get(name);
    if (!set) this.#listeners.set(name, set = new Set());
    set.add(handler);
    return () => set.delete(handler);
  }

  #emit(name, data) {
    for (const handler of [...(this.#listeners.get(name) ?? [])]) handler(data);
  }

  #send(type, payload) {
    if (!this.open || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify({ t: type, m: payload }));
    return true;
  }

  #receive(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    switch (message?.t) {
      case 'welcome':
        this.#welcome(message).catch((error) => {
          this.#settle.reject(error);
          this.close(4100, error.message);
        });
        break;
      case 'state':
        if (this.#synced) this.#apply(message); else this.#queue.push(message);
        break;
      case 'pong':
        if (typeof message.m === 'number') this.rtt = this.rtt * 0.8 + (now() - message.m) * 0.2;
        break;
      case 'bye':
        this.byeReason = typeof message.reason === 'string' ? message.reason : '';
        break;
    }
  }

  async #welcome(message) {
    const game = this.game;
    this.you = message.you;
    this.tickRate = message.tickRate;
    if (Math.abs(1 / message.tickRate - game.time.fixedTimestep) > 1e-9) {
      throw new Error(`M2D net: the server ticks at ${message.tickRate} Hz and this game at ${1 / game.time.fixedTimestep} Hz`);
    }
    game.replica = true;
    game.net = this;
    await game.sceneManager.switchTo(message.scene);
    if (game.sceneSignature !== message.signature) {
      throw new Error('M2D net: this client built a different scene from the server\'s; are both running the same game module?');
    }
    this.#apply(message.full);
    for (const queued of this.#queue.splice(0)) this.#apply(queued);
    this.#synced = true;
    this.#settle.resolve(this);
  }

  #apply(message) {
    applyState(this.game, message);
    // The first message sets the clock even at tick 0, a match that just began.
    if (message.tick > this.serverTick || this.serverTickAt === 0) {
      this.serverTick = message.tick;
      this.serverTickAt = now();
    }
    for (const result of message.res ?? []) {
      const resolve = this.#pending.get(result.seq);
      if (!resolve) continue;
      this.#pending.delete(result.seq);
      resolve(result.ok ? { ok: true } : { ok: false, reason: result.reason });
    }
    if ('av' in message) this.avatarId = message.av;
    this.#follow();
  }

  /** Point `game.player` at this client's avatar, once the server has made it. */
  #follow() {
    const game = this.game;
    const avatar = this.avatarId == null ? null : game.entityById(this.avatarId);
    if (game.players.local.avatar === avatar && game.player === avatar) return;
    game.players.local.avatar = avatar;
    game.player = avatar;
    if (avatar && !game.headless) game.camera.follow(avatar);
  }

  /** The server tick a message sent now should be filed under. */
  get targetTick() {
    const elapsed = (now() - this.serverTickAt) + this.rtt;
    return this.serverTick + Math.ceil((elapsed / 1000) * this.tickRate) + this.lead;
  }

  /** One client tick: send this tick's input. The engine calls it. */
  tick(snapshot) {
    if (!this.#synced || !this.open) return;
    for (const code of snapshot.pressed) this.carried.keys.add(code);
    this.carried.buttons |= snapshot.pointer.pressedButtons ?? 0;
    const target = this.targetTick;
    // The estimate can move back when a late message lowers it; nothing to
    // send then, and this tick's presses wait in `carried`.
    if (target > this.lastSent) {
      const from = Math.max(this.lastSent + 1, target - MAX_FILL);
      const first = this.#withCarried(snapshot);
      for (let t = from; t <= target; t++) this.#send('in', this.schema.encode(t, t === from ? first : snapshot));
      this.lastSent = target;
    }
    const time = now();
    if (time - this.lastPing > 1000) {
      this.lastPing = time;
      this.#send('ping', time);
    }
  }

  /** The snapshot with every carried press counted as held, once. */
  #withCarried(snapshot) {
    const { keys, buttons } = this.carried;
    if (keys.size === 0 && buttons === 0) return snapshot;
    this.carried = { keys: new Set(), buttons: 0 };
    const json = snapshot.toJSON();
    json.down = [...new Set([...json.down, ...keys])];
    json.pointer.buttons |= buttons;
    return InputSnapshot.from(json);
  }

  /** `game.players.local.send` while connected. */
  sendIntent(name, args = {}) {
    const seq = ++this.#seq;
    if (!this.#send('do', { seq, name, args })) return Promise.resolve({ ok: false, reason: 'offline' });
    return new Promise((resolve) => { this.#pending.set(seq, resolve); });
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    this.open = false;
    try { this.socket.close(code, reason); } catch { /* already closing */ }
  }

  #ended(code, reason) {
    this.open = false;
    this.closed = { code, reason };
    for (const resolve of this.#pending.values()) resolve({ ok: false, reason: 'offline' });
    this.#pending.clear();
    if (!this.#synced) this.#settle.reject(new Error(`M2D net: the connection closed before the game was in sync (${code}${reason ? ` ${reason}` : ''})`));
    this.#emit('close', this.closed);
  }
}
