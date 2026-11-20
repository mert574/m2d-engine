/**
 * Named input actions, as `game.actions`: what a key *means* to the game
 * (`menu`, `jump`, `interact`) rather than which key it is.
 *
 * A project declares them (`input.actions` in `m2d.project.json`, or the
 * `actions` option): each name to the physical key codes that perform it.
 * Rules fire on one (`{ event: 'action', action: 'menu' }`), code reads
 * one from a tick's snapshot, and the settings menu lists them so the
 * player can rebind them. A rebinding is the player's, kept in local
 * storage under the game's `storageKey`, and never written back to the
 * project.
 *
 * Reading goes through a snapshot, never the live keyboard, so what an
 * action did is part of the recorded input and a replay sees the same
 * thing. An `action` rule reads the local player's snapshot, so it is a
 * single-player rule; online, a player's request of the world is an intent.
 */
/** The snapshot members an action read needs. */
interface ActionSnapshot {
  justPressed(code: string): boolean;
  isDown(code: string): boolean;
}

export class InputActions {
  /** The project's own bindings, which `reset` returns to. */
  declared: Record<string, string[]>;
  /** Where the player's bindings are kept; null keeps none. */
  storageKey: string | null;
  bindings: Map<string, string[]>;
  /** The action a settings row is waiting to rebind, or null. */
  listening: string | null;

  /** `declared` maps action names to key codes. */
  constructor(declared: Record<string, string[]> = {}, { storageKey = null }: { storageKey?: string | null } = {}) {
    this.declared = Object.fromEntries(Object.entries(declared).map(([name, codes]) => [name, [...codes]]));
    this.storageKey = storageKey;
    this.bindings = new Map(Object.entries(this.declared).map(([name, codes]) => [name, [...codes]]));
    for (const [name, codes] of Object.entries(this.#stored())) {
      if (this.bindings.has(name) && Array.isArray(codes)) this.bindings.set(name, (codes as unknown[]).filter((code): code is string => typeof code === 'string'));
    }
    this.listening = null;
  }

  /** Every action's name, in declaration order. */
  get names(): string[] {
    return [...this.bindings.keys()];
  }

  has(name: string): boolean {
    return this.bindings.has(name);
  }

  /** The key codes that perform an action; empty for one not declared. */
  codes(name: string): string[] {
    return this.bindings.get(name) ?? [];
  }

  /** Whether an action's key went down at this tick, on a tick's snapshot. */
  pressed(name: string, snapshot: ActionSnapshot | null | undefined): boolean {
    return this.codes(name).some((code) => snapshot?.justPressed(code));
  }

  /** Whether one of an action's keys was held at this tick. */
  down(name: string, snapshot: ActionSnapshot | null | undefined): boolean {
    return this.codes(name).some((code) => snapshot?.isDown(code));
  }

  /** Bind an action to new keys (the player's choice), and keep it. */
  rebind(name: string, codes: string[]): void {
    if (!this.bindings.has(name)) throw new Error(`M2D actions: no action named '${name}' (declared: ${this.names.join(', ') || 'none'})`);
    this.bindings.set(name, [...codes]);
    this.#store();
  }

  /** Every action back to the project's keys. */
  reset(): void {
    for (const [name, codes] of Object.entries(this.declared)) this.bindings.set(name, [...codes]);
    this.#store();
  }

  /** The player's bindings, as stored. */
  #stored(): Record<string, unknown> {
    if (!this.storageKey || typeof localStorage === 'undefined') return {};
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  #store(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    const changed = Object.fromEntries([...this.bindings].filter(([name, codes]) => codes.join() !== (this.declared[name] ?? []).join()));
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(changed));
    } catch {
      // A private window may refuse storage; the binding still holds for this session.
    }
  }
}

/** A key code as a player reads it: `KeyE` as E, `ArrowUp` as ↑. */
export function keyLabel(code: string): string {
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code]!;
  return code.replace(/^Key|^Digit/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
}
