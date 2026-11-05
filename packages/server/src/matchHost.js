/**
 * The main thread's handle on one match: its worker, and which connection
 * is which player.
 *
 * The worker is started with a heap limit. A watchdog ends it when it stops
 * reporting in (an infinite loop in game code). When the worker exits for
 * any reason, every connection to the match is closed with `ended` and the
 * host reports itself finished; other matches are untouched.
 */

import { Worker } from 'node:worker_threads';
import { CLOSE } from './protocol.js';

const WORKER = new URL('./matchWorker.js', import.meta.url);

export class MatchHost {
  /**
   * @param {string} id
   * @param {object} options
   * @param {string} options.module - URL of the match definition module
   * @param {number} options.memoryMb - Heap limit for the worker
   * @param {number} options.watchdogMs - Longest silence before the worker is ended
   * @param {(host: MatchHost) => void} options.onEnd
   * @param {(connection, message) => void} options.send - Deliver a message on a connection
   * @param {(connection, code, reason) => void} options.close
   */
  constructor(id, { module, memoryMb, watchdogMs, onEnd, send, close }) {
    this.id = id;
    this.send = send;
    this.close = close;
    this.onEnd = onEnd;
    /** player id -> connection */
    this.connections = new Map();
    this.ready = false;
    this.ended = false;
    this.queued = [];
    this.lastBeat = Date.now();
    this.stats = { tick: 0, entities: 0, players: 0 };

    this.worker = new Worker(WORKER, {
      workerData: { module: String(module), matchId: id },
      resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: Math.max(16, Math.round(memoryMb / 8)) },
      stdout: false,
      stderr: false
    });
    this.worker.on('message', (message) => this.#receive(message));
    this.worker.on('error', (error) => this.#finish(`match error: ${error.message}`));
    this.worker.on('exit', (code) => this.#finish(code === 0 ? 'match ended' : `match stopped (${code})`));
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastBeat > watchdogMs) {
        this.#finish('match stopped responding');
        this.worker.terminate();
      }
    }, Math.max(100, Math.round(watchdogMs / 4)));
    this.watchdog.unref?.();
  }

  #post(message) {
    if (this.ended) return;
    if (!this.ready) this.queued.push(message);
    else this.worker.postMessage(message);
  }

  /** A player's connection arrived. Replaces any connection they already had. */
  join(player, connection) {
    const previous = this.connections.get(player);
    this.connections.set(player, connection);
    if (previous && previous !== connection) this.close(previous, CLOSE.replaced, 'connected elsewhere');
    this.#post({ type: 'join', pid: player });
  }

  /** A message from a player, already checked as an envelope. */
  forward(player, connection, type, payload) {
    if (this.connections.get(player) !== connection) return;
    this.#post({ type, pid: player, m: payload });
  }

  /** A player's connection closed. */
  drop(player, connection) {
    if (this.connections.get(player) !== connection) return;
    this.connections.delete(player);
    this.#post({ type: 'drop', pid: player });
  }

  #receive(message) {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.lastBeat = Date.now();
        for (const queued of this.queued.splice(0)) this.worker.postMessage(queued);
        break;
      case 'welcome':
      case 'send': {
        const connection = this.connections.get(message.pid);
        if (connection) this.send(connection, message.message);
        break;
      }
      case 'kick': {
        const connection = this.connections.get(message.pid);
        this.connections.delete(message.pid);
        if (connection) this.close(connection, message.code, message.reason);
        break;
      }
      case 'beat':
        this.lastBeat = Date.now();
        this.stats = { tick: message.tick, entities: message.entities, players: message.players };
        break;
      case 'ended':
        this.#finish(message.reason);
        this.worker.terminate();
        break;
    }
  }

  #finish(reason) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.watchdog);
    for (const connection of this.connections.values()) this.close(connection, CLOSE.ended, reason);
    this.connections.clear();
    this.reason = reason;
    this.onEnd(this);
  }

  stop() {
    this.#post({ type: 'stop' });
    this.#finish('server shutting down');
    return this.worker.terminate();
  }
}
