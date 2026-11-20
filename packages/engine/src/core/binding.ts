/**
 * A scene's reading of a value in play: a constraint's fields on an
 * object, as a HUD meter or a post binding names them in scene data
 * (`{ object, constraint, current, max, ratio }`).
 *
 * The player's health by default. An empty `constraint` reads the
 * entity's own fields; `ratio` names one field already between 0 and 1
 * (a cooldown's charge) and wins over `current` and `max`.
 */

/** A binding as scene data writes it. */
export interface Binding {
  /** An object id, or `'player'` (the default) for the player. */
  object?: string;
  /** The constraint whose fields are read; `''` reads the entity's own. */
  constraint?: string;
  current?: string;
  max?: string;
  ratio?: string;
}

/** What a binding reads from: an entity or a constraint, fields by name. `scene.js` is still JavaScript. */
interface BoundSource {
  [field: string]: unknown;
}

/** The entity a binding reads, as this module touches it. */
interface BoundEntity extends BoundSource {
  dead?: unknown;
  getConstraint?: (slot: string) => BoundSource | null | undefined;
}

/** The scene a binding resolves against, as this module touches it. */
interface BindingScene {
  game: { player?: BoundEntity | null };
  entitiesById: Map<string, BoundEntity>;
}

/** The entity a binding names: an object id, or the player for `'player'`. */
export function boundEntity(scene: BindingScene, id?: string): BoundEntity | null {
  if (id === 'player' || id === undefined) return scene.game.player ?? null;
  return scene.entitiesById.get(id) ?? null;
}

/**
 * What a binding reads now: `{ current, max }`, a bare `current` when the
 * source has no max, or null when there is nothing to read (the object is
 * gone, the slot is empty).
 */
export function readBinding(scene: BindingScene, bind: Binding = {}): { current: number; max: number } | number | null {
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
export function bindingRatio(scene: BindingScene, bind: Binding): number | null {
  const value = readBinding(scene, bind);
  if (value === null || typeof value === 'number') return null;
  if (!(value.max > 0)) return null;
  return Math.max(0, Math.min(1, value.current / value.max));
}
