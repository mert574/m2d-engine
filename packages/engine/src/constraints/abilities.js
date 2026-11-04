import { Constraint } from '../core/constraint.js';

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
 * `UIAbilityBar` draws a set of these.
 *
 * @param {Object} options
 * @param {Array} options.abilities
 * @param {Function} [options.onCast] - `(ability, ok)`: `ok` false when the
 *   key was pressed on a locked or cooling ability. Bound to the entity
 * @param {() => boolean} [options.canCast] - Extra gate, e.g. not while talking
 */
export class Abilities extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.list = (options.abilities ?? []).map(a => ({ locked: false, remaining: 0, ...a }));
    this.onCast = options.onCast?.bind(entity);
    this.canCast = options.canCast ?? (() => true);
  }

  get(id) {
    return this.list.find(a => a.id === id) ?? null;
  }

  unlock(id) {
    const ability = this.get(id);
    if (ability) ability.locked = false;
  }

  lock(id) {
    const ability = this.get(id);
    if (ability) ability.locked = true;
  }

  /** Cast by id, honouring lock and cooldown. Returns whether it cast. */
  cast(id) {
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

  fixedUpdate(dt) {
    for (const ability of this.list) ability.remaining = Math.max(0, ability.remaining - dt);
    if (this.entity.dead || !this.canCast()) return;
    const input = this.entity.game.input.snapshot;
    for (const ability of this.list) {
      if (ability.key && input.justPressed(ability.key)) this.cast(ability.id);
    }
  }
}
