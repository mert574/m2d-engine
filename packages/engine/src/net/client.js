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
 * Remote entities are drawn between the server's states, a little behind
 * the newest one, by the `ReplicaView` (see net/interpolation.js). The
 * player's own avatar is run here, on the tick its input is sent, and
 * corrected against the server's answer (see net/prediction.js).
 *
 * ## Messages
 *
 * To the server: `{ t: 'in', m: <input message> }` per tick,
 * `{ t: 'do', m: { seq, name, args } }` per intent and `{ t: 'ping', m: ms }`
 * every second. From it: `welcome` once, `state` (see net/replication.js),
 * `pong` and `bye` with a reason before the server closes.
 *
 * ## Watching it work
 *
 * `net_log` decides how much reaches the developer console: `0` nothing,
 * `1` the connection's life (joining, joined, a scene change, the close and
 * its reason), `2` adds what changes tick to tick — every lead adjustment
 * with the margin that caused it, every correction with its size, and a
 * summary of rates once a second. `stats` carries the live numbers for the
 * readout and the `net` command.
 */

import { applyState } from './replication.js';
import { ReplicaView } from './interpolation.js';
import { Predictor } from './prediction.js';
import { InputSnapshot } from '../core/input/snapshot.js';

/** Ticks of input sent ahead of the server's estimated clock. */
const DEFAULT_LEAD = 2;
/** A gap longer than this is not filled in tick by tick. */
const MAX_FILL = 8;
/**
 * Bounds on the lead the client steers (see `#steerLead`). Wide, because
 * the lead absorbs whatever the round-trip estimate gets wrong as well as
 * the jitter around it; the loop settles it wherever the measured margin
 * comes out right, which is usually a handful of ticks.
 */
const MIN_LEAD = -30;
const MAX_LEAD = 120;
/** Ticks of margin the client aims to keep: enough for a little jitter, no more. */
const TARGET_MARGIN = 2;
/** Margin above the target that is pure delay, trimmed after a calm stretch. */
const SLACK = 2;
/** Reports in a row with margin to spare before the lead is trimmed by one. */
const CALM_REPORTS = 20;

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
   * @param {boolean} [options.predict=true] - Run the local avatar's declared
   *   movement on the tick its input is sent, and correct it against the server
   * @returns {Promise<NetClient>}
   */
  static async connect(game, { url, ticket, schema, WebSocket = globalThis.WebSocket, lead, predict } = {}) {
    if (typeof WebSocket !== 'function') throw new Error('M2D net: no WebSocket implementation available');
    const separator = url.includes('?') ? '&' : '?';
    const socket = new WebSocket(`${url}${separator}ticket=${encodeURIComponent(ticket)}`);
    const client = new NetClient(game, socket, { schema, lead, predict });
    client.log(1, `connecting to ${url}`);
    await client.ready;
    return client;
  }

  /**
   * @param {import('../core/m2d.js').M2D} game
   * @param {WebSocket} socket - Anything with `send`, `close`, `onmessage` and `onclose`
   */
  constructor(game, socket, { schema, lead = DEFAULT_LEAD, predict = true } = {}) {
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
    /**
     * How the server's gate is finding this client's input. `margin` is how
     * many ticks early the earliest message arrived, which is what the lead
     * is steered by; `late` counts input that arrived for a tick already
     * simulated, and `missed` ticks the server had no input for at all.
     * See `#steerLead`.
     */
    this.gate = { missed: 0, late: 0, early: 0, margin: null };
    this.calm = 0;
    /**
     * Live numbers for the readout, the `net` command and the log: what has
     * crossed the wire, and how the two clocks are getting on.
     */
    this.stats = {
      bytesIn: 0, bytesOut: 0, messagesIn: 0, messagesOut: 0,
      /** Bytes per second, averaged over the last second. */
      inRate: 0, outRate: 0,
      corrections: 0, hidden: 0
    };
    this.#rateAt = 0;
    this.#rateIn = 0;
    this.#rateOut = 0;
    /** Drawing between the server's states. @type {ReplicaView|null} */
    this.view = null;
    /** Running the local avatar early. @type {Predictor|null} */
    this.predictor = null;
    this.predicts = predict;
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
    this.#settled = false;
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
  #settled;
  #rateAt;
  #rateIn;
  #rateOut;

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

  /**
   * How much of what happens reaches the developer console. Read from the
   * `net_log` cvar, so it can be turned up while connected.
   */
  get logLevel() {
    return this.game.netLogLevel ?? 1;
  }

  /** A line in the console, if the level asks for it. */
  log(level, message) {
    if (this.logLevel < level) return;
    if (level >= 2) console.debug(`[net] ${message}`);
    else console.info(`[net] ${message}`);
  }

  #send(type, payload) {
    if (!this.open || this.socket.readyState !== 1) return false;
    const text = JSON.stringify({ t: type, m: payload });
    this.socket.send(text);
    this.stats.bytesOut += text.length;
    this.stats.messagesOut++;
    this.#rateOut += text.length;
    return true;
  }

  #receive(data) {
    const size = typeof data === 'string' ? data.length : (data?.byteLength ?? 0);
    this.stats.bytesIn += size;
    this.stats.messagesIn++;
    this.#rateIn += size;
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      console.warn('[net] a frame from the server was not JSON and was dropped');
      return;
    }
    switch (message?.t) {
      case 'welcome':
        // A second welcome means the match moved to another scene: everyone
        // builds it afresh, and nothing may be applied to the outgoing one
        // while that happens.
        if (this.#settled) this.log(1, `the match moved to scene '${message.scene}'; rebuilding it`);
        this.#synced = false;
        this.#queue.length = 0;
        this.#welcome(message).catch((error) => {
          if (!this.#settled) this.#settle.reject(error);
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
        this.log(1, `the server is closing the connection: ${this.byeReason || 'no reason given'}`);
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
    this.sendEvery = message.sendEvery ?? 2;
    this.view = new ReplicaView(game, { tickRate: this.tickRate, sendEvery: this.sendEvery, now });
    this.predictor = this.predicts ? new Predictor(game, { tickRate: this.tickRate }) : null;
    await game.sceneManager.switchTo(message.scene);
    if (game.sceneSignature !== message.signature) {
      throw new Error('M2D net: this client built a different scene from the server\'s; are both running the same game module?');
    }
    this.#apply(message.full);
    for (const queued of this.#queue.splice(0)) this.#apply(queued);
    this.#synced = true;
    this.log(1, `joined as '${this.you}' · scene '${message.scene}' · ${this.tickRate} Hz · state every ${this.sendEvery} tick${this.sendEvery === 1 ? '' : 's'}`
      + ` · ${this.predictor ? 'predicting' : 'not predicting'} · drawing ${this.view.delay} ticks behind`);
    if (this.predicts && !this.predictor?.entity) {
      this.log(1, 'nothing to predict yet: waiting for the server to name an avatar');
    }
    if (!this.#settled) {
      this.#settled = true;
      this.#settle.resolve(this);
    }
  }

  #apply(message) {
    applyState(this.game, message, { view: this.view, predictor: this.predictor });
    if (message.g) this.#steerLead(message.g);
    if (this.logLevel >= 2 && (message.spawn || message.remove || message.hide)) {
      const parts = [];
      if (message.spawn) parts.push(`+${message.spawn.length} spawned`);
      if (message.remove) parts.push(`-${message.remove.length} removed`);
      if (message.hide) parts.push(`${message.hide.length} out of range`);
      this.stats.hidden += message.hide?.length ?? 0;
      this.log(2, `tick ${message.tick}: ${parts.join(' · ')}`);
    }
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
    const before = this.predictor?.entity ?? null;
    this.predictor?.follow(avatar);
    if (this.predictor && this.predictor.entity !== before) {
      if (this.predictor.entity) this.log(1, `predicting the local avatar (#${this.predictor.entity.netId})`);
      else if (avatar) {
        this.log(1, `the local avatar (#${avatar.netId}) cannot be predicted here`
          + ` — its body is '${avatar.body?.bodyType}' and only a character body can be advanced on its own; drawing it from the server`);
      }
    }
    // Its own simulation is ahead of the server's states, so it is not
    // drawn from them.
    if (this.view) {
      this.view.predicted.clear();
      if (this.predictor?.entity) this.view.predicted.add(this.predictor.entity.netId);
    }
    if (avatar && !game.headless) game.camera.follow(avatar);
  }

  /**
   * Steer the lead from what the server's gate reports.
   *
   * `[missed, late, early]` counts since the last state message. Input
   * that arrived late is input the server simulated without: lengthen the
   * lead at once, since every late tick is a tick the player's own press
   * did nothing. A long calm stretch trims it back a tick at a time, so a
   * connection that improves stops paying for a jitter it no longer has.
   */
  #steerLead([missed, late, early, margin]) {
    this.gate = {
      missed: this.gate.missed + missed, late: this.gate.late + late, early: this.gate.early + early,
      margin: margin ?? this.gate.margin
    };
    if (typeof margin !== 'number') {
      // Nothing arrived to measure. Input the server had to do without is
      // still a reason to send further ahead.
      if (late > 0 || missed > 0) this.lead = Math.min(MAX_LEAD, this.lead + 1);
      return;
    }
    if (margin < TARGET_MARGIN) {
      this.calm = 0;
      // Half the shortfall per report: several reports are in flight at any
      // moment, all describing the same gap, and correcting fully for each
      // would overshoot by as many as there are.
      const short = TARGET_MARGIN - margin;
      const was = this.lead;
      this.lead = Math.min(MAX_LEAD, this.lead + Math.ceil(short / 2));
      if (this.lead !== was) this.log(2, `lead ${was} → ${this.lead} (input arrived ${margin} ticks ahead, aiming for ${TARGET_MARGIN})`);
      return;
    }
    // Margin to spare is delay the player is paying for nothing. Give it up
    // slowly, and only once it has held.
    if (margin > TARGET_MARGIN + SLACK) {
      this.calm++;
      if (this.calm >= CALM_REPORTS) {
        this.calm = 0;
        const was = this.lead;
        this.lead = Math.max(MIN_LEAD, this.lead - 1);
        if (this.lead !== was) this.log(2, `lead ${was} → ${this.lead} (${margin} ticks of margin to spare)`);
      }
    } else {
      this.calm = 0;
    }
    void (late + early);
  }

  /**
   * The server tick a message sent now should be filed under.
   *
   * The whole round trip, not half of it: `serverTick` is where the server
   * was when it sent the newest state, which is already one leg old, and
   * the input being sent now has the other leg still to travel. Half an RTT
   * would therefore name a tick the server has always already simulated.
   *
   * That is only a starting estimate — `rtt` begins as a guess and a tick
   * is a coarse unit — so `lead` carries the rest and is steered by the
   * margin the server actually measures. See `#steerLead`.
   */
  get targetTick() {
    const elapsed = (now() - this.serverTickAt) + this.rtt;
    return this.serverTick + Math.ceil((elapsed / 1000) * this.tickRate) + this.lead;
  }

  /**
   * Turn prediction on or off on a live connection, for seeing the
   * difference. Turning it off hands the avatar back to the server's
   * states; turning it on starts predicting from wherever it is now.
   * @param {boolean} on
   */
  setPredicting(on) {
    if (on === this.predicts) return;
    this.predicts = on;
    if (!on) {
      const entity = this.predictor?.entity;
      if (entity) {
        entity.body.renderOverride = null;
        this.view?.predicted.delete(entity.netId);
      }
      this.predictor = null;
      this.log(1, 'prediction off: the local avatar now moves when the server says it did');
      return;
    }
    this.predictor = new Predictor(this.game, { tickRate: this.tickRate });
    this.predictor.follow(this.game.players.local.avatar);
    if (this.predictor.entity) this.view?.predicted.add(this.predictor.entity.netId);
    this.log(1, `prediction on${this.predictor.entity ? '' : ' (nothing to predict yet)'}`);
  }

  /**
   * Advance the view's clock and write every entity's drawn transform. The
   * frame loop calls it once a frame, before anything is drawn.
   */
  beforeDraw(deltaTime = 0) {
    this.view?.update();
    // After the view, which clears the override on everything it does not
    // interpolate: the predicted avatar writes its own.
    this.predictor?.beforeDraw(deltaTime);
    this.#reportRates();
  }

  /** Once a second: the rates, and a line about them if the level asks. */
  #reportRates() {
    const time = now();
    if (this.#rateAt === 0) {
      this.#rateAt = time;
      return;
    }
    const elapsed = time - this.#rateAt;
    if (elapsed < 1000) return;
    const stats = this.stats;
    stats.inRate = Math.round((this.#rateIn * 1000) / elapsed);
    stats.outRate = Math.round((this.#rateOut * 1000) / elapsed);
    const corrections = this.predictor?.corrections ?? 0;
    const newCorrections = corrections - stats.corrections;
    stats.corrections = corrections;
    this.#rateIn = 0;
    this.#rateOut = 0;
    this.#rateAt = time;
    this.log(2, `${(stats.inRate / 1024).toFixed(1)} KB/s in · ${(stats.outRate / 1024).toFixed(1)} KB/s out`
      + ` · rtt ${Math.round(this.rtt)} ms · lead ${this.lead}`
      + ` · ${newCorrections} correction${newCorrections === 1 ? '' : 's'}`);
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
      for (let t = from; t <= target; t++) {
        const sent = t === from ? first : snapshot;
        this.#send('in', this.schema.encode(t, sent));
        // The same input, run here for the same tick: what the server will
        // do with it, done early. See net/prediction.js.
        this.predictor?.predict(t, sent);
      }
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
    const clean = code === 1000;
    const text = `connection closed (${code}${reason ? ` ${reason}` : ''})`;
    if (clean) this.log(1, text);
    else if (this.logLevel >= 1) console.warn(`[net] ${text}`);
    for (const resolve of this.#pending.values()) resolve({ ok: false, reason: 'offline' });
    this.#pending.clear();
    if (!this.#settled) {
      this.#settled = true;
      this.#settle.reject(new Error(`M2D net: the connection closed before the game was in sync (${code}${reason ? ` ${reason}` : ''})`));
    }
    this.#emit('close', this.closed);
  }
}
