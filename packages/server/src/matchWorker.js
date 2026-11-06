/**
 * One match, in its own worker thread.
 *
 * The worker owns the headless game and everything that touches it: each
 * player's input gate and intent queue, their replicator, the tick loop.
 * The main thread owns the sockets and talks to this worker in messages
 * (see matchHost.js), so a match that throws, loops or runs out of memory
 * takes down its own thread and nothing else.
 *
 * From the main thread: `join`, `in`, `do`, `drop` (the connection closed),
 * `stop`. To it: `ready`, `welcome`, `send`, `kick`, `beat`, `ended`.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { InputGate, ViolationMeter } from 'm2d-engine/net/input.js';
import { IntentQueue } from 'm2d-engine/net/intents.js';
import { Replicator } from 'm2d-engine/net/replication.js';
import { CLOSE } from './protocol.js';

const post = (message) => parentPort.postMessage(message);

/** Most ticks run in one wake-up; a longer stall drops the backlog. */
const MAX_CATCH_UP = 5;

const { default: match } = await import(workerData.module);

await initPhysics({ dimensions: match.game.dimensions ?? 2 });
const game = new M2D(null, { ...match.game, headless: true });
await match.setup(game, { matchId: workerData.matchId });
game.setupCollisionHandlers();

const tickRate = Math.round(1 / game.time.fixedTimestep);
const BEAT_EVERY = Math.max(1, Math.round(tickRate / 4));

/** Per player: connection state beside the engine's Player. */
const seats = new Map();

function sceneName() {
  const current = game.sceneManager.getCurrentScene();
  for (const [name, scene] of game.sceneManager.scenes) if (scene === current) return name;
  return null;
}

function welcome(seat) {
  seat.replicator = new Replicator(game, seat.player);
  post({
    type: 'welcome',
    pid: seat.player.id,
    message: {
      t: 'welcome', you: seat.player.id, tick: game.time.steps, tickRate,
      scene: sceneName(), signature: game.sceneSignature, full: seat.replicator.full()
    }
  });
}

/** A fresh gate and intent queue for a (re)connected player, on the meter they already have. */
function connect(seat) {
  const player = seat.player;
  seat.gate = new InputGate(match.input, { meter: seat.meter, startTick: game.time.steps });
  player.setSnapshotSource(() => seat.gate.take(game.time.steps));
  if (game.players.intentSet) {
    // The client counts its sequence numbers from 1 again.
    player.intents = new IntentQueue(game.players.intentSet, {
      clock: () => game.time.steps, ticksPerSecond: tickRate, meter: seat.meter
    });
  }
  seat.connected = true;
  seat.leaveAt = null;
  welcome(seat);
}

function join(pid) {
  const seat = seats.get(pid);
  if (seat) {
    connect(seat);
    return;
  }
  if (seats.size >= match.maxPlayers) {
    post({ type: 'kick', pid, code: CLOSE.full, reason: 'match full' });
    return;
  }
  const meter = new ViolationMeter();
  const player = game.players.add(pid, { meter });
  const fresh = { player, meter, gate: null, replicator: null, connected: false, leaveAt: null };
  seats.set(pid, fresh);
  match.join(game, player);
  connect(fresh);
}

/** Gone for good: the match's `leave`, then the player. */
function remove(pid) {
  const seat = seats.get(pid);
  if (!seat) return;
  seats.delete(pid);
  try {
    match.leave(game, seat.player);
  } finally {
    game.players.remove(pid);
  }
}

function kick(seat, code, reason) {
  post({ type: 'kick', pid: seat.player.id, code, reason });
  remove(seat.player.id);
}

function receive(pid, kind, payload) {
  const seat = seats.get(pid);
  if (!seat?.connected) return;
  if (kind === 'in') {
    seat.gate.submit(payload);
  } else if (seat.player.intents) {
    const filed = seat.player.intents.submit(payload);
    // Refused before it could run: answer now, if there is a seq to answer.
    if (!filed.accepted && Number.isSafeInteger(payload?.seq)) {
      seat.player.intents.results.push({ seq: payload.seq, ok: false, reason: filed.reason });
    }
  }
  if (seat.meter.exceeded) kick(seat, CLOSE.violation, 'too many invalid messages');
}

let stopped = false;
function end(reason) {
  if (stopped) return;
  stopped = true;
  post({ type: 'ended', reason });
}

let lastScene = game.sceneManager.getCurrentScene();

function tick() {
  if (game.sceneManager.loading) return;
  const scene = game.sceneManager.getCurrentScene();
  if (scene !== lastScene) {
    // The match moved to another scene: everyone builds it afresh.
    lastScene = scene;
    for (const seat of seats.values()) if (seat.connected) welcome(seat);
  }
  game.step(1);
  if (game.entities.size > match.maxEntities) {
    end(`entity limit (${match.maxEntities}) passed`);
    return;
  }
  const tickNo = game.time.steps;
  for (const seat of [...seats.values()]) {
    if (!seat.connected && seat.leaveAt !== null && tickNo >= seat.leaveAt) remove(seat.player.id);
  }
  if (tickNo % match.sendEvery === 0) {
    for (const seat of seats.values()) {
      if (!seat.connected) continue;
      post({ type: 'send', pid: seat.player.id, message: { t: 'state', ...seat.replicator.delta() } });
    }
  }
  // Four times a second: the watchdog's silence limit has to be longer than this.
  if (tickNo % BEAT_EVERY === 0) post({ type: 'beat', tick: tickNo, entities: game.entities.size, players: seats.size });
}

const step = game.time.fixedTimestep * 1000;
let origin = performance.now();
let done = 0;
function loop() {
  if (stopped) return;
  const owed = Math.floor((performance.now() - origin) / step) - done;
  const run = Math.min(owed, MAX_CATCH_UP);
  for (let i = 0; i < run && !stopped; i++) {
    tick();
    done++;
  }
  if (owed > MAX_CATCH_UP) origin = performance.now() - done * step;
  const next = origin + (done + 1) * step - performance.now();
  setTimeout(loop, Math.max(0, next));
}

parentPort.on('message', (message) => {
  switch (message.type) {
    case 'join': join(message.pid); break;
    case 'in': receive(message.pid, 'in', message.m); break;
    case 'do': receive(message.pid, 'do', message.m); break;
    case 'drop': {
      const seat = seats.get(message.pid);
      if (!seat) break;
      seat.connected = false;
      seat.leaveAt = game.time.steps + Math.round(match.reconnectSeconds * tickRate);
      if (match.reconnectSeconds === 0) remove(message.pid);
      break;
    }
    case 'stop': stopped = true; break;
  }
});

post({ type: 'ready', tickRate, scene: sceneName() });
loop();
