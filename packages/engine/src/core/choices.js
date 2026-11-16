/**
 * A player's choices: what they picked on a screen and should find picked
 * again — the car in the garage, a difficulty. The project declares them
 * (`choices` in m2d.project.json: each a list of values and an initial), a
 * UI line records one (`set: { choice, value }`), the engine keeps them
 * between sessions, and the simulation reads them as the player's state
 * (`player.state.<name>`), where a player's own facts live and what a
 * server replicates. A choice is the game's; a setting (the renderer, the
 * volume) is the engine's and lives in a cvar.
 */
export class Choices {
  /**
   * @param {Record<string, { values: Array<string|number|boolean>, initial: string|number|boolean }>} [declared]
   * @param {object} [options]
   * @param {string|null} [options.storageKey] - Where the player's choices are kept; null keeps none
   * @param {(name: string, value: string|number|boolean) => void} [options.onChange]
   */
  constructor(declared = {}, { storageKey = null, onChange = null } = {}) {
    this.declared = structuredClone(declared);
    this.storageKey = storageKey;
    this.onChange = onChange;
    /** @type {Map<string, string|number|boolean>} */
    this.current = new Map(Object.entries(declared).map(([name, choice]) => [name, choice.initial]));
    for (const [name, value] of Object.entries(this.#stored())) {
      if (this.has(name) && this.values(name).includes(value)) this.current.set(name, value);
    }
  }

  /** Every choice's name, in declaration order. */
  get names() {
    return [...this.current.keys()];
  }

  has(name) {
    return this.current.has(name);
  }

  /** What a choice may be set to; empty for one not declared. */
  values(name) {
    return this.declared[name]?.values ?? [];
  }

  get(name) {
    if (!this.has(name)) throw new Error(`M2D choices: no choice named '${name}' (declared: ${this.names.join(', ') || 'none'})`);
    return this.current.get(name);
  }

  /** Record a choice, and keep it. Refused for a value the project did not offer. */
  set(name, value) {
    const allowed = this.values(name);
    if (!this.has(name)) throw new Error(`M2D choices: no choice named '${name}' (declared: ${this.names.join(', ') || 'none'})`);
    if (!allowed.includes(value)) throw new Error(`M2D choices: '${name}' cannot be ${JSON.stringify(value)} (offered: ${allowed.map((v) => JSON.stringify(v)).join(', ')})`);
    this.current.set(name, value);
    this.#store();
    this.onChange?.(name, value);
  }

  /** Every choice as it stands, as a plain record: what the local player's state starts with. */
  get all() {
    return Object.fromEntries(this.current);
  }

  /** Every choice at its initial: what a player who joins from elsewhere starts with. */
  get initials() {
    return Object.fromEntries(Object.entries(this.declared).map(([name, choice]) => [name, choice.initial]));
  }

  #stored() {
    if (!this.storageKey || typeof localStorage === 'undefined') return {};
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  #store() {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    const changed = Object.fromEntries([...this.current].filter(([name, value]) => value !== this.declared[name].initial));
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(changed));
    } catch {
      // A private window may refuse storage; the choice still holds for this session.
    }
  }
}
