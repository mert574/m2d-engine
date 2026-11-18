/**
 * The project's nav areas: named by the game, resolved to the area ids the
 * navmesh is marked and queried with. `m2d.project.json` declares
 * `navAreas`, a record of names to `{ cost }`; the engine owns two of its
 * own — `walkable` (the ground itself, cost 1) and `blocked` (never
 * crossed) — so a project only declares the costly ones: mud, shallow
 * water, a road an NPC prefers. A `NavVolume` paints an area over the
 * ground it covers; the bake marks the polygons under it, and `findPath`
 * weighs them by their declared cost.
 *
 * Underneath, an area is a Recast area id: `walkable` is Recast's own
 * (63), `blocked` is 0 (not walkable at all), and each declared area takes
 * the next id from 1. The ids are stable in declaration order, which is
 * why the record's order matters the way `layers`' does.
 */

/** Recast's walkable area id: what ground is unless something marks it. */
export const WALKABLE_AREA = 63;
/** Recast's null area: what nothing may cross. */
export const BLOCKED_AREA = 0;

export class NavAreas {
  /** @param {Record<string, {cost?: number}>} [areas] - The project's `navAreas`. */
  constructor(areas = {}) {
    /** @type {Map<string, {id: number, cost: number}>} name to its id and cost. */
    this.areas = new Map([
      ['walkable', { id: WALKABLE_AREA, cost: 1 }],
      ['blocked', { id: BLOCKED_AREA, cost: Infinity }]
    ]);
    let id = 1;
    for (const [name, area] of Object.entries(areas)) {
      if (name === 'walkable' || name === 'blocked') {
        throw new Error(`M2D: '${name}' is the engine's own nav area and cannot be declared`);
      }
      if (id >= WALKABLE_AREA) throw new Error(`M2D: a project may declare at most ${WALKABLE_AREA - 1} nav areas`);
      this.areas.set(name, { id: id++, cost: area?.cost ?? 1 });
    }
  }

  /** The declared names, the engine's own first. */
  get names() {
    return [...this.areas.keys()];
  }

  /** An area's id, for marking and filtering. */
  id(name) {
    const area = this.areas.get(name);
    if (!area) {
      throw new Error(`M2D: no nav area named '${name}' (m2d.project.json navAreas: ${this.names.join(', ')})`);
    }
    return area.id;
  }

  /** Every area's traversal cost by id, for a query filter. */
  get costs() {
    return [...this.areas.values()].filter((area) => area.id !== BLOCKED_AREA).map(({ id, cost }) => ({ id, cost }));
  }

  /** What the stamp hashes: the names, ids and costs, in declaration order. */
  get spec() {
    return [...this.areas.entries()].map(([name, { id, cost }]) => [name, id, cost === Infinity ? 'inf' : cost]);
  }
}
