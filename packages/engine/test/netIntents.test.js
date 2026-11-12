import { describe, it, expect, beforeEach } from 'vitest';
import { defineIntents, IntentQueue, reject, int, slot, num, bool, str, oneOf, list, entity } from '../src/net/intents.js';
import { ViolationMeter, InputSchema, InputGate } from '../src/net/input.js';
import { Rng } from '../src/core/rng.js';

/**
 * The intent channel, attacked. A client may send any `{ seq, name, args }`
 * it likes; the queue must accept exactly the requests the game declared,
 * at the rate it declared, each once, and run them as the sender against
 * the live world, where the reference rules decide what the sender may
 * touch.
 */

const SIZE = 8;

/** A stand-in world: `entityById` over a map, players with a position. */
function world() {
  const entities = new Map();
  const game = {
    entities: new Set(),
    entityById: (id) => entities.get(id) ?? null,
    add(id, name, x, y, playerId = null) {
      const e = { netId: id, name, position: { x, y }, playerId };
      entities.set(id, e);
      game.entities.add(e);
      return e;
    }
  };
  return game;
}

function player(id, avatar = null) {
  return { id, avatar, state: { inventory: Array(SIZE).fill(null), gold: 0 } };
}

const intents = defineIntents({
  moveItem: {
    args: { from: slot(SIZE), to: slot(SIZE) },
    rate: 10,
    run(me, { from, to }) {
      const inv = me.state.inventory;
      if (inv[from] === null) return reject('empty-slot');
      [inv[from], inv[to]] = [inv[to], inv[from]];
    }
  },
  sell: {
    args: { slot: slot(SIZE), vendor: entity({ actor: 'Vendor', within: 96 }), qty: int(1, 99) },
    rate: 2,
    run(me, { slot: at, vendor, qty }) {
      const item = me.state.inventory[at];
      if (!item) return reject('empty-slot');
      me.state.inventory[at] = null;
      me.state.gold += qty * vendor.price;
    }
  },
  drop: {
    args: { item: entity({ owned: true }) },
    run(me, { item }) { me.state.dropped = item.netId; }
  },
  rename: { args: { name: str(12) }, run(me, { name }) { me.state.name = name; } },
  toggle: { args: { on: bool() }, run(me, { on }) { me.state.on = on; } },
  pick: { args: { which: oneOf(['a', 'b', 3]) }, run(me, { which }) { me.state.which = which; } },
  marks: { args: { at: list(num(0, 100), 3) }, run(me, { at }) { me.state.marks = at; } },
  nothing: { run() {} },
  broken: { run() { throw new Error('bug'); } }
});

const msg = (seq, name, args = {}) => ({ seq, name, args });

describe('defineIntents', () => {
  it('refuses declarations it could not enforce', () => {
    expect(() => defineIntents({ 'bad name': { run() {} } })).toThrow(/valid intent name/);
    expect(() => defineIntents({ x: {} })).toThrow(/run/);
    expect(() => defineIntents({ x: { run() {}, rate: 0 } })).toThrow(/rate/);
    expect(() => defineIntents({ x: { run() {}, args: { a: 5 } } })).toThrow(/argument type/);
    expect(() => slot(0)).toThrow();
    expect(() => int(5, 1)).toThrow();
    expect(() => entity({ within: -1 })).toThrow();
  });

  describe('decode refuses, never throws', () => {
    const cases = [
      ['null', null, 'shape'],
      ['a string', 'moveItem', 'shape'],
      ['an array', [1, 'moveItem', {}], 'shape'],
      ['no seq', { name: 'nothing', args: {} }, 'shape'],
      ['a sender field', { ...msg(1, 'nothing'), player: 'b' }, 'shape'],
      ['a tick field', { ...msg(1, 'nothing'), tick: 5 }, 'shape'],
      ['a __proto__ field', JSON.parse('{"seq":1,"name":"nothing","args":{},"__proto__":{"x":1}}'), 'shape'],
      ['a getter seq', Object.defineProperty({ name: 'nothing', args: {} }, 'seq', { get: () => 1, enumerable: true }), 'shape'],
      ['a throwing Proxy', new Proxy({}, { ownKeys() { throw new Error('boom'); } }), 'shape'],
      ['seq 0', msg(0, 'nothing'), 'seq'],
      ['a fractional seq', msg(1.5, 'nothing'), 'seq'],
      ['a NaN seq', msg(NaN, 'nothing'), 'seq'],
      ['a string seq', msg('1', 'nothing'), 'seq'],
      ['an unknown intent', msg(1, 'giveGold', {}), 'name'],
      ['a prototype method as the name', msg(1, 'constructor', {}), 'name'],
      ['a non-string name', msg(1, 7, {}), 'name'],
      ['missing args', { seq: 1, name: 'moveItem', args: { from: 1 } }, 'args'],
      ['extra args', msg(1, 'moveItem', { from: 1, to: 2, gold: 999 }), 'args'],
      ['args as an array', msg(1, 'moveItem', [1, 2]), 'args'],
      ['args as null', msg(1, 'nothing', null), 'args'],
      ['a negative slot', msg(1, 'moveItem', { from: -1, to: 2 }), 'args'],
      ['a slot past the end', msg(1, 'moveItem', { from: 0, to: SIZE }), 'args'],
      ['a fractional slot', msg(1, 'moveItem', { from: 0.5, to: 2 }), 'args'],
      ['a string slot', msg(1, 'moveItem', { from: '0', to: 2 }), 'args'],
      ['a qty of 0', msg(1, 'sell', { slot: 0, vendor: 1, qty: 0 }), 'args'],
      ['a qty of 100', msg(1, 'sell', { slot: 0, vendor: 1, qty: 100 }), 'args'],
      ['an entity id of 0', msg(1, 'sell', { slot: 0, vendor: 0, qty: 1 }), 'args'],
      ['an entity object instead of an id', msg(1, 'sell', { slot: 0, vendor: { netId: 1 }, qty: 1 }), 'args'],
      ['a long string', msg(1, 'rename', { name: 'x'.repeat(13) }), 'args'],
      ['a non-string', msg(1, 'rename', { name: 5 }), 'args'],
      ['a truthy non-boolean', msg(1, 'toggle', { on: 1 }), 'args'],
      ['a value outside oneOf', msg(1, 'pick', { which: 'c' }), 'args'],
      ['a string that looks like a oneOf number', msg(1, 'pick', { which: '3' }), 'args'],
      ['a list too long', msg(1, 'marks', { at: [1, 2, 3, 4] }), 'args'],
      ['a list with a bad item', msg(1, 'marks', { at: [1, NaN] }), 'args'],
      ['a list with an out-of-range item', msg(1, 'marks', { at: [101] }), 'args'],
      ['a non-list', msg(1, 'marks', { at: 5 }), 'args']
    ];
    for (const [name, message, reason] of cases) {
      it(name, () => {
        const result = intents.decode(message);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(reason);
      });
    }

    it('accepts what was declared, and copies it', () => {
      const marks = [1, 50, 100];
      const result = intents.decode(msg(1, 'marks', { at: marks }));
      expect(result).toEqual({ ok: true, value: { seq: 1, name: 'marks', args: { at: [1, 50, 100] } } });
      expect(result.value.args.at).not.toBe(marks);
      expect(intents.decode(msg(1, 'nothing')).ok).toBe(true);
      expect(intents.decode(msg(1, 'pick', { which: 3 })).ok).toBe(true);
      expect(intents.decode(msg(1, 'rename', { name: '' })).ok).toBe(true);
    });
  });
});

describe('IntentQueue', () => {
  let game, tick, queue, me;
  const clock = () => tick;

  beforeEach(() => {
    game = world();
    tick = 100;
    queue = new IntentQueue(intents, { clock, ticksPerSecond: 60 });
    me = player('a', game.add(1, 'Player', 0, 0, 'a'));
    me.state.inventory[2] = 'lantern';
  });

  /** Advance one tick and apply what was filed. */
  const step = () => { tick++; return queue.apply(tick, me, game); };

  describe('timing', () => {
    it('files for the next tick and runs there, not on arrival', () => {
      queue.submit(msg(1, 'moveItem', { from: 2, to: 5 }));
      expect(me.state.inventory[5]).toBeNull();
      expect(queue.apply(tick, me, game)).toBe(0); // this tick already began
      expect(step()).toBe(1);
      expect(me.state.inventory[5]).toBe('lantern');
      expect(queue.drainResults()).toEqual([{ seq: 1, ok: true }]);
      expect(queue.drainResults()).toEqual([]);
    });

    it('runs a tick\'s intents in seq order whatever order they arrived', () => {
      queue.submit(msg(3, 'moveItem', { from: 7, to: 0 }));
      queue.submit(msg(1, 'moveItem', { from: 2, to: 6 }));
      queue.submit(msg(2, 'moveItem', { from: 6, to: 7 }));
      step();
      expect(me.state.inventory[0]).toBe('lantern');
      expect(queue.drainResults().map((r) => r.seq)).toEqual([1, 2, 3]);
    });

    it('the sender is the player the queue belongs to', () => {
      const other = player('b', game.add(2, 'Player', 0, 0, 'b'));
      queue.submit(msg(1, 'rename', { name: 'Eve' }));
      tick++;
      queue.apply(tick, other, game);
      expect(other.state.name).toBe('Eve');
      expect(me.state.name).toBeUndefined();
    });
  });

  describe('repetition', () => {
    it('duplicate: a resent seq is dropped, not a violation, and runs once', () => {
      queue.submit(msg(1, 'moveItem', { from: 2, to: 3 }));
      expect(queue.submit(msg(1, 'moveItem', { from: 2, to: 3 })).reason).toBe('duplicate');
      expect(queue.submit(msg(1, 'rename', { name: 'x' })).reason).toBe('duplicate');
      step();
      expect(me.state.inventory[3]).toBe('lantern');
      expect(me.state.name).toBeUndefined();
      expect(queue.meter.total).toBe(0);
    });

    it('a seq already applied cannot be replayed later', () => {
      queue.submit(msg(1, 'moveItem', { from: 2, to: 3 }));
      step();
      queue.drainResults();
      expect(queue.submit(msg(1, 'moveItem', { from: 3, to: 2 })).reason).toBe('duplicate');
      step();
      expect(me.state.inventory[3]).toBe('lantern');
    });

    it('stale: a seq far below the newest is dropped', () => {
      queue.submit(msg(1000, 'nothing'));
      expect(queue.submit(msg(700, 'nothing')).reason).toBe('stale');
      expect(queue.submit(msg(745, 'nothing')).accepted).toBe(true);
      expect(queue.meter.total).toBe(0);
    });

    it('out-of-order new seqs are all accepted', () => {
      for (const seq of [5, 2, 9, 1]) expect(queue.submit(msg(seq, 'nothing')).accepted).toBe(true);
      expect(step()).toBe(4);
    });
  });

  describe('rate', () => {
    it('refuses past the declared rate and counts it as a violation', () => {
      // sell: 2 per second, so a bucket of 2.
      expect(queue.submit(msg(1, 'sell', { slot: 2, vendor: 1, qty: 1 })).accepted).toBe(true);
      expect(queue.submit(msg(2, 'sell', { slot: 2, vendor: 1, qty: 1 })).accepted).toBe(true);
      expect(queue.submit(msg(3, 'sell', { slot: 2, vendor: 1, qty: 1 })).reason).toBe('rate');
      expect(queue.meter.total).toBe(1);
      // Half a second later there is one more.
      tick += 30;
      expect(queue.submit(msg(4, 'sell', { slot: 2, vendor: 1, qty: 1 })).accepted).toBe(true);
      expect(queue.submit(msg(5, 'sell', { slot: 2, vendor: 1, qty: 1 })).reason).toBe('rate');
    });

    it('rates are per intent', () => {
      queue.submit(msg(1, 'sell', { slot: 2, vendor: 1, qty: 1 }));
      queue.submit(msg(2, 'sell', { slot: 2, vendor: 1, qty: 1 }));
      expect(queue.submit(msg(3, 'moveItem', { from: 0, to: 1 })).accepted).toBe(true);
    });

    it('a flood bounds the queue and trips the meter', () => {
      for (let seq = 1; seq <= 1000; seq++) queue.submit(msg(seq, 'moveItem', { from: 0, to: 1 }));
      expect(queue.pending.size).toBe(10);
      expect(queue.counts.rate).toBe(990);
      expect(queue.exceeded).toBe(true);
    });
  });

  describe('references', () => {
    it('resolves a vendor nearby, and refuses the wrong actor or a far one', () => {
      game.add(10, 'Vendor', 50, 0).price = 7;
      game.add(11, 'Vendor', 500, 0).price = 7;
      game.add(12, 'Tree', 10, 0);
      queue.submit(msg(1, 'sell', { slot: 2, vendor: 11, qty: 1 }));
      queue.submit(msg(2, 'sell', { slot: 2, vendor: 12, qty: 1 }));
      tick += 60;
      queue.submit(msg(3, 'sell', { slot: 2, vendor: 99, qty: 1 }));
      queue.submit(msg(4, 'sell', { slot: 2, vendor: 10, qty: 3 }));
      step();
      expect(queue.drainResults()).toEqual([
        { seq: 1, ok: false, reason: 'too-far' },
        { seq: 2, ok: false, reason: 'wrong-entity' },
        { seq: 3, ok: false, reason: 'no-such-entity' },
        { seq: 4, ok: true }
      ]);
      expect(me.state.gold).toBe(21);
      expect(me.state.inventory[2]).toBeNull();
      // None of those were violations: the world can change under an honest client.
      expect(queue.meter.total).toBe(0);
    });

    it('refuses someone else\'s entity when owned is required', () => {
      game.add(20, 'Lantern', 0, 0, 'b');
      game.add(21, 'Lantern', 0, 0, 'a');
      queue.submit(msg(1, 'drop', { item: 20 }));
      queue.submit(msg(2, 'drop', { item: 21 }));
      step();
      expect(queue.drainResults()).toEqual([{ seq: 1, ok: false, reason: 'not-owned' }, { seq: 2, ok: true }]);
      expect(me.state.dropped).toBe(21);
    });

    it('takes the reach off the target when within is a function', () => {
      const rule = entity({ within: (target) => target.reach });
      const at = (x, reach) => ({ name: 'Vendor', position: { x, y: 0 }, reach });
      const player = { id: 'a', avatar: { position: { x: 0, y: 0 } } };
      const resolve = (target) => rule.resolve(1, { game: { entityById: () => target }, player });
      expect(resolve(at(130, 140)).ok).toBe(true);
      expect(resolve(at(130, 120))).toMatchObject({ reason: 'too-far' });
      expect(resolve(at(10, undefined))).toMatchObject({ reason: 'too-far' });
    });

    it('a distance rule needs an avatar', () => {
      game.add(10, 'Vendor', 0, 0).price = 1;
      me.avatar = null;
      queue.submit(msg(1, 'sell', { slot: 2, vendor: 10, qty: 1 }));
      step();
      expect(queue.drainResults()).toEqual([{ seq: 1, ok: false, reason: 'no-avatar' }]);
    });

    it('resolves against the world at apply time, not arrival', () => {
      const vendor = game.add(10, 'Vendor', 50, 0);
      vendor.price = 1;
      queue.submit(msg(1, 'sell', { slot: 2, vendor: 10, qty: 1 }));
      vendor.position.x = 5000; // walked off before the tick
      step();
      expect(queue.drainResults()).toEqual([{ seq: 1, ok: false, reason: 'too-far' }]);
    });
  });

  describe('running', () => {
    it('a game rejection is a result, not a violation', () => {
      queue.submit(msg(1, 'moveItem', { from: 0, to: 1 }));
      step();
      expect(queue.drainResults()).toEqual([{ seq: 1, ok: false, reason: 'empty-slot' }]);
      expect(queue.meter.total).toBe(0);
    });

    it('a throwing run is reported and does not stop the others', () => {
      const error = console.error;
      const logged = [];
      console.error = (...args) => logged.push(args[0]);
      try {
        queue.submit(msg(1, 'broken'));
        queue.submit(msg(2, 'nothing'));
        step();
        expect(queue.drainResults()).toEqual([{ seq: 1, ok: false, reason: 'error' }, { seq: 2, ok: true }]);
        expect(logged.length).toBe(1);
      } finally {
        console.error = error;
      }
    });
  });

  describe('violations', () => {
    it('static refusals count, and the meter can be shared with the input gate', () => {
      const meter = new ViolationMeter({ max: 3, window: 1000 });
      const shared = new IntentQueue(intents, { clock, meter });
      const gate = new InputGate(new InputSchema({ keys: ['Space'] }), { meter });
      shared.submit('junk');
      shared.submit(msg(1, 'moveItem', { from: 99, to: 0 }));
      gate.submit({ tick: 1, held: -1 });
      expect(meter.exceeded).toBe(false);
      gate.submit(null);
      expect(meter.exceeded).toBe(true);
      expect(shared.exceeded).toBe(true);
      expect(gate.exceeded).toBe(true);
    });

    it('survives seeded random garbage without throwing or running anything undeclared', () => {
      const rng = new Rng(77);
      const atoms = [0, -1, 1, 1.5, NaN, Infinity, 2 ** 53, '', 'x', 'moveItem', 'sell', true, null, undefined, [], {}, 5n];
      const pick = (arr) => arr[Math.floor(rng.next() * arr.length)];
      const value = (depth) => {
        const roll = rng.next();
        if (depth > 2 || roll < 0.5) return pick(atoms);
        if (roll < 0.7) return Array.from({ length: Math.floor(rng.next() * 4) }, () => value(depth + 1));
        const object = {};
        for (const key of ['seq', 'name', 'args', 'from', 'to', 'slot', 'vendor', 'qty', 'player', '__proto__']) {
          if (rng.next() < 0.5) Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true });
        }
        return object;
      };
      game.add(10, 'Vendor', 10, 0).price = 1;
      const fuzz = new IntentQueue(intents, { clock });
      let accepted = 0;
      for (let i = 0; i < 20000; i++) {
        const roll = rng.next();
        let message;
        if (roll < 0.4) message = value(0);
        else {
          message = msg(1 + Math.floor(rng.next() * 100000), pick(intents.names), {});
          const intent = intents.intents.get(message.name);
          for (const field of intent.fields) message.args[field] = pick([...atoms, 0, 1, 2, 10]);
          if (rng.next() < 0.3) message.args[pick(['extra', 'player', 'gold'])] = 1;
        }
        const result = fuzz.submit(message);
        if (result.accepted) {
          accepted++;
          expect(intents.decode(message).ok).toBe(true);
        }
        if (i % 500 === 0) { tick++; fuzz.apply(tick, me, game); fuzz.drainResults(); }
      }
      expect(accepted).toBeGreaterThan(0);
      tick++;
      expect(() => fuzz.apply(tick, me, game)).not.toThrow();
    });
  });
});
