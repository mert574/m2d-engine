/**
 * Console variables: the engine's tunable state, as a registry.
 *
 * ## Why a registry instead of scattered setters
 *
 * The engine already had every knob a settings screen wants — resolution,
 * aspect mode, pause, timescale, the debug overlay — but each lived as a
 * differently-shaped method or flag on a different object, so every surface
 * that wanted to show one (the settings menu, a future console, a game's own
 * options screen) had to hand-wire label, read, write and formatting per
 * knob. A cvar is that wiring done once: a **name**, a **type**, a way to
 * read, a way to write, and a description. The settings menu becomes a view
 * onto this registry, and the developer console gets every variable for
 * free, including the ones a game registers for itself.
 *
 * The idiom is Quake/Source's, and so is the naming convention: a short
 * subsystem prefix (`r_` render, `g_` game, `cl_` client/HUD) so that
 * completion over a prefix finds a family.
 *
 * ## Live values
 *
 * A cvar may *own* its value, or it may be an **accessor** over engine state
 * (`get`/`set`), so reading `r_aspect` asks the engine rather than a copy
 * that can drift. Writes go through parsing, clamping and choice-checking
 * first, so a typo in the console cannot put the engine in a state no menu
 * could have produced.
 *
 * ## Persistence
 *
 * A cvar with `persist: true` is written to localStorage on change and
 * replayed on registration, scoped by the game's `saveId` so two demos on
 * one origin do not share settings. Replay happens at register time because
 * that is the moment both the definition and the live engine exist.
 */

/** Coerce and validate one write. Throws with a message fit for the console. */
function parseValue(definition, raw) {
  const { type, name } = definition;

  if (type === 'number') {
    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value)) throw new Error(`${name}: expected a number, got '${raw}'`);
    const min = definition.min ?? -Infinity;
    const max = definition.max ?? Infinity;
    return Math.min(max, Math.max(min, value));
  }

  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const text = String(raw).trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(text)) return true;
    if (['0', 'false', 'off', 'no'].includes(text)) return false;
    throw new Error(`${name}: expected 0/1/on/off, got '${raw}'`);
  }

  // Strings, optionally constrained to a set of choices.
  const value = String(raw);
  if (definition.choices && !definition.choices.includes(value)) {
    throw new Error(`${name}: expected one of ${definition.choices.join(', ')}, got '${value}'`);
  }
  return value;
}

export class CVarRegistry {
  /**
   * @param {Object} [options]
   * @param {string} [options.saveId=''] - Scope for persisted values, so two
   *   games on one origin keep separate settings
   * @param {Storage} [options.storage] - Defaults to `localStorage` where it
   *   exists; absent (node, blocked cookies) persistence is silently off
   */
  constructor(options = {}) {
    /** @type {Map<string, object>} */
    this.vars = new Map();
    this.saveId = options.saveId ?? '';
    this.storage = options.storage !== undefined ? options.storage : defaultStorage();
  }

  /**
   * Register a variable.
   *
   * @param {string} name - e.g. `'r_aspect'`
   * @param {Object} definition
   * @param {'number'|'boolean'|'string'} definition.type
   * @param {*} [definition.default] - Required unless `get` is given
   * @param {() => *} [definition.get] - Read live engine state instead of a
   *   stored value
   * @param {(value) => void} [definition.set] - Write it. With `get` but no
   *   `set` the cvar is read-only
   * @param {number} [definition.min], [definition.max] - Clamp for numbers
   * @param {string[]} [definition.choices] - Allowed values for strings
   * @param {string} [definition.description] - One line for `help` and `find`
   * @param {boolean} [definition.persist=false] - Save to storage on change
   * @param {(value, previous) => void} [definition.onChange]
   */
  register(name, definition) {
    if (this.vars.has(name)) throw new Error(`cvar '${name}' is already registered`);
    if (!definition.get && definition.default === undefined) {
      throw new Error(`cvar '${name}' needs a default or a getter`);
    }

    const entry = {
      name,
      type: definition.type ?? 'string',
      description: definition.description ?? '',
      min: definition.min,
      max: definition.max,
      choices: definition.choices,
      persist: definition.persist ?? false,
      onChange: definition.onChange ?? null,
      get: definition.get ?? null,
      setLive: definition.set ?? null,
      default: definition.default,
      value: definition.default
    };
    this.vars.set(name, entry);

    // Replay a persisted value now, when definition and engine both exist.
    // A stored value that no longer parses (the choices changed between
    // versions) is dropped rather than left to wedge startup.
    if (entry.persist) {
      const stored = this.#load(name);
      if (stored !== null) {
        try {
          this.set(name, stored);
        } catch {
          this.#store(name, null);
        }
      }
    }
    return entry;
  }

  /** Whether a variable exists. */
  has(name) {
    return this.vars.has(name);
  }

  /** The definition, for surfaces that render cvars (menus, completion). */
  describe(name) {
    return this.vars.get(name) ?? null;
  }

  /** Current value. Throws on an unknown name. */
  get(name) {
    const entry = this.#entry(name);
    return entry.get ? entry.get() : entry.value;
  }

  /**
   * Write a value, through parsing, clamping and validation.
   * @returns {*} The value as actually stored, post-coercion
   */
  set(name, raw) {
    const entry = this.#entry(name);
    if (entry.get && !entry.setLive) throw new Error(`${name} is read-only`);
    const previous = this.get(name);
    const value = parseValue(entry, raw);

    if (entry.setLive) entry.setLive(value);
    else entry.value = value;

    if (entry.persist) this.#store(name, value);
    if (value !== previous) entry.onChange?.(value, previous);
    return value;
  }

  /** Flip a boolean. */
  toggle(name) {
    const entry = this.#entry(name);
    if (entry.type !== 'boolean') throw new Error(`${name} is not a boolean`);
    return this.set(name, !this.get(name));
  }

  /** Return a cvar to its default. */
  reset(name) {
    const entry = this.#entry(name);
    if (entry.default === undefined) throw new Error(`${name} has no default`);
    return this.set(name, entry.default);
  }

  /**
   * Names, sorted, optionally filtered by a substring match over the name
   * and the description — which is what makes `find fps` useful without
   * knowing any prefix.
   */
  list(filter = '') {
    const needle = filter.toLowerCase();
    return [...this.vars.keys()]
      .filter((name) => {
        if (!needle) return true;
        const entry = this.vars.get(name);
        return name.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle);
      })
      .sort();
  }

  #entry(name) {
    const entry = this.vars.get(name);
    if (!entry) throw new Error(`unknown cvar '${name}'`);
    return entry;
  }

  #key(name) {
    return `m2d:${this.saveId}:cvar:${name}`;
  }

  #store(name, value) {
    try {
      if (value === null) this.storage?.removeItem(this.#key(name));
      else this.storage?.setItem(this.#key(name), JSON.stringify(value));
    } catch {
      // Quota or privacy mode: settings simply do not stick. Not worth a throw.
    }
  }

  #load(name) {
    try {
      const raw = this.storage?.getItem(this.#key(name));
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Accessing localStorage can itself throw under blocked third-party
    // storage; a console without persistence beats a crash.
    return null;
  }
}
