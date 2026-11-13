/**
 * A level's counters — `world.counters` — by name.
 *
 * Two kinds. A plain counter starts at its `initial` and changes only
 * when a rule says so (`{ do: 'count', counter, add }`): a score, keys
 * found. A tally names a prefab and is read off the world each time it is
 * asked: how many of its objects the scene `placed`, how many are
 * `remaining`, or how many are gone (`taken`, the default). A tally keeps
 * no state, so it cannot drift from what is there, and it reads the same
 * on a client as on the server that removed the objects.
 *
 * Simulation state (rules fire on counters), so it is made headless too,
 * and snapshots carry the plain counters' values. The HUD shows one as
 * `{name}` in a text. Online, a client sees tallies change (they read the
 * world it is sent) but its plain counters stay at their `initial`: the
 * rules that count run on the server, and counters are not replicated.
 */
export class SceneCounters {
  /**
   * @param {import('./scene.js').Scene} scene
   * @param {Record<string, {initial?: number, prefab?: string, count?: string}>} [declared]
   */
  constructor(scene, declared = {}) {
    this.scene = scene;
    this.declared = declared;
    /** Plain counters' values. @type {Map<string, number>} */
    this.values = new Map();
    /** How many objects of each tallied prefab the scene placed. @type {Map<string, number>} */
    this.placed = new Map();
    for (const [name, counter] of Object.entries(declared)) {
      if (counter.prefab === undefined) this.values.set(name, counter.initial ?? 0);
      else if (!this.placed.has(counter.prefab)) this.placed.set(counter.prefab, placedCount(scene.config, counter.prefab));
    }
  }

  /** Whether a counter of this name is declared. */
  has(name) {
    return name in this.declared;
  }

  /** A counter's value now; 0 for one that is not declared. */
  get(name) {
    const counter = this.declared[name];
    if (!counter) return 0;
    if (counter.prefab === undefined) return this.values.get(name) ?? 0;
    const placed = this.placed.get(counter.prefab) ?? 0;
    if (counter.count === 'placed') return placed;
    const remaining = this.#remaining(counter.prefab);
    return counter.count === 'remaining' ? remaining : placed - remaining;
  }

  /** Set a plain counter. A tally is the world's to say and is left alone. */
  set(name, value) {
    if (this.declared[name] && this.declared[name].prefab === undefined) this.values.set(name, value);
  }

  add(name, amount) {
    this.set(name, this.get(name) + amount);
  }

  /** Every counter's value, by name: what a HUD template reads. */
  snapshot() {
    return Object.fromEntries(Object.keys(this.declared).map((name) => [name, this.get(name)]));
  }

  #remaining(prefab) {
    let left = 0;
    for (const entity of this.scene.game.entities) {
      if (entity.prefab === prefab && !entity.dead) left++;
    }
    return left;
  }
}

/** How many objects of a prefab a loaded scene places. */
function placedCount(config, prefab) {
  let count = 0;
  for (const layer of config.layers ?? []) {
    for (const object of layer.objects ?? []) if (object.prefab === prefab) count++;
  }
  return count;
}

/**
 * A text with `{name}` holes filled from the counters; the text itself
 * when it has none. A name with no counter shows as written, so a typo
 * is visible on screen rather than silently zero.
 */
export function fillTemplate(text, counters) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  return text.replace(/\{([A-Za-z0-9_.-]+)\}/g, (hole, name) => (counters?.has(name) ? String(counters.get(name)) : hole));
}
