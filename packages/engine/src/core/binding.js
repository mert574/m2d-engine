/**
 * A scene's reading of a value in play: a constraint's fields on an
 * object, as a HUD meter or a post binding names them in scene data
 * (`{ object, constraint, current, max, ratio }`).
 *
 * The player's health by default. An empty `constraint` reads the
 * entity's own fields; `ratio` names one field already between 0 and 1
 * (a cooldown's charge) and wins over `current` and `max`.
 */

/** The entity a binding names: an object id, or the player for `'player'`. */
export function boundEntity(scene, id) {
  if (id === 'player' || id === undefined) return scene.game.player ?? null;
  return scene.entitiesById.get(id) ?? null;
}

/**
 * What a binding reads now: `{ current, max }`, a bare `current` when the
 * source has no max, or null when there is nothing to read (the object is
 * gone, the slot is empty).
 * @returns {{current: number, max: number}|number|null}
 */
export function readBinding(scene, bind = {}) {
  const entity = boundEntity(scene, bind.object);
  if (!entity || entity.dead) return null;
  const slot = bind.constraint ?? 'health';
  const source = slot ? entity.getConstraint?.(slot) : entity;
  if (!source) return null;
  if (bind.ratio) {
    const ratio = source[bind.ratio];
    return typeof ratio === 'number' ? { current: ratio, max: 1 } : null;
  }
  const current = source[bind.current ?? 'currentHealth'];
  const max = source[bind.max ?? 'maxHealth'];
  if (typeof current !== 'number') return null;
  return typeof max === 'number' ? { current, max } : current;
}

/** A binding's reading as a fraction between 0 and 1, or null. */
export function bindingRatio(scene, bind) {
  const value = readBinding(scene, bind);
  if (value === null || typeof value === 'number') return null;
  if (!(value.max > 0)) return null;
  return Math.max(0, Math.min(1, value.current / value.max));
}
