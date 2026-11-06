import { describe, it, expect } from 'vitest';
import { s, validate, fieldsOf, refScopesOf } from '../src/core/schema.js';
import { LEVEL_SCHEMA, UI_SCHEMA } from '../src/core/sceneSchema.js';

/**
 * The schema vocabulary itself, apart from the scene format that uses it.
 *
 * Two jobs are under test, and the point of the module is that one set of
 * descriptors does both: `validate` checks and normalizes a document, and
 * the introspection helpers report the same format back as data for an
 * editor to build an inspector from.
 */

/** Collect the first failure rather than throwing a typed error. */
function check(desc, value, options = {}) {
  let error = null;
  const fail = (path, message) => { throw { path, message }; };
  try {
    return { value: validate(desc, value, { fail, ...options }), error };
  } catch (thrown) {
    if (!thrown?.message) throw thrown;
    return { value: undefined, error: thrown };
  }
}

const expectFail = (desc, value, path, match, options) => {
  const { error } = check(desc, value, options);
  expect(error, 'expected a validation failure').toBeTruthy();
  expect(error.path).toBe(path);
  if (match) expect(error.message).toMatch(match);
};

const expectPass = (desc, value, options) => {
  const { error, value: out } = check(desc, value, options);
  expect(error).toBe(null);
  return out;
};

describe('schema', () => {
  describe('scalars', () => {
    it('accepts finite numbers and rejects everything else', () => {
      expectPass(s.number(), 0);
      expectFail(s.number(), '1', '', /must be a number, got "1"/);
      expectFail(s.number(), NaN, '', /must be a number/);
      expectFail(s.number(), Infinity, '', /must be a number/);
    });

    it('enforces positive, min and max', () => {
      expectFail(s.number({ positive: true }), 0, '', /must be a positive number/);
      expectFail(s.number({ min: 0 }), -1, '', /at least 0/);
      expectFail(s.number({ max: 10 }), 11, '', /at most 10/);
      expectPass(s.number({ min: 0, max: 10 }), 10);
    });

    it('distinguishes integers from numbers', () => {
      expectPass(s.integer(), -3);
      expectFail(s.integer(), 1.5, '', /must be an integer/);
    });

    it('names the key in a missing-string error', () => {
      const desc = s.object({ url: s.string({ required: true }) });
      expectFail(desc, {}, 'url', /missing or non-string url/);
      expectFail(desc, { url: 7 }, 'url', /missing or non-string url/);
    });

    it('rejects an empty string only when nonEmpty is set', () => {
      expectPass(s.string(), '');
      expectFail(s.string({ nonEmpty: true }), '', '', /missing or non-string/);
    });

    it('says a pattern failed rather than calling the value non-string', () => {
      // "missing or non-string" would be a lie about a string that is
      // simply spelled wrong.
      expectFail(s.string({ pattern: /^[a-z]+$/ }), 'Nope', '', /'Nope' does not match/);
    });

    it('reports a range failure as a range failure', () => {
      expectFail(s.integer({ min: 1 }), 0, '', /must be an integer at least 1, got 0/);
      expectFail(s.integer(), 'x', '', /must be an integer, got "x"/);
    });

    it('lists the allowed values of an enum', () => {
      expectFail(s.enumOf(['a', 'b']), 'c', '', /expected one of a, b, got "c"/);
    });
  });

  describe('presence', () => {
    it('applies a default in place of an absent field', () => {
      const desc = s.object({ width: s.number({ default: 32 }) });
      expect(expectPass(desc, {})).toEqual({ width: 32 });
      expect(expectPass(desc, { width: 8 })).toEqual({ width: 8 });
    });

    it('copies a default rather than sharing it between documents', () => {
      const desc = s.object({ gravity: s.object({ x: s.number(), y: s.number() }, { default: { x: 0, y: 1000 } }) });
      const first = expectPass(desc, {});
      const second = expectPass(desc, {});
      first.gravity.y = 1;
      expect(second.gravity.y).toBe(1000);
    });

    it('treats null like absent', () => {
      expectPass(s.object({ title: s.string() }), { title: null });
    });

    it('takes required from a predicate on the containing object', () => {
      // The UI rule: an element needs x unless it fills the screen.
      const desc = s.object({
        fill: s.boolean(),
        x: s.number({ required: element => !element.fill })
      });
      expectPass(desc, { fill: true });
      expectFail(desc, { fill: false }, 'x', /must be a number/);
    });
  });

  describe('objects', () => {
    it('rejects an unknown key, naming the path and what was allowed', () => {
      const desc = s.object({ a: s.number(), b: s.number() });
      expectFail(desc, { c: 1 }, 'c', /unknown field 'c' \(allowed: a, b\)/);
      expectFail(s.object({ outer: desc }), { outer: { c: 1 } }, 'outer.c', /unknown field 'c'/);
    });

    it('reports an unknown key before a bad value elsewhere', () => {
      // The typo is the author's actual mistake; a knock-on type error
      // downstream is noise.
      const desc = s.object({ a: s.number(), b: s.number() });
      expectFail(desc, { typo: 1, a: 'no' }, 'typo', /unknown field/);
    });

    it('runs refine after the fields validate', () => {
      const seen = [];
      const desc = s.object({ a: s.number({ default: 1 }) }, {
        refine(value, { path, fail }) {
          seen.push(value.a);
          if (value.a > 10) fail(`${path}.a`, 'too big');
        }
      });
      expectPass(desc, {});
      expect(seen).toEqual([1]);
      expectFail(desc, { a: 11 }, '.a', /too big/);
    });

    it('validates a record as arbitrary keys with one value shape', () => {
      const desc = s.record(s.object({ hp: s.number({ required: true }) }));
      expectPass(desc, { goblin: { hp: 3 }, orc: { hp: 9 } });
      expectFail(desc, { goblin: {} }, 'goblin.hp', /must be a number/);
    });
  });

  describe('arrays and tuples', () => {
    it('indexes the path of a bad element', () => {
      expectFail(s.array(s.number()), [1, 'two'], '[1]', /must be a number/);
    });

    it('enforces minLength with the array message', () => {
      const desc = s.array(s.number(), { minLength: 1, message: 'must be a non-empty array' });
      expectFail(desc, [], '', /must be a non-empty array/);
    });

    it('requires a tuple to have exactly its length', () => {
      const pair = s.tuple([s.number(), s.number()], { message: 'must be a pair' });
      expectPass(pair, [1, 2]);
      expectFail(pair, [1], '', /must be a pair/);
      expectFail(pair, [1, 2, 3], '', /must be a pair/);
    });
  });

  describe('unions', () => {
    const parallax = s.union([
      s.number({ match: v => typeof v === 'number' }),
      s.object({ x: s.number(), y: s.number() }, { match: v => typeof v === 'object' && v !== null })
    ], { message: 'must be a number or { "x", "y" }' });

    it('picks the branch that matches', () => {
      expectPass(parallax, 0.5);
      expectPass(parallax, { x: 1, y: 0 });
    });

    it('reports its own message when no branch matches', () => {
      expectFail(parallax, 'half', '', /must be a number or/);
    });

    it('validates the matched branch strictly, so a typo inside it still shows', () => {
      // The reason branches carry a `match`: falling back to "none of these
      // shapes fit" would hide the real mistake.
      expectFail(parallax, { x: 1, z: 2 }, 'z', /unknown field 'z'/);
    });
  });

  describe('tagged unions', () => {
    const shape = s.tagged('type', {
      circle: s.object({ type: s.string(), r: s.number({ required: true }) }),
      box: s.object({ type: s.string(), w: s.number({ required: true }) })
    }, { message: value => `unknown shape ${JSON.stringify(value)}` });

    it('validates against the variant its tag names', () => {
      expectPass(shape, { type: 'circle', r: 2 });
      expectFail(shape, { type: 'circle', w: 2 }, 'w', /unknown field 'w'/);
    });

    it('reports an unknown tag at the tag field', () => {
      expectFail(shape, { type: 'hexagon' }, 'type', /unknown shape "hexagon"/);
    });
  });

  describe('refs', () => {
    const desc = s.object({ sheet: s.ref('spritesheet', { required: true }) });
    const refs = {
      spritesheet: {
        has: name => name === 'hero',
        describe: name => `no spritesheet named '${name}' (declared: hero)`
      }
    };

    it('accepts a name the scope knows', () => {
      expectPass(desc, { sheet: 'hero' }, { refs });
    });

    it('rejects one it does not, with the scope\'s own message', () => {
      expectFail(desc, { sheet: 'villain' }, 'sheet', /no spritesheet named 'villain'/, { refs });
    });

    it('still type-checks when the scope is absent, but does not resolve', () => {
      // A loader with no game to ask cannot know what is registered; it must
      // not therefore accept a number.
      expectPass(desc, { sheet: 'anything' }, { refs: {} });
      expectFail(desc, { sheet: 7 }, 'sheet', /missing or non-string/, { refs: {} });
    });
  });

  describe('introspection', () => {
    it('lists an object descriptor\'s fields with their keys', () => {
      const desc = s.object({ x: s.number({ unit: 'px' }), name: s.string() });
      expect(fieldsOf(desc)).toEqual([
        { key: 'x', kind: 'number', unit: 'px' },
        { key: 'name', kind: 'string' }
      ]);
      expect(fieldsOf(s.number())).toEqual([]);
    });

    it('reports every ref scope a format reaches, for an editor\'s pickers', () => {
      expect(refScopesOf(LEVEL_SCHEMA).sort()).toEqual(['actor', 'asset', 'constraint', 'prefab', 'spritesheet']);
      expect(refScopesOf(UI_SCHEMA).sort()).toEqual(['asset', 'scene']);
    });

    it('exposes the scene format itself as data', () => {
      // What an inspector walks. If this stops being true the editor has to
      // keep a parallel copy of the format, which is the thing the schema
      // exists to prevent.
      const world = LEVEL_SCHEMA.fields.world;
      expect(fieldsOf(world).map(f => f.key)).toContain('gravity');
      expect(world.fields.sort.kind).toBe('enum');
      expect(world.fields.sort.values).toEqual(['depth', 'insertion']);
    });
  });
});
