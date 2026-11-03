/**
 * Lap recording and replay — the determinism made visible.
 *
 * While you drive, the recorder stores one byte per tick: the six inputs
 * the car reads, as a bitmask. A replay rebuilds the round (same seed,
 * same spills, fresh props), installs those bytes as the engine's input
 * snapshot source and lets the simulation run. Nothing else is stored —
 * no positions, no physics — and the car retraces the lap exactly,
 * because the simulation is a function of its ticks and its inputs.
 *
 * The recorder also keeps a sparse trail of car positions purely as a
 * *witness*: the replay compares itself against them and reports whether
 * it matched to the bit. It always should; the readout exists so the
 * player can see that it did.
 *
 * Best rounds persist in localStorage as { seed, spills, inputs } — a few
 * kilobytes that will replay a lap driven in an earlier session.
 */

const BITS = [
  ['ArrowUp', 1], ['ArrowDown', 2], ['ArrowLeft', 4], ['ArrowRight', 8], ['Space', 16]
];
const NITRO_BIT = 32;

/** One tick of input as a byte. Held keys, plus the nitro press edge. */
function encode(snapshot) {
  let byte = 0;
  for (const [code, bit] of BITS) if (snapshot.isDown(code)) byte |= bit;
  if (snapshot.justPressed('KeyX')) byte |= NITRO_BIT;
  return byte;
}

/** A byte back into what the car's CarControl reads. */
function decode(byte) {
  const down = [];
  for (const [code, bit] of BITS) if (byte & bit) down.push(code);
  const pressed = [];
  if (byte & NITRO_BIT) { pressed.push('KeyX'); down.push('KeyX'); }
  return { down, pressed };
}

/** Run-length encode [a, a, a, b] → [[a, 3], [b, 1]], for storage. */
export function rle(bytes) {
  const out = [];
  for (const byte of bytes) {
    if (out.length && out[out.length - 1][0] === byte) out[out.length - 1][1]++;
    else out.push([byte, 1]);
  }
  return out;
}

export function unrle(pairs) {
  const out = [];
  for (const [byte, run] of pairs) for (let i = 0; i < run; i++) out.push(byte);
  return out;
}

/** Records a round: inputs every tick, a position witness every 20th. */
export class Recorder {
  constructor(game, car) {
    this.game = game;
    this.car = car;
    this.inputs = [];
    this.checks = [];
  }

  tick() {
    this.inputs.push(encode(this.game.input.snapshot));
    if (this.inputs.length % 20 === 0) {
      const { x, y } = this.car.body.position;
      this.checks.push([x, y]);
    }
  }
}

/**
 * Feeds a recorded round back through the input seam, tick by tick, and
 * verifies the witness positions as it passes them.
 */
export class Player {
  constructor(game, inputs, checks) {
    this.game = game;
    this.inputs = inputs;
    this.checks = checks ?? [];
    this.at = 0;
    this.maxDeviation = 0;
    this.car = null;
    game.input.setSnapshotSource(() => {
      const byte = this.inputs[this.at];
      return byte === undefined ? null : decode(byte);
    });
  }

  get done() {
    return this.at >= this.inputs.length;
  }

  /** Called once per tick, after the simulation ran it. */
  tick() {
    this.at++;
    if (this.car && this.at % 20 === 0) {
      const check = this.checks[this.at / 20 - 1];
      if (check) {
        const { x, y } = this.car.body.position;
        const deviation = Math.max(Math.abs(x - check[0]), Math.abs(y - check[1]));
        if (deviation > this.maxDeviation) this.maxDeviation = deviation;
      }
    }
  }

  /** The line the HUD prints when the replay ends. */
  get verdict() {
    if (this.checks.length === 0) return 'replay finished';
    return this.maxDeviation === 0
      ? 'replay matched the recording to the bit'
      : `replay diverged by ${this.maxDeviation.toFixed(3)} px`;
  }

  stop() {
    this.game.input.setSnapshotSource(null);
  }
}

const STORE_PREFIX = 'm2d-circuit:best:';

/**
 * The stored best round for a map: enough to show the ghost and to re-run
 * the entire round from inputs alone, in a later session.
 */
export function saveBest(mapName, best) {
  try {
    localStorage.setItem(STORE_PREFIX + mapName, JSON.stringify({
      version: 1,
      lapTicks: best.lapTicks,
      lapStart: best.lapStart,
      lapEnd: best.lapEnd,
      inputs: rle(best.inputs),
      checks: best.checks,
      spills: best.spills,
      car: best.car,
      // The ghost rounds to a tenth of a pixel: display precision, a
      // quarter of the storage.
      ghost: best.ghost.map((v) => Math.round(v * 10) / 10)
    }));
  } catch {
    // Storage full or blocked: the session best still works from memory.
  }
}

export function loadBest(mapName) {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + mapName);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    return { ...data, inputs: unrle(data.inputs) };
  } catch {
    return null;
  }
}
