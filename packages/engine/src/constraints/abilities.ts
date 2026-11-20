import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';

/** One ability on a key; see the class doc. */
export interface Ability {
  id: string;
  /** A physical code (`'Digit1'`). */
  key?: string;
  /** Seconds. */
  cooldown?: number;
  cast?: (entity: Entity, ability: Ability) => void;
  /** Whether the game has yet to grant it. */
  locked: boolean;
  /** Seconds of cooldown left. */
  remaining: number;
  label?: string;
  icon?: string;
  color?: string;
}

/**
 * A set of abilities on keys, with cooldowns and locks.
 *
 * Each ability is `{ id, key, cooldown, cast, locked, label, icon, color }`:
 * `key` a physical code (`'Digit1'`), `cooldown` in seconds, `cast(entity,
 * ability)` what happens, `locked` whether the game has granted it yet.
 * The constraint reads the tick's input snapshot, so a cast is part of the
 * simulation and a replay casts the same spells at the same ticks; what a
 * cast looks like is the game's business, usually a flash the cast pushes
 * onto a list the entity draws.
 *
 * `UIAbilityBar` draws a set of these. `onCast(ability, ok)` gets `ok`
 * false when the key was pressed on a locked or cooling ability, and is
 * bound to the entity; `canCast` is an extra gate (e.g. not while talking).
 */
export class Abilities extends Constraint {
  static override description = 'A set of abilities on keys, each with a cooldown; the actor adds them in code';
  // Each ability carries a `cast` function, so a set of them is code,
  // not data, and cannot come from a scene file.
  static override params = {};

  list: Ability[];
  onCast: ((ability: Ability, ok: boolean) => void) | undefined;
  canCast: () => boolean;
  /** Replicated cooldown-and-lock pairs; see `replicaState`. */
  declare slots: [number, boolean][];

  constructor(entity: Entity, options: {
    abilities?: (Omit<Ability, 'locked' | 'remaining'> & { locked?: boolean; remaining?: number })[];
    onCast?: (ability: Ability, ok: boolean) => void;
    canCast?: () => boolean;
  } = {}) {
    super(entity);
    this.list = (options.abilities ?? []).map(a => ({ locked: false, remaining: 0, ...a }));
    this.onCast = options.onCast?.bind(entity);
    this.canCast = options.canCast ?? (() => true);
  }

  get(id: string): Ability | null {
    return this.list.find(a => a.id === id) ?? null;
  }

  unlock(id: string): void {
    const ability = this.get(id);
    if (ability) ability.locked = false;
  }

  lock(id: string): void {
    const ability = this.get(id);
    if (ability) ability.locked = true;
  }

  /** Cast by id, honouring lock and cooldown. Returns whether it cast. */
  cast(id: string): boolean {
    const ability = this.get(id);
    if (!ability) return false;
    if (ability.locked || ability.remaining > 0) {
      this.onCast?.(ability, false);
      return false;
    }
    ability.remaining = ability.cooldown ?? 0;
    ability.cast?.(this.entity, ability);
    this.onCast?.(ability, true);
    return true;
  }

  /**
   * What a client needs to draw the ability bar: each ability's cooldown
   * and lock. The abilities themselves (their `cast`) are code, not data.
   */
  replicaState(): { slots: [number, boolean][] } {
    return { slots: this.list.map((a): [number, boolean] => [Math.round(a.remaining * 100) / 100, a.locked]) };
  }

  replicaUpdated(changed: Set<string>): void {
    if (!changed.has('slots')) return;
    this.slots.forEach(([remaining, locked], i) => {
      const ability = this.list[i];
      if (!ability) return;
      ability.remaining = remaining;
      ability.locked = locked;
    });
  }

  override fixedUpdate(dt: number): void {
    for (const ability of this.list) ability.remaining = Math.max(0, ability.remaining - dt);
    if (this.entity.dead || !this.canCast()) return;
    const input = this.entity.input;
    for (const ability of this.list) {
      if (ability.key && input.justPressed(ability.key)) this.cast(ability.id);
    }
  }
}
