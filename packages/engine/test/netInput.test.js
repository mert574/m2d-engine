import { describe, it, expect, beforeEach } from 'vitest';
import { InputSchema, InputGate } from '../src/net/input.js';
import { InputSnapshot } from '../src/core/input/snapshot.js';
import { Rng } from '../src/core/rng.js';

/**
 * The server's input gate, attacked. Every message here is something a
 * client could put on the wire, honest or not. The gate must accept
 * exactly what a real keyboard and pointer could have produced for a tick
 * inside its window, refuse everything else without throwing, and hand the
 * simulation the same snapshots whatever order, repetition or junk the
 * honest messages arrived among.
 */

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX'];
const BIT = Object.fromEntries(KEYS.map((code, i) => [code, 1 << i]));
const BOUNDS = { left: 0, top: 0, right: 1280, bottom: 720 };

const schema = new InputSchema({ keys: KEYS, pointer: { bounds: BOUNDS, buttons: 3 } });
const keysOnly = new InputSchema({ keys: KEYS });

const msg = (tick, held = 0, pointer = { x: 10, y: 20, buttons: 0 }) => ({ tick, held, pointer });

/** Plain-data view of a snapshot, for comparisons. */
const view = (snapshot) => {
  const json = snapshot.toJSON();
  return { ...json, down: json.down.sort(), pressed: json.pressed.sort(), released: json.released.sort() };
};

describe('InputSchema', () => {
  it('refuses a schema it could not enforce', () => {
    expect(() => new InputSchema({ keys: [] })).toThrow(/keys/);
    expect(() => new InputSchema({ keys: ['KeyA', 'KeyA'] })).toThrow(/distinct/);
    expect(() => new InputSchema({ keys: ['KeyA', ''] })).toThrow(/distinct/);
    expect(() => new InputSchema({ keys: Array.from({ length: 33 }, (_, i) => `K${i}`) })).toThrow(/32/);
    expect(() => new InputSchema({ keys: ['KeyA'], pointer: { bounds: { left: 0, top: 0, right: NaN, bottom: 1 } } })).toThrow(/bounds/);
    expect(() => new InputSchema({ keys: ['KeyA'], pointer: { bounds: { left: 5, top: 0, right: 1, bottom: 1 } } })).toThrow(/bounds/);
    expect(() => new InputSchema({ keys: ['KeyA'], pointer: { bounds: BOUNDS, buttons: 6 } })).toThrow(/buttons/);
  });

  it('round-trips a snapshot through encode and decode', () => {
    const snapshot = InputSnapshot.from({ down: ['ArrowLeft', 'KeyX', 'KeyQ'], pointer: { world: { x: 5, y: 6 }, buttons: 1 } });
    const message = schema.encode(7, snapshot);
    // KeyQ is not in the game's alphabet, so it never leaves the client.
    expect(message).toEqual({ tick: 7, held: BIT.ArrowLeft | BIT.KeyX, pointer: { x: 5, y: 6, buttons: 1 } });
    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
    expect(schema.decode(message)).toEqual({ ok: true, value: message });
  });

  it('latches a tap shorter than a tick: pressed and released before the sample still sends as held', () => {
    const tapped = InputSnapshot.from({ down: [], pressed: ['Space'], pointer: { world: { x: 5, y: 6 }, buttons: 0, pressedButtons: 1 } });
    expect(schema.encode(3, tapped)).toEqual({ tick: 3, held: BIT.Space, pointer: { x: 5, y: 6, buttons: 1 } });
    // The server sees it down on that tick and up on the next: a press and a release.
    const gate = new InputGate(schema);
    gate.submit(schema.encode(1, tapped));
    gate.submit(schema.encode(2, InputSnapshot.from({ pointer: { world: { x: 5, y: 6 } } })));
    const one = gate.take(1);
    expect(one.justPressed('Space')).toBe(true);
    expect(one.pointer.pressed).toBe(true);
    expect(gate.take(2).justReleased('Space')).toBe(true);
  });

  it('uses all 32 bits of a full key list', () => {
    const wide = new InputSchema({ keys: Array.from({ length: 32 }, (_, i) => `K${i}`) });
    expect(wide.decode({ tick: 1, held: 0xffffffff }).ok).toBe(true);
    expect(wide.decode({ tick: 1, held: 2 ** 32 }).reason).toBe('held');
    expect(wide.codes(2 ** 31)).toEqual(['K31']);
  });

  describe('decode refuses, never throws', () => {
    const cases = [
      // Shape
      ['null', null, 'shape'],
      ['a number', 42, 'shape'],
      ['a string', '{"tick":1}', 'shape'],
      ['an array', [1, 0, { x: 0, y: 0, buttons: 0 }], 'shape'],
      ['an empty object', {}, 'shape'],
      ['a missing pointer', { tick: 1, held: 0 }, 'shape'],
      ['an extra field', { ...msg(1), player: 2 }, 'shape'],
      ['client-sent edges', { ...msg(1), pressed: 1 }, 'shape'],
      ['a JSON __proto__ field', JSON.parse('{"tick":1,"held":0,"pointer":{"x":0,"y":0,"buttons":0},"__proto__":{"admin":true}}'), 'shape'],
      ['a constructor field', { ...msg(1), constructor: 1 }, 'shape'],
      ['a symbol field', { ...msg(1), [Symbol('x')]: 1 }, 'shape'],
      ['a class instance', new (class Input { constructor() { Object.assign(this, msg(1)); } })(), 'shape'],
      ['a getter', Object.defineProperty({ held: 0, pointer: { x: 0, y: 0, buttons: 0 } }, 'tick', { get: () => 1, enumerable: true }), 'shape'],
      ['a throwing Proxy', new Proxy({}, { ownKeys() { throw new Error('boom'); } }), 'shape'],
      ['a lying Proxy', new Proxy(msg(1), { get: (target, key) => (key === 'tick' ? -1 : target[key]) }), 'tick'],
      // Tick
      ['tick 0', msg(0), 'tick'],
      ['a negative tick', msg(-5), 'tick'],
      ['a fractional tick', msg(1.5), 'tick'],
      ['a NaN tick', msg(NaN), 'tick'],
      ['an infinite tick', msg(Infinity), 'tick'],
      ['an unsafe tick', msg(2 ** 53), 'tick'],
      ['a string tick', msg('5'), 'tick'],
      ['a bigint tick', msg(5n), 'tick'],
      ['a null tick', msg(null), 'tick'],
      // Held
      ['a negative mask', msg(1, -1), 'held'],
      ['a fractional mask', msg(1, 1.5), 'held'],
      ['a NaN mask', msg(1, NaN), 'held'],
      ['a bit past the key list', msg(1, 1 << KEYS.length), 'held'],
      ['a mask past 32 bits', msg(1, 2 ** 40), 'held'],
      ['a string mask', msg(1, '1'), 'held'],
      ['an array of codes', msg(1, ['Space']), 'held'],
      ['a boolean mask', msg(1, true), 'held'],
      // Pointer
      ['a NaN x', msg(1, 0, { x: NaN, y: 0, buttons: 0 }), 'pointer'],
      ['an infinite y', msg(1, 0, { x: 0, y: -Infinity, buttons: 0 }), 'pointer'],
      ['x past the right edge', msg(1, 0, { x: 1280.0001, y: 0, buttons: 0 }), 'pointer'],
      ['y above the top', msg(1, 0, { x: 0, y: -1, buttons: 0 }), 'pointer'],
      ['a string coordinate', msg(1, 0, { x: '5', y: 0, buttons: 0 }), 'pointer'],
      ['an extra pointer field', msg(1, 0, { x: 0, y: 0, buttons: 0, world: { x: 0, y: 0 } }), 'pointer'],
      ['a missing pointer field', msg(1, 0, { x: 0, y: 0 }), 'pointer'],
      ['a null pointer', msg(1, 0, null), 'pointer'],
      ['a button past the mask', msg(1, 0, { x: 0, y: 0, buttons: 8 }), 'pointer'],
      ['negative buttons', msg(1, 0, { x: 0, y: 0, buttons: -1 }), 'pointer'],
      ['fractional buttons', msg(1, 0, { x: 0, y: 0, buttons: 0.5 }), 'pointer']
    ];
    for (const [name, message, reason] of cases) {
      it(name, () => {
        const result = schema.decode(message);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(reason);
        expect(typeof result.detail).toBe('string');
      });
    }

    it('a pointer in a game without one', () => {
      expect(keysOnly.decode(msg(1)).reason).toBe('shape');
      expect(keysOnly.decode({ tick: 1, held: BIT.Space }).ok).toBe(true);
    });

    it('accepts the bounds themselves and normalizes -0', () => {
      expect(schema.decode(msg(1, 0, { x: 0, y: 720, buttons: 7 })).ok).toBe(true);
      expect(schema.decode(msg(1, 0, { x: 1280, y: 0, buttons: 0 })).ok).toBe(true);
      const { value } = schema.decode(msg(1, -0, { x: -0, y: -0, buttons: 0 }));
      expect(Object.is(value.held, 0)).toBe(true);
      expect(Object.is(value.pointer.x, 0)).toBe(true);
    });
  });
});

describe('InputGate', () => {
  let gate;
  beforeEach(() => { gate = new InputGate(schema, { maxAhead: 8 }); });

  describe('edges come from the server', () => {
    it('derives press and release from consecutive ticks', () => {
      gate.submit(msg(1, BIT.Space));
      gate.submit(msg(2, BIT.Space | BIT.ArrowLeft));
      gate.submit(msg(3, BIT.ArrowLeft));

      const one = gate.take(1);
      expect([...one.pressed]).toEqual(['Space']);
      const two = gate.take(2);
      expect([...two.pressed]).toEqual(['ArrowLeft']);
      expect(two.isDown('Space')).toBe(true);
      const three = gate.take(3);
      expect([...three.released]).toEqual(['Space']);
      expect(three.pressed.size).toBe(0);
    });

    it('holding a key every tick is one press, not one per tick', () => {
      for (let tick = 1; tick <= 8; tick++) gate.submit(msg(tick, BIT.Space));
      const presses = Array.from({ length: 8 }, (_, i) => gate.take(i + 1).justPressed('Space'));
      expect(presses).toEqual([true, false, false, false, false, false, false, false]);
    });

    it('derives pointer presses from the buttons, per button', () => {
      gate.submit(msg(1, 0, { x: 1, y: 1, buttons: 1 }));
      gate.submit(msg(2, 0, { x: 2, y: 2, buttons: 3 }));
      gate.submit(msg(3, 0, { x: 3, y: 3, buttons: 2 }));
      expect(gate.take(1).pointer).toMatchObject({ pressed: true, pressedButtons: 1, isDown: true, world: { x: 1, y: 1 } });
      expect(gate.take(2).pointer).toMatchObject({ pressed: true, pressedButtons: 2 });
      expect(gate.take(3).pointer).toMatchObject({ pressed: false, pressedButtons: 0, buttons: 2 });
    });
  });

  describe('time', () => {
    it('late: a tick already simulated is dropped and changes nothing', () => {
      gate.submit(msg(1, BIT.ArrowRight));
      gate.take(1);
      const result = gate.submit(msg(1, BIT.Space));
      expect(result).toMatchObject({ accepted: false, reason: 'late' });
      expect(gate.counts.late).toBe(1);
      expect(gate.exceeded).toBe(false);
      expect(gate.take(2).isDown('Space')).toBe(false);
    });

    it('early: past the window is dropped, inside it is filed', () => {
      expect(gate.submit(msg(9, BIT.Space)).reason).toBe('early');
      expect(gate.submit(msg(8, BIT.Space)).accepted).toBe(true);
      expect(gate.counts.early).toBe(1);
      expect(gate.exceeded).toBe(false);
    });

    it('the window moves with the clock', () => {
      for (let tick = 1; tick <= 5; tick++) gate.take(tick);
      expect(gate.submit(msg(13)).accepted).toBe(true);
      expect(gate.submit(msg(14)).reason).toBe('early');
      expect(gate.submit(msg(5)).reason).toBe('late');
    });

    it('a missing tick repeats the last held state and makes no edges', () => {
      gate.submit(msg(1, BIT.Space, { x: 50, y: 60, buttons: 1 }));
      gate.take(1);
      const gap = gate.take(2);
      expect(gate.missed).toBe(1);
      expect(gap.isDown('Space')).toBe(true);
      expect(gap.justPressed('Space')).toBe(false);
      expect(gap.pointer).toMatchObject({ world: { x: 50, y: 60 }, buttons: 1, pressed: false });
    });

    it('a release lost in a gap is seen when the next message arrives', () => {
      gate.submit(msg(1, BIT.Space));
      gate.take(1);
      gate.take(2); // lost: the player let go here
      gate.submit(msg(3, 0));
      expect(gate.take(3).justReleased('Space')).toBe(true);
    });

    it('takes ticks strictly in order', () => {
      expect(() => gate.take(2)).toThrow(/expected tick 1/);
      gate.take(1);
      expect(() => gate.take(1)).toThrow(/expected tick 2/);
    });

    it('a late joiner starts at its first tick', () => {
      const joined = new InputGate(schema, { startTick: 500, maxAhead: 8 });
      expect(joined.submit(msg(400)).reason).toBe('late');
      expect(joined.submit(msg(501, BIT.KeyX)).accepted).toBe(true);
      expect(joined.take(501).justPressed('KeyX')).toBe(true);
    });
  });

  describe('repetition', () => {
    it('duplicate: the same message again is harmless and not a violation', () => {
      gate.submit(msg(1, BIT.Space));
      for (let i = 0; i < 50; i++) expect(gate.submit(msg(1, BIT.Space)).reason).toBe('duplicate');
      expect(gate.counts.duplicate).toBe(50);
      expect(gate.exceeded).toBe(false);
      expect(gate.take(1).isDown('Space')).toBe(true);
    });

    it('conflict: a client cannot change its mind about a tick', () => {
      gate.submit(msg(3, BIT.ArrowLeft));
      expect(gate.submit(msg(3, BIT.ArrowRight)).reason).toBe('conflict');
      expect(gate.submit(msg(3, BIT.ArrowLeft, { x: 11, y: 20, buttons: 0 })).reason).toBe('conflict');
      gate.take(1);
      gate.take(2);
      const three = gate.take(3);
      expect(three.isDown('ArrowLeft')).toBe(true);
      expect(three.isDown('ArrowRight')).toBe(false);
      expect(gate.counts.conflict).toBe(2);
    });
  });

  describe('wrong order', () => {
    it('arrival order inside the window does not change what the simulation sees', () => {
      const stream = [msg(1, BIT.Space), msg(2, BIT.Space | BIT.ArrowLeft), msg(3, 0), msg(4, BIT.KeyX, { x: 400, y: 300, buttons: 1 }), msg(5, BIT.KeyX)];
      const inOrder = new InputGate(schema, { maxAhead: 8 });
      const shuffled = new InputGate(schema, { maxAhead: 8 });
      for (const message of stream) inOrder.submit(message);
      for (const index of [4, 1, 3, 0, 2]) shuffled.submit(stream[index]);
      for (let tick = 1; tick <= 5; tick++) expect(view(shuffled.take(tick))).toEqual(view(inOrder.take(tick)));
    });
  });

  describe('abuse', () => {
    it('bounds the buffer whatever is thrown at it', () => {
      for (let tick = 1; tick <= 10000; tick++) gate.submit(msg(tick, BIT.Space));
      expect(gate.pending.size).toBe(8);
      expect(gate.counts.early).toBe(10000 - 8);
    });

    it('violations past the limit set exceeded, and it stays set', () => {
      const strict = new InputGate(schema, { maxViolations: 3, violationWindow: 10 });
      for (let i = 0; i < 3; i++) strict.submit({ junk: true });
      expect(strict.exceeded).toBe(false);
      strict.submit(msg(1, -1));
      expect(strict.exceeded).toBe(true);
      for (let tick = 1; tick <= 100; tick++) strict.take(tick);
      expect(strict.exceeded).toBe(true);
    });

    it('violations spread thinner than the window are tolerated', () => {
      const strict = new InputGate(schema, { maxViolations: 3, violationWindow: 10 });
      for (let tick = 1; tick <= 200; tick++) {
        if (tick % 4 === 0) strict.submit('garbage');
        strict.take(tick);
      }
      expect(strict.counts.shape).toBe(50);
      expect(strict.exceeded).toBe(false);
    });

    it('drops are not violations: a terrible network is not a cheat', () => {
      const strict = new InputGate(schema, { maxViolations: 1, violationWindow: 1000, maxAhead: 4 });
      for (let tick = 1; tick <= 100; tick++) {
        strict.submit(msg(tick, BIT.Space));
        strict.submit(msg(tick, BIT.Space)); // resent
        strict.submit(msg(tick + 50, 0)); // clock far ahead
        strict.take(tick);
        strict.submit(msg(tick, 0)); // arrived after its tick
      }
      expect(strict.exceeded).toBe(false);
    });

    it('survives seeded random garbage without throwing or accepting anything invalid', () => {
      const rng = new Rng(1234);
      const atoms = [0, -0, 1, -1, 1.5, NaN, Infinity, -Infinity, 2 ** 31, 2 ** 32, 2 ** 53, '1', '', true, false, null, undefined, [], {}, 5n, Symbol('s')];
      const pick = (list) => list[Math.floor(rng.next() * list.length)];
      const value = (depth) => {
        const roll = rng.next();
        if (depth > 2 || roll < 0.5) return pick(atoms);
        if (roll < 0.75) return Array.from({ length: Math.floor(rng.next() * 4) }, () => value(depth + 1));
        const object = {};
        for (const key of ['tick', 'held', 'pointer', 'x', 'y', 'buttons', '__proto__', 'extra']) {
          if (rng.next() < 0.5) Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true });
        }
        return object;
      };
      const fuzz = new InputGate(schema, { maxAhead: 1000 });
      let accepted = 0;
      for (let i = 0; i < 20000; i++) {
        const roll = rng.next();
        let message;
        if (roll < 0.33) message = value(0);
        else if (roll < 0.66) message = { tick: value(1), held: value(1), pointer: rng.next() < 0.5 ? value(1) : { x: value(2), y: value(2), buttons: value(2) } };
        else {
          // A valid message with, most of the time, one field broken.
          message = msg(1 + Math.floor(rng.next() * 1000), Math.floor(rng.next() * 64), { x: rng.next() * 1280, y: rng.next() * 720, buttons: Math.floor(rng.next() * 8) });
          if (rng.next() < 0.7) {
            const target = rng.next() < 0.5 ? message : message.pointer;
            target[pick(Object.keys(target))] = pick(atoms);
          }
        }
        const result = fuzz.submit(message);
        if (result.accepted) {
          accepted++;
          expect(schema.decode(message).ok).toBe(true);
        }
      }
      // Every accepted message became a snapshot the simulation can read.
      for (let tick = 1; tick <= 1000; tick++) {
        const snapshot = fuzz.take(tick);
        for (const code of snapshot.down) expect(KEYS).toContain(code);
        expect(Number.isFinite(snapshot.pointer.world.x) && Number.isFinite(snapshot.pointer.world.y)).toBe(true);
      }
      expect(accepted).toBeGreaterThan(500);
      expect(fuzz.pending.size).toBe(0);
    });
  });
});
