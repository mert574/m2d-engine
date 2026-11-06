/**
 * A small declarative schema: a data format written as data.
 *
 * Validation written by hand reads well and diagnoses well, and has one
 * fatal property: the format then exists only as control flow, so nothing
 * can *ask* it what a field is. Tooling needs exactly that — for every
 * property its type, default, range, allowed values, and whether it names
 * something elsewhere in the project — or it keeps a parallel copy of the
 * format that drifts from the loader.
 *
 * So the format is descriptors, and the same descriptors do both jobs:
 * `validate` walks them to check and normalize a document, and an editor
 * walks them to build an inspector.
 *
 * ```js
 * const Point = s.object({
 *   x: s.number({ required: true }),
 *   y: s.number({ required: true }),
 *   label: s.string()
 * });
 * validate(Point, { x: 1, y: 2 }, { fail });
 * ```
 *
 * Validation is strict: an unknown key is an error naming the path and
 * what was allowed, because silently ignoring a field the author believed
 * in is the failure worth designing against.
 *
 * Errors go through a caller-supplied `fail(path, message)`, which must
 * throw. This module has no error class of its own, so it stays usable by
 * anything with one. See `sceneSchema.js` and `assetSchema.js` for the
 * formats built on it.
 */

/**
 * Descriptor options shared by every kind:
 *
 * - `required` — `true`, or a predicate on the containing object, so a
 *   field can be required only in some shapes (a UI element needs `x`
 *   unless it fills the screen).
 * - `nonEmpty`, `pattern` — on a string; `positive`, `min`, `max` — on a
 *   number.
 * - `default` — applied when the field is absent. Normalization happens
 *   once, here, rather than at each use site.
 * - `message` — overrides the generated error, as a string or as
 *   `(value, key) => string`.
 * - `label`, `description`, `unit` — carried through untouched for an
 *   editor's inspector. Validation ignores them.
 */
function descriptor(kind, options) {
  return Object.freeze({ kind, ...options });
}

export const s = {
  /** A finite number. `positive: true` additionally requires > 0. */
  number: (options = {}) => descriptor('number', options),
  /** A safe integer. */
  integer: (options = {}) => descriptor('integer', options),
  string: (options = {}) => descriptor('string', options),
  boolean: (options = {}) => descriptor('boolean', options),
  /** One of a fixed set of values. An editor draws this as a dropdown. */
  enumOf: (values, options = {}) => descriptor('enum', { values, ...options }),
  /**
   * An object with a known set of fields. Unknown keys are an error.
   * `refine(value, ctx)` runs after the fields validate, for the rules that
   * span more than one field or reach outside the object.
   */
  object: (fields, options = {}) => descriptor('object', { fields, ...options }),
  /** An object used as a map: arbitrary keys, one descriptor for the values. */
  record: (value, options = {}) => descriptor('record', { value, ...options }),
  /** An array, every element the same descriptor. `minLength` is honoured. */
  array: (item, options = {}) => descriptor('array', { item, ...options }),
  /** A fixed-length array, one descriptor per position. */
  tuple: (items, options = {}) => descriptor('tuple', { items, ...options }),
  /**
   * One of several shapes. Each branch carries a `match(value)` predicate
   * choosing it; the chosen branch is then validated strictly, so a typo
   * inside a matched branch still reports as an unknown field rather than
   * collapsing into "none of these shapes fit".
   */
  union: (branches, options = {}) => descriptor('union', { branches, ...options }),
  /**
   * An object whose shape is chosen by the value of one of its own fields —
   * a UI element's `type`. `variants` maps tag value to object descriptor.
   */
  tagged: (tag, variants, options = {}) => descriptor('tagged', { tag, variants, ...options }),
  /**
   * A name that must refer to something declared elsewhere: a spritesheet,
   * a prefab, a registered actor, a registered scene. `scope` names the
   * namespace, resolved against `refs` at validation time — and it is also
   * what tells an editor which picker to show.
   */
  ref: (scope, options = {}) => descriptor('ref', { scope, ...options }),
  /**
   * A shape chosen at validation time rather than written here: the params
   * of a constraint depend on which constraint it is, and the set of
   * constraints is a registry a game fills, not a fixed list.
   *
   * `select(value, ctx)` returns the descriptor to use, or null to accept
   * the value unchecked — which is the honest answer when the registry
   * cannot say, as in a loader with no game attached.
   */
  dynamic: (select, options = {}) => descriptor('dynamic', { select, ...options }),
  /** Anything at all. For a field the engine passes through untouched. */
  any: (options = {}) => descriptor('any', options)
};

/** Resolve `message`, which may be a string or a function of the value. */
function messageFor(desc, value, key) {
  const { message } = desc;
  if (message === undefined) return undefined;
  return typeof message === 'function' ? message(value, key) : message;
}

/** What a descriptor wanted, for the error when it did not get it. */
function expected(desc, key) {
  switch (desc.kind) {
    case 'string': case 'ref': return `missing or non-string ${key}`;
    case 'number': return desc.positive ? 'must be a positive number' : 'must be a number';
    case 'integer': return 'must be an integer';
    case 'boolean': return 'must be a boolean';
    case 'object': case 'record': case 'tagged': return 'must be an object';
    case 'array': case 'tuple': return 'must be an array';
    default: return `missing ${key}`;
  }
}

/** A number or integer that failed its type or its range. */
function numberMessage(desc, value) {
  const kind = desc.kind === 'integer' ? 'an integer' : 'a number';
  if (desc.positive) return `must be ${kind === 'an integer' ? 'a positive integer' : 'a positive number'}`;
  const range = [
    desc.min !== undefined ? `at least ${desc.min}` : null,
    desc.max !== undefined ? `at most ${desc.max}` : null
  ].filter(Boolean).join(' and ');
  return `must be ${kind}${range ? ` ${range}` : ''}, got ${JSON.stringify(value)}`;
}

/** Whether a number sits inside the descriptor's bounds. */
function inRange(desc, value) {
  return (!desc.positive || value > 0)
    && (desc.min === undefined || value >= desc.min)
    && (desc.max === undefined || value <= desc.max);
}

/** Whether a field is required here, given the object that contains it. */
function isRequired(desc, parent) {
  return typeof desc.required === 'function' ? desc.required(parent) : desc.required === true;
}

/** `path.key` at depth, or bare `key` at the root. */
function join(path, key) {
  return path ? `${path}.${key}` : String(key);
}

/**
 * Check and normalize `value` against `desc`, returning the normalized
 * value: the input plus defaults, never a different shape.
 *
 * @param {object} desc - A descriptor from `s`.
 * @param {*} value
 * @param {object} ctx
 * @param {(path: string, message: string) => never} ctx.fail - Must throw.
 * @param {string} [ctx.path] - Path of `value`, for error messages.
 * @param {string} [ctx.key] - The key `value` arrived under.
 * @param {object} [ctx.parent] - The object containing `value`.
 * @param {Object<string, {has: (name: string) => boolean,
 *   describe: (name: string) => string}>} [ctx.refs] - Namespaces for
 *   `s.ref`. A scope that is absent is not checked, which is how a loader
 *   with nothing to cross-reference against skips the check.
 * @param {object} [ctx.context] - Carried through to every `refine`.
 * @returns {*}
 */
export function validate(desc, value, ctx) {
  const { fail, path = '', key = '', parent } = ctx;

  /** Fail with the descriptor's own message, or `fallback`. */
  const reject = (fallback) => fail(path, messageFor(desc, value, key) ?? fallback);

  if (value === undefined || value === null) {
    if (isRequired(desc, parent)) reject(expected(desc, key));
    return desc.default !== undefined ? structuredClone(desc.default) : undefined;
  }

  switch (desc.kind) {
    case 'any':
      return value;

    case 'number':
    case 'integer': {
      const isNumber = desc.kind === 'integer' ? Number.isSafeInteger(value) : Number.isFinite(value);
      if (!isNumber || !inRange(desc, value)) reject(numberMessage(desc, value));
      return value;
    }

    case 'string': {
      if (typeof value !== 'string' || (desc.nonEmpty && !value)) reject(expected(desc, key));
      // A pattern failure is not a type failure: "missing or non-string"
      // would be a lie about a string that is simply spelled wrong.
      if (desc.pattern && !desc.pattern.test(value)) {
        reject(`'${value}' does not match ${desc.pattern}`);
      }
      return value;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') reject(expected(desc, key));
      return value;
    }

    case 'enum': {
      if (!desc.values.includes(value)) {
        reject(`expected one of ${desc.values.join(', ')}, got ${JSON.stringify(value)}`);
      }
      return value;
    }

    case 'ref': {
      if (typeof value !== 'string' || !value) reject(expected(desc, key));
      const scope = ctx.refs?.[desc.scope];
      if (scope && !scope.has(value)) fail(path, scope.describe(value));
      return value;
    }

    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) reject(expected(desc, key));
      const { fields } = desc;
      const allowed = Object.keys(fields);
      for (const name of Object.keys(value)) {
        if (!(name in fields)) {
          fail(join(path, name), `unknown field '${name}' (allowed: ${allowed.join(', ')})`);
        }
      }
      const out = { ...value };
      for (const [name, field] of Object.entries(fields)) {
        const result = validate(field, value[name],
          { ...ctx, path: join(path, name), key: name, parent: value });
        if (result !== undefined) out[name] = result;
      }
      desc.refine?.(out, { path, fail, refs: ctx.refs, context: ctx.context });
      return out;
    }

    case 'record': {
      if (typeof value !== 'object' || Array.isArray(value)) reject(expected(desc, key));
      const out = {};
      for (const [name, entry] of Object.entries(value)) {
        out[name] = validate(desc.value, entry,
          { ...ctx, path: join(path, name), key: name, parent: value });
      }
      return out;
    }

    case 'array': {
      if (!Array.isArray(value)) reject(expected(desc, key));
      if (desc.minLength !== undefined && value.length < desc.minLength) {
        reject(`must have at least ${desc.minLength} item${desc.minLength === 1 ? '' : 's'}`);
      }
      const out = value.map((entry, i) => validate(desc.item, entry,
        { ...ctx, path: `${path}[${i}]`, key: String(i), parent: value }));
      desc.refine?.(out, { path, fail, refs: ctx.refs, context: ctx.context });
      return out;
    }

    case 'tuple': {
      if (!Array.isArray(value) || value.length !== desc.items.length) {
        reject(`must be an array of ${desc.items.length}`);
      }
      return value.map((entry, i) => validate(desc.items[i], entry,
        { ...ctx, path: `${path}[${i}]`, key: String(i), parent: value }));
    }

    case 'dynamic': {
      const chosen = desc.select(value, ctx);
      return chosen ? validate(chosen, value, ctx) : value;
    }

    case 'union': {
      // A branch with no `match` is the fallback, and matches anything.
      const branch = desc.branches.find(option => !option.match || option.match(value));
      if (!branch) reject(expected(desc, key));
      return validate(branch, value, ctx);
    }

    case 'tagged': {
      if (typeof value !== 'object' || Array.isArray(value)) reject(expected(desc, key));
      const tag = value[desc.tag];
      const branch = desc.variants[tag];
      if (!branch) {
        fail(join(path, desc.tag), messageFor(desc, tag, desc.tag)
          ?? `expected one of ${Object.keys(desc.variants).join(', ')}, got ${JSON.stringify(tag)}`);
      }
      return validate(branch, value, ctx);
    }

    default:
      throw new Error(`schema: unknown descriptor kind '${desc.kind}'`);
  }
}

/**
 * The fields of an object descriptor as a list, each with its key — what an
 * inspector iterates to draw a property panel. Returns an empty list for a
 * descriptor that has no fields.
 * @param {object} desc
 * @returns {Array<{key: string} & object>}
 */
export function fieldsOf(desc) {
  if (desc?.kind !== 'object') return [];
  return Object.entries(desc.fields).map(([key, field]) => ({ key, ...field }));
}

/**
 * Every `s.ref` scope reachable from a descriptor, deduplicated — the set of
 * namespaces a document can point into, which is what an editor needs to
 * know which asset pickers a format requires.
 * @param {object} desc
 * @returns {string[]}
 */
export function refScopesOf(desc) {
  const found = new Set();
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.kind === 'ref') found.add(node.scope);
    if (node.fields) Object.values(node.fields).forEach(walk);
    if (node.variants) Object.values(node.variants).forEach(walk);
    if (node.value) walk(node.value);
    if (node.item) walk(node.item);
    if (node.items) node.items.forEach(walk);
    if (node.branches) node.branches.forEach(walk);
  };
  walk(desc);
  return [...found];
}
