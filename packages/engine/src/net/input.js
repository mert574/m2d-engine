/**
 * Client input as an authoritative server receives it.
 *
 * A client sends one message per simulation tick: the tick it is for, the
 * keys held and, if the game uses one, the pointer. Nothing else crosses
 * the wire. There is no "pressed" and no "released" in a message: the
 * server derives both from the held state of consecutive ticks, so a
 * client cannot claim a press it never let go of, and every input it can
 * send is one a real keyboard could produce.
 *
 *   { tick: 812, held: 0b1001, pointer: { x: 640.5, y: 212, buttons: 1 } }
 *
 * `held` is a bit mask over the game's key list (`InputSchema.keys`), so
 * an unknown key code cannot be expressed at all. `pointer` is in world
 * coordinates on the ground plane, the space `snapshot.pointer.world`
 * reads.
 *
 * ## The two pieces
 *
 * `InputSchema` is the game's input alphabet: which keys exist, whether a
 * pointer does and the bounds it lives in. `decode` checks a message
 * against it statically: the exact shape, a whole tick number, a mask
 * inside the key list, finite pointer coordinates inside the bounds. It
 * never throws, whatever it is handed.
 *
 * `InputGate` is one connection's queue. `submit` decodes a message and
 * files it under its tick, inside a bounded window ahead of the server's
 * clock. `take(tick)` turns the tick's message into the `InputSnapshot`
 * the simulation reads, tick after tick, in order. A tick with no message
 * repeats the last held state, which is what the player most likely did,
 * and produces no edges.
 *
 * ## What the gate refuses
 *
 * | Outcome | When | Counts as a violation |
 * | --- | --- | --- |
 * | `shape` | Not a plain object with exactly the expected fields | Yes |
 *
 * The gate also measures `margin`: how far ahead of its tick the earliest
 * message arrived. A client steers what it sends by it, so how far ahead to
 * send is measured rather than guessed from a round trip.
 *
 * | `tick` | Not a whole number from 1 up | Yes |
 * | `held` | Not a whole number inside the key list's mask | Yes |
 * | `pointer` | Missing, extra, non-finite, out of bounds or bad buttons | Yes |
 * | `conflict` | A second, different message for a tick already filed | Yes |
 * | `duplicate` | The same message again (resends are normal) | No |
 * | `late` | For a tick already taken | No |
 * | `early` | More than `maxAhead` ticks past the last one taken | No |
 *
 * Late, early and duplicate messages are what a bad network produces, so
 * they are dropped and counted but not held against the client.
 * Violations are what only a broken or hostile client sends. They are
 * recorded on a `ViolationMeter`, whose `exceeded` turns true once there
 * are more than `max` of them within `window` ticks, and stays true. A
 * connection shares one meter between its input gate and its intent queue,
 * so junk on either channel counts once. What happens then (a kick, a ban)
 * is the connection's decision, not the gate's.
 *
 * Nothing here knows about a socket or the DOM.
 */

import { InputSnapshot } from '../core/input/snapshot.js';

/** Bits in a held mask. JavaScript's bitwise operators work on 32. */
const MAX_KEYS = 32;
/** Pointer buttons a mask may carry: primary, secondary, middle, back, forward. */
const MAX_BUTTONS = 5;

const MESSAGE_FIELDS = ['tick', 'held'];
const POINTER_FIELDS = ['buttons', 'x', 'y'];

const VIOLATIONS = new Set(['shape', 'tick', 'held', 'pointer', 'conflict']);

/** Exactly these own keys, in any order, on a plain object. */
function hasExactFields(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  for (const key of keys) {
    if (typeof key !== 'string' || !fields.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false; // no getters
  }
  return true;
}

const reject = (reason, detail) => ({ ok: false, reason, detail });

/**
 * Counts a connection's violations over a sliding window of ticks.
 *
 * @param {object} [options]
 * @param {number} [options.max=20] - Violations tolerated within the window.
 * @param {number} [options.window=60] - In ticks.
 */
export class ViolationMeter {
  constructor({ max = 20, window = 60 } = {}) {
    for (const [name, value] of [['max', max], ['window', window]]) {
      if (!Number.isInteger(value) || value < 1) throw new Error(`M2D net: ViolationMeter ${name} must be a whole number from 1 up`);
    }
    this.max = max;
    this.window = window;
    /** Violations recorded in total. */
    this.total = 0;
    /** True once the limit was passed. Stays true. */
    this.exceeded = false;
    this.#ticks = [];
  }

  #ticks;

  /** Record one violation at `tick`. @param {number} tick */
  record(tick) {
    this.total++;
    const ticks = this.#ticks;
    ticks.push(tick);
    const oldest = tick - this.window;
    while (ticks.length && ticks[0] <= oldest) ticks.shift();
    if (ticks.length > this.max) {
      this.exceeded = true;
      // Only the newest few matter once the limit is passed; keep the list bounded.
      ticks.splice(0, ticks.length - this.max - 1);
    }
  }
}

/**
 * A game's input alphabet.
 *
 * @param {object} options
 * @param {string[]} options.keys - Physical key codes the game reads, at
 *   most 32. Their order defines the bits of `held`.
 * @param {false|{bounds: {left: number, top: number, right: number, bottom: number}, buttons?: number}} [options.pointer=false]
 *   - The world rectangle a pointer may point into and how many buttons
 *   it has (1 to 5, default 3). False for a game with no pointer.
 */
export class InputSchema {
  constructor({ keys, pointer = false } = {}) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('M2D net: an InputSchema needs a non-empty keys array');
    }
    if (keys.length > MAX_KEYS) {
      throw new Error(`M2D net: an InputSchema holds at most ${MAX_KEYS} keys, got ${keys.length}`);
    }
    if (new Set(keys).size !== keys.length || keys.some((key) => typeof key !== 'string' || key === '')) {
      throw new Error('M2D net: InputSchema keys must be distinct, non-empty key codes');
    }
    this.keys = Object.freeze([...keys]);
    /** Every bit a valid `held` may set. */
    this.mask = keys.length === MAX_KEYS ? 0xffffffff : (2 ** keys.length) - 1;

    this.pointer = null;
    if (pointer) {
      const { bounds, buttons = 3 } = pointer;
      const finite = bounds && ['left', 'top', 'right', 'bottom'].every((side) => Number.isFinite(bounds[side]));
      if (!finite || bounds.left > bounds.right || bounds.top > bounds.bottom) {
        throw new Error('M2D net: an InputSchema pointer needs finite bounds with left <= right and top <= bottom');
      }
      if (!Number.isInteger(buttons) || buttons < 1 || buttons > MAX_BUTTONS) {
        throw new Error(`M2D net: an InputSchema pointer has 1 to ${MAX_BUTTONS} buttons, got ${buttons}`);
      }
      this.pointer = Object.freeze({
        bounds: Object.freeze({ left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }),
        buttons,
        buttonMask: (2 ** buttons) - 1
      });
    }
    Object.freeze(this);
  }

  /**
   * Check a message against the schema. Never throws.
   * @param {unknown} message
   * @returns {{ok: true, value: {tick: number, held: number, pointer: {x: number, y: number, buttons: number}|null}}
   *   | {ok: false, reason: string, detail: string}}
   */
  decode(message) {
    try {
      return this.#decode(message);
    } catch {
      // A Proxy or an exotic object that throws on inspection.
      return reject('shape', 'the message could not be read');
    }
  }

  #decode(message) {
    const fields = this.pointer ? [...MESSAGE_FIELDS, 'pointer'] : MESSAGE_FIELDS;
    if (!hasExactFields(message, fields)) {
      return reject('shape', `expected a plain object with exactly ${fields.join(', ')}`);
    }
    const { tick, held } = message;
    if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 1) {
      return reject('tick', 'tick must be a whole number from 1 up');
    }
    // `held >>> 0 === held` admits exactly the whole numbers 0 .. 2^32-1.
    if (typeof held !== 'number' || (held >>> 0) !== held || (held & ~this.mask) !== 0) {
      return reject('held', `held must be a whole number inside the ${this.keys.length}-key mask`);
    }

    let pointer = null;
    if (this.pointer) {
      const raw = message.pointer;
      if (!hasExactFields(raw, POINTER_FIELDS)) {
        return reject('pointer', 'pointer must be a plain object with exactly x, y and buttons');
      }
      const { x, y, buttons } = raw;
      const { bounds, buttonMask } = this.pointer;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
        return reject('pointer', 'pointer x and y must be finite numbers');
      }
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        return reject('pointer', 'pointer lies outside the world bounds');
      }
      if (typeof buttons !== 'number' || !Number.isInteger(buttons) || buttons < 0 || (buttons & ~buttonMask) !== 0) {
        return reject('pointer', `pointer buttons must be a whole number inside the ${this.pointer.buttons}-button mask`);
      }
      // -0 and 0 are the same position; keep the simulation from ever seeing a signed zero it did not make.
      pointer = { x: x + 0, y: y + 0, buttons };
    }
    return { ok: true, value: { tick, held: held >>> 0, pointer } };
  }

  /**
   * The message a client sends for a tick, from the snapshot it sampled.
   * Keys outside the schema are left out; the pointer is clamped into the
   * bounds.
   *
   * A key or button pressed during the tick counts as held for it, even if
   * it was already let go: a tap shorter than a tick would otherwise never
   * be seen held, and the server, which derives edges from held state,
   * would never see it at all.
   * @param {number} tick
   * @param {InputSnapshot} snapshot
   */
  encode(tick, snapshot) {
    let held = 0;
    this.keys.forEach((code, bit) => { if (snapshot.isDown(code) || snapshot.justPressed(code)) held |= 1 << bit; });
    const message = { tick, held: held >>> 0 };
    if (this.pointer) {
      const { bounds, buttonMask } = this.pointer;
      const world = snapshot.pointer.world;
      message.pointer = {
        x: Math.min(bounds.right, Math.max(bounds.left, world.x)),
        y: Math.min(bounds.bottom, Math.max(bounds.top, world.y)),
        buttons: ((snapshot.pointer.buttons ?? 0) | (snapshot.pointer.pressedButtons ?? 0)) & buttonMask
      };
    }
    return message;
  }

  /** The key codes a held mask stands for. @param {number} held */
  codes(held) {
    const codes = [];
    this.keys.forEach((code, bit) => { if (held & (1 << bit)) codes.push(code); });
    return codes;
  }
}

/**
 * One connection's input, tick by tick.
 *
 * @param {InputSchema} schema
 * @param {object} [options]
 * @param {number} [options.maxAhead=30] - Furthest a message may be filed
 *   past the last tick taken, in ticks. Bounds the buffer.
 * @param {ViolationMeter} [options.meter] - Where violations are recorded.
 *   A new one by default; a connection passes the meter its intent queue
 *   shares.
 * @param {number} [options.maxViolations=20] - For the default meter.
 * @param {number} [options.violationWindow=60] - For the default meter, in ticks.
 * @param {number} [options.startTick=0] - The tick already simulated when
 *   the connection joins; the first `take` is for `startTick + 1`.
 */
export class InputGate {
  constructor(schema, options = {}) {
    if (!(schema instanceof InputSchema)) throw new Error('M2D net: an InputGate needs an InputSchema');
    this.schema = schema;
    this.maxAhead = options.maxAhead ?? 30;
    if (!Number.isInteger(this.maxAhead) || this.maxAhead < 1) throw new Error('M2D net: InputGate maxAhead must be a whole number from 1 up');
    this.meter = options.meter ?? new ViolationMeter({ max: options.maxViolations ?? 20, window: options.violationWindow ?? 60 });
    const startTick = options.startTick ?? 0;
    if (!Number.isSafeInteger(startTick) || startTick < 0) throw new Error('M2D net: InputGate startTick must be a whole number from 0 up');

    /** The last tick handed to the simulation. */
    this.taken = startTick;
    /** Filed messages by tick, never more than `maxAhead` of them. */
    this.pending = new Map();
    /** Refusals and drops by outcome. */
    this.counts = { shape: 0, tick: 0, held: 0, pointer: 0, conflict: 0, duplicate: 0, late: 0, early: 0 };
    /** Ticks taken with no message for them. */
    this.missed = 0;
    /**
     * The smallest number of ticks by which a message has beaten the tick
     * it is for, since `readMargin`. 0 means one arrived just in time and a
     * negative number means too late to be used. This is what tells a
     * client whether it is sending far enough ahead — a measurement, where
     * a round-trip estimate is a guess. Null when nothing has arrived.
     * @type {number|null}
     */
    this.margin = null;

    this.#held = 0;
    this.#pointer = schema.pointer ? { x: 0, y: 0, buttons: 0 } : null;
  }

  #held;
  #pointer;

  /** True once the meter's limit was passed. Stays true. */
  get exceeded() {
    return this.meter.exceeded;
  }

  /**
   * File a message. Never throws.
   * @param {unknown} message
   * @returns {{accepted: boolean, reason: string|null, detail?: string}}
   */
  submit(message) {
    const decoded = this.schema.decode(message);
    if (!decoded.ok) return this.#refuse(decoded.reason, decoded.detail);
    const input = decoded.value;

    if (input.tick <= this.taken) {
      this.#observe(input.tick - this.taken - 1);
      return this.#refuse('late', `tick ${input.tick} was already simulated`);
    }
    if (input.tick > this.taken + this.maxAhead) {
      return this.#refuse('early', `tick ${input.tick} is more than ${this.maxAhead} ticks ahead`);
    }
    const filed = this.pending.get(input.tick);
    if (filed) {
      if (sameInput(filed, input)) return this.#refuse('duplicate', `tick ${input.tick} was already filed`);
      return this.#refuse('conflict', `tick ${input.tick} was already filed with different input`);
    }
    this.pending.set(input.tick, input);
    // How far ahead of its tick this arrived. `taken` is the last tick
    // simulated, so a message for `taken + 1` arrived with none to spare.
    this.#observe(input.tick - this.taken - 1);
    return { accepted: true, reason: null };
  }

  #observe(margin) {
    if (this.margin === null || margin < this.margin) this.margin = margin;
  }

  /** Take the margin since the last read, and start measuring again. */
  readMargin() {
    const margin = this.margin;
    this.margin = null;
    return margin;
  }

  /**
   * The snapshot for the next tick. Ticks are taken in order, each once.
   * @param {number} tick - Must be `taken + 1`.
   * @returns {InputSnapshot}
   */
  take(tick) {
    if (tick !== this.taken + 1) {
      throw new Error(`M2D net: InputGate.take expected tick ${this.taken + 1}, got ${tick}`);
    }
    this.taken = tick;
    const input = this.pending.get(tick);
    this.pending.delete(tick);
    if (!input) this.missed++;

    const before = this.#held;
    const held = input ? input.held : before;
    const prevPointer = this.#pointer;
    const pointer = input?.pointer ?? prevPointer;
    this.#held = held;
    this.#pointer = pointer;

    const schema = this.schema;
    const pointerState = pointer
      ? {
          // The server has no screen: a snapshot built here carries no UI position.
          ui: { x: 0, y: 0 },
          world: { x: pointer.x, y: pointer.y },
          isDown: pointer.buttons !== 0,
          pressed: (pointer.buttons & ~prevPointer.buttons) !== 0,
          pressedButtons: pointer.buttons & ~prevPointer.buttons,
          buttons: pointer.buttons,
          type: 'mouse'
        }
      : InputSnapshot.empty().pointer;
    return new InputSnapshot({
      down: new Set(schema.codes(held)),
      pressed: new Set(schema.codes(held & ~before)),
      released: new Set(schema.codes(before & ~held)),
      pointer: pointerState
    });
  }

  #refuse(reason, detail) {
    this.counts[reason]++;
    if (VIOLATIONS.has(reason)) this.meter.record(this.taken);
    return { accepted: false, reason, detail };
  }
}

function sameInput(a, b) {
  if (a.held !== b.held) return false;
  if (!a.pointer) return !b.pointer;
  return a.pointer.x === b.pointer.x && a.pointer.y === b.pointer.y && a.pointer.buttons === b.pointer.buttons;
}
