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
/** What a choice may hold. */
export type ChoiceValue = string | number | boolean;

/** A choice as the project declares it. */
export interface ChoiceSpec {
  values: ChoiceValue[];
  initial: ChoiceValue;
}

export class Choices {
  declared: Record<string, ChoiceSpec>;
  /** Where the player's choices are kept; null keeps none. */
  storageKey: string | null;
  onChange: ((name: string, value: ChoiceValue) => void) | null;
  current: Map<string, ChoiceValue>;

  constructor(
    declared: Record<string, ChoiceSpec> = {},
    { storageKey = null, onChange = null }: { storageKey?: string | null; onChange?: ((name: string, value: ChoiceValue) => void) | null } = {}
  ) {
    this.declared = structuredClone(declared);
    for (const choice of Object.values(this.declared)) Object.freeze(choice.values);
    this.storageKey = storageKey;
    this.onChange = onChange;
    this.current = new Map(Object.entries(declared).map(([name, choice]) => [name, choice.initial]));
    for (const [name, value] of Object.entries(this.#stored())) {
      // `includes` is the proof the stored value is one the project offers.
      if (this.has(name) && (this.values(name) as unknown[]).includes(value)) this.current.set(name, value as ChoiceValue);
    }
  }

  /** Every choice's name, in declaration order. */
  get names(): string[] {
    return [...this.current.keys()];
  }

  has(name: string): boolean {
    return this.current.has(name);
  }

  /** What a choice may be set to; empty for one not declared. */
  values(name: string): ChoiceValue[] {
    return this.declared[name]?.values ?? [];
  }

  get(name: string): ChoiceValue {
    this.#known(name);
    return this.current.get(name)!;
  }

  /** What a choice starts at. */
  initial(name: string): ChoiceValue {
    this.#known(name);
    return this.declared[name]!.initial;
  }

  /** Record a choice, and keep it. Refused for a value the project did not offer. */
  set(name: string, value: ChoiceValue): void {
    this.#known(name);
    const allowed = this.values(name);
    if (!allowed.includes(value)) throw new Error(`M2D choices: '${name}' cannot be ${JSON.stringify(value)} (offered: ${allowed.map((v) => JSON.stringify(v)).join(', ')})`);
    this.current.set(name, value);
    this.#store();
    this.onChange?.(name, value);
  }

  /** Every choice as it stands, as a plain record: what the local player's state starts with. */
  get all(): Record<string, ChoiceValue> {
    return Object.fromEntries(this.current);
  }

  /** Every choice at its initial: what a player who joins from elsewhere starts with. */
  get initials(): Record<string, ChoiceValue> {
    return Object.fromEntries(Object.entries(this.declared).map(([name, choice]) => [name, choice.initial]));
  }

  #known(name: string): void {
    if (!this.has(name)) throw new Error(`M2D choices: no choice named '${name}' (declared: ${this.names.join(', ') || 'none'})`);
  }

  #stored(): Record<string, unknown> {
    if (!this.storageKey || typeof localStorage === 'undefined') return {};
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}');
      return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  #store(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    // Every choice, the ones that match today's initial included: a player
    // who picked the default meant it, and the default may change. Another
    // game on this origin may share the key; its names are left alone.
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ ...this.#stored(), ...this.all }));
    } catch {
      // A private window may refuse storage; the choice still holds for this session.
    }
  }
}
