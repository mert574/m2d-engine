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

/** The kinds of descriptor `s` builds. */
export type SchemaKind =
  | 'number' | 'integer' | 'string' | 'boolean' | 'enum' | 'object' | 'record'
  | 'array' | 'tuple' | 'union' | 'tagged' | 'ref' | 'dynamic' | 'any';

/** Where a validation is, and how it reports: the context `validate` threads through a walk. */
export interface ValidateContext {
  /** Must throw. */
  fail: (path: string, message: string) => never;
  /** Path of `value`, for error messages. */
  path?: string;
  /** The key `value` arrived under. */
  key?: string;
  /** The object containing `value`. */
  parent?: unknown;
  /**
   * Namespaces for `s.ref`. A scope that is absent is not checked, which is
   * how a loader with nothing to cross-reference against skips the check.
   */
  refs?: Record<string, RefScope>;
  /** Carried through to every `refine`. */
  context?: unknown;
  /**
   * Called at every `s.ref` that holds a string, resolved or not: how a
   * tool finds each reference a document makes without knowing where the
   * format keeps them.
   */
  onRef?: (scope: string, name: string, path: string) => void;
  /**
   * Report every problem, not just the first: each child of an object,
   * record, array or tuple (and each refine) is checked on its own, and an
   * error thrown by `fail` is handed to `collect` instead of ending the
   * walk. `collect` returns true for an error it recorded and false for one
   * that should propagate (a bug, not a problem with the document). A
   * failed child keeps its raw value, so the result is only meaningful when
   * nothing was collected.
   */
  collect?: (error: unknown) => boolean;
}

/**
 * What a `dynamic` descriptor's `select` may read to choose: where the
 * value is, and the caller's context. A tool resolving a descriptor
 * without validating (an inspector) passes these alone.
 */
export type SelectContext = Pick<ValidateContext, 'path' | 'key' | 'parent' | 'context'>;

/** One namespace an `s.ref` can point into. */
export interface RefScope {
  has(name: string): boolean;
  /** The error for a name that is not there. */
  describe(name: string): string;
}

/** What a `refine` is handed besides the value. */
export interface RefineContext {
  path: string;
  fail: (path: string, message: string) => never;
  refs: Record<string, RefScope> | undefined;
  context: unknown;
}

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
export interface SchemaOptions {
  required?: boolean | ((parent: unknown) => boolean);
  /** Applied by `validate` when the field is absent. */
  default?: unknown;
  /** Overrides the generated error. */
  message?: string | ((value: unknown, key: string) => string);
  /** `string`: the empty string is refused. */
  nonEmpty?: boolean;
  /** `string`: the value must match. */
  pattern?: RegExp;
  /** `number`, `integer`: the value must be greater than zero. */
  positive?: boolean;
  min?: number;
  max?: number;
  /** `array`: the fewest items allowed. */
  minLength?: number;
  /**
   * `object`, `record`, `array`: a rule over the validated value that
   * spans more than one field or reaches outside it. Throws through `fail`.
   */
  refine?: (value: never, ctx: RefineContext) => void;
  /** `union` branch: whether this branch claims the value. No `match` is the fallback. */
  match?: (value: unknown) => boolean;
  /** Inspector metadata: what a new object starts with. Never applied on load. */
  initial?: unknown;
  /** Inspector metadata, carried through untouched by validation. */
  label?: string;
  description?: string;
  unit?: string;
  /** The widget hint: 'color', 'asset', 'file', 'keys', 'cursor', 'font'. */
  editor?: string;
}

/**
 * A descriptor as `s` builds it: a frozen object with a `kind`, the
 * options of that kind and the shared options. A tool walks these to
 * build an inspector; `validate` walks them to check a document.
 */
export interface SchemaDescriptor extends SchemaOptions {
  readonly kind: SchemaKind;
  /** `object`: field name to descriptor, in declaration order. */
  readonly fields?: Readonly<Record<string, SchemaDescriptor>>;
  /** `record`: the descriptor every value validates against. */
  readonly value?: SchemaDescriptor;
  /** `array`: the descriptor every element validates against. */
  readonly item?: SchemaDescriptor;
  /** `tuple`: one descriptor per position. */
  readonly items?: readonly SchemaDescriptor[];
  /** `union`: the branches, each with an optional `match`. */
  readonly branches?: readonly SchemaDescriptor[];
  /** `tagged`: the field whose value picks the variant. */
  readonly tag?: string;
  /** `tagged`: tag value to object descriptor. */
  readonly variants?: Readonly<Record<string, SchemaDescriptor>>;
  /** `enum`: the allowed values. */
  readonly values?: readonly unknown[];
  /** `ref`: the namespace it points into ('prefab', 'spritesheet', ...). */
  readonly scope?: string;
  /** `dynamic`: the descriptor for a value, or null to accept it unchecked. */
  readonly select?: (value: unknown, ctx: SelectContext) => SchemaDescriptor | null;
}

/** A field of an object descriptor, with its key: what `fieldsOf` lists. */
export type SchemaField = SchemaDescriptor & { key: string };

function descriptor(kind: SchemaKind, options: Omit<SchemaDescriptor, 'kind'>): SchemaDescriptor {
  return Object.freeze({ kind, ...options });
}

export const s = {
  /** A finite number. `positive: true` additionally requires > 0. */
  number: (options: SchemaOptions = {}) => descriptor('number', options),
  /** A safe integer. */
  integer: (options: SchemaOptions = {}) => descriptor('integer', options),
  string: (options: SchemaOptions = {}) => descriptor('string', options),
  boolean: (options: SchemaOptions = {}) => descriptor('boolean', options),
  /** One of a fixed set of values. An editor draws this as a dropdown. */
  enumOf: (values: readonly unknown[], options: SchemaOptions = {}) => descriptor('enum', { values, ...options }),
  /**
   * An object with a known set of fields. Unknown keys are an error.
   * `refine(value, ctx)` runs after the fields validate, for the rules that
   * span more than one field or reach outside the object.
   */
  object: (fields: Readonly<Record<string, SchemaDescriptor>>, options: SchemaOptions = {}) => descriptor('object', { fields, ...options }),
  /** An object used as a map: arbitrary keys, one descriptor for the values. */
  record: (value: SchemaDescriptor, options: SchemaOptions = {}) => descriptor('record', { value, ...options }),
  /** An array, every element the same descriptor. `minLength` is honoured. */
  array: (item: SchemaDescriptor, options: SchemaOptions = {}) => descriptor('array', { item, ...options }),
  /** A fixed-length array, one descriptor per position. */
  tuple: (items: readonly SchemaDescriptor[], options: SchemaOptions = {}) => descriptor('tuple', { items, ...options }),
  /**
   * One of several shapes. Each branch carries a `match(value)` predicate
   * choosing it; the chosen branch is then validated strictly, so a typo
   * inside a matched branch still reports as an unknown field rather than
   * collapsing into "none of these shapes fit".
   */
  union: (branches: readonly SchemaDescriptor[], options: SchemaOptions = {}) => descriptor('union', { branches, ...options }),
  /**
   * An object whose shape is chosen by the value of one of its own fields —
   * a UI element's `type`. `variants` maps tag value to object descriptor.
   */
  tagged: (tag: string, variants: Readonly<Record<string, SchemaDescriptor>>, options: SchemaOptions = {}) => descriptor('tagged', { tag, variants, ...options }),
  /**
   * A name that must refer to something declared elsewhere: a spritesheet,
   * a prefab, a registered actor, a registered scene. `scope` names the
   * namespace, resolved against `refs` at validation time — and it is also
   * what tells an editor which picker to show.
   */
  ref: (scope: string, options: SchemaOptions = {}) => descriptor('ref', { scope, ...options }),
  /**
   * A shape chosen at validation time rather than written here: the params
   * of a constraint depend on which constraint it is, and the set of
   * constraints is a registry a game fills, not a fixed list.
   *
   * `select(value, ctx)` returns the descriptor to use, or null to accept
   * the value unchecked — which is the honest answer when the registry
   * cannot say, as in a loader with no game attached.
   */
  dynamic: (select: (value: unknown, ctx: SelectContext) => SchemaDescriptor | null, options: SchemaOptions = {}) => descriptor('dynamic', { select, ...options }),
  /** Anything at all. For a field the engine passes through untouched. */
  any: (options: SchemaOptions = {}) => descriptor('any', options)
};

/** Resolve `message`, which may be a string or a function of the value. */
function messageFor(desc: SchemaDescriptor, value: unknown, key: string): string | undefined {
  const { message } = desc;
  if (message === undefined) return undefined;
  return typeof message === 'function' ? message(value, key) : message;
}

/** What a descriptor wanted, for the error when it did not get it. */
function expected(desc: SchemaDescriptor, key: string): string {
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
function numberMessage(desc: SchemaDescriptor, value: unknown): string {
  const kind = desc.kind === 'integer' ? 'an integer' : 'a number';
  if (desc.positive) return `must be ${kind === 'an integer' ? 'a positive integer' : 'a positive number'}`;
  const range = [
    desc.min !== undefined ? `at least ${desc.min}` : null,
    desc.max !== undefined ? `at most ${desc.max}` : null
  ].filter(Boolean).join(' and ');
  return `must be ${kind}${range ? ` ${range}` : ''}, got ${JSON.stringify(value)}`;
}

/** Whether a number sits inside the descriptor's bounds. */
function inRange(desc: SchemaDescriptor, value: number): boolean {
  return (!desc.positive || value > 0)
    && (desc.min === undefined || value >= desc.min)
    && (desc.max === undefined || value <= desc.max);
}

/** Whether a field is required here, given the object that contains it. */
function isRequired(desc: SchemaDescriptor, parent: unknown): boolean {
  return typeof desc.required === 'function' ? desc.required(parent) : desc.required === true;
}

/** `path.key` at depth, or bare `key` at the root. */
function join(path: string, key: string): string {
  return path ? `${path}.${key}` : String(key);
}

/** A plain object's own entries, read by key. */
type Bag = Record<string, unknown>;

/** Whether `value` is an object but not an array: what `object`, `record` and `tagged` accept. */
function isObject(value: unknown): value is Bag {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A part a kind of descriptor cannot do without — an `enum`'s `values`, an
 * `object`'s `fields`. `s` always sets it; a descriptor written by hand
 * without it is a bug, reported as one.
 */
function part<T>(desc: SchemaDescriptor, value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`schema: a '${desc.kind}' descriptor has no '${name}'`);
  return value;
}

/** Run a descriptor's `refine`, typed for the value it was declared over. */
function refine(desc: SchemaDescriptor, value: unknown, ctx: RefineContext): void {
  (desc.refine as ((value: unknown, ctx: RefineContext) => void) | undefined)?.(value, ctx);
}

/**
 * Check and normalize `value` against `desc`, returning the normalized
 * value: the input plus defaults, never a different shape.
 *
 * The result is typed `unknown` on purpose: it is a document that has
 * passed its schema, and the caller says what it holds.
 */
export function validate(desc: SchemaDescriptor, value: unknown, ctx: ValidateContext): unknown {
  const { fail, path = '', key = '', parent, collect } = ctx;
  /** Run one independent check; with `collect`, record its failure and go on. */
  const isolate: <T>(check: () => T, fallback?: T) => T | undefined = collect
    ? (check, fallback) => {
      try {
        return check();
      } catch (error) {
        if (!collect(error)) throw error;
        return fallback;
      }
    }
    : (check) => check();

  /** Fail with the descriptor's own message, or `fallback`. */
  const reject: (fallback: string) => never = (fallback) => fail(path, messageFor(desc, value, key) ?? fallback);
  const refineContext = (): RefineContext => ({ path, fail, refs: ctx.refs, context: ctx.context });

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
      if (!isNumber || !inRange(desc, value as number)) reject(numberMessage(desc, value));
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
      const values = part(desc, desc.values, 'values');
      if (!values.includes(value)) {
        reject(`expected one of ${values.join(', ')}, got ${JSON.stringify(value)}`);
      }
      return value;
    }

    case 'ref': {
      if (typeof value !== 'string' || !value) reject(expected(desc, key));
      const scopeName = part(desc, desc.scope, 'scope');
      ctx.onRef?.(scopeName, value, path);
      const scope = ctx.refs?.[scopeName];
      if (scope && !scope.has(value)) fail(path, scope.describe(value));
      return value;
    }

    case 'object': {
      if (!isObject(value)) reject(expected(desc, key));
      const fields = part(desc, desc.fields, 'fields');
      const allowed = Object.keys(fields);
      for (const name of Object.keys(value)) {
        if (!(name in fields)) {
          isolate(() => fail(join(path, name), `unknown field '${name}' (allowed: ${allowed.join(', ')})`));
        }
      }
      const out: Bag = { ...value };
      for (const [name, field] of Object.entries(fields)) {
        const result = isolate(() => validate(field, value[name],
          { ...ctx, path: join(path, name), key: name, parent: value }), value[name]);
        if (result !== undefined) out[name] = result;
      }
      if (desc.refine) isolate(() => refine(desc, out, refineContext()));
      return out;
    }

    case 'record': {
      if (!isObject(value)) reject(expected(desc, key));
      const item = part(desc, desc.value, 'value');
      const out: Bag = {};
      for (const [name, entry] of Object.entries(value)) {
        // `out.__proto__ = entry` sets a prototype and keeps nothing, so a
        // document may not name one: it would vanish on the way through.
        if (name === '__proto__') { isolate(() => fail(join(path, name), "'__proto__' cannot be a key")); continue; }
        out[name] = isolate(() => validate(item, entry,
          { ...ctx, path: join(path, name), key: name, parent: value }), entry);
      }
      if (desc.refine) isolate(() => refine(desc, out, refineContext()));
      return out;
    }

    case 'array': {
      if (!Array.isArray(value)) reject(expected(desc, key));
      const item = part(desc, desc.item, 'item');
      if (desc.minLength !== undefined && value.length < desc.minLength) {
        reject(`must have at least ${desc.minLength} item${desc.minLength === 1 ? '' : 's'}`);
      }
      const out = value.map((entry: unknown, i) => isolate(() => validate(item, entry,
        { ...ctx, path: `${path}[${i}]`, key: String(i), parent: value }), entry));
      if (desc.refine) isolate(() => refine(desc, out, refineContext()));
      return out;
    }

    case 'tuple': {
      const items = part(desc, desc.items, 'items');
      if (!Array.isArray(value) || value.length !== items.length) {
        reject(`must be an array of ${items.length}`);
      }
      return value.map((entry: unknown, i) => isolate(() => validate(part(desc, items[i], `items[${i}]`), entry,
        { ...ctx, path: `${path}[${i}]`, key: String(i), parent: value }), entry));
    }

    case 'dynamic': {
      const chosen = part(desc, desc.select, 'select')(value, ctx);
      return chosen ? validate(chosen, value, ctx) : value;
    }

    case 'union': {
      // A branch with no `match` is the fallback, and matches anything.
      const branch = part(desc, desc.branches, 'branches').find(option => !option.match || option.match(value));
      if (!branch) reject(expected(desc, key));
      return validate(branch, value, ctx);
    }

    case 'tagged': {
      if (!isObject(value)) reject(expected(desc, key));
      const tagName = part(desc, desc.tag, 'tag');
      const variants = part(desc, desc.variants, 'variants');
      const tag = value[tagName];
      // A property key is the tag as a string, as `variants[tag]` reads it in JavaScript.
      const branch = variants[String(tag)];
      if (!branch) {
        ctx.fail(join(path, tagName), messageFor(desc, tag, tagName)
          ?? `expected one of ${Object.keys(variants).join(', ')}, got ${JSON.stringify(tag)}`);
      }
      return validate(branch, value, ctx);
    }

    default: {
      const unknown: never = desc.kind;
      throw new Error(`schema: unknown descriptor kind '${String(unknown)}'`);
    }
  }
}

/**
 * The fields of an object descriptor as a list, each with its key — what an
 * inspector iterates to draw a property panel. Returns an empty list for a
 * descriptor that has no fields.
 */
export function fieldsOf(desc: SchemaDescriptor | null | undefined): SchemaField[] {
  if (desc?.kind !== 'object' || !desc.fields) return [];
  return Object.entries(desc.fields).map(([key, field]) => ({ key, ...field }));
}

/**
 * Every `s.ref` scope reachable from a descriptor, deduplicated — the set of
 * namespaces a document can point into, which is what an editor needs to
 * know which asset pickers a format requires.
 */
export function refScopesOf(desc: SchemaDescriptor): string[] {
  const found = new Set<string>();
  const seen = new Set<SchemaDescriptor>();
  const walk = (node: SchemaDescriptor | undefined): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.kind === 'ref' && node.scope !== undefined) found.add(node.scope);
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
