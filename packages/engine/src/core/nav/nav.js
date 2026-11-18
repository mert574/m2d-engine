/**
 * `game.nav`: one navigation API for the player and NPCs, over the navmesh
 * the editor baked into the scene's assets. The mesh is Recast and Detour
 * through WebAssembly — the same binary in every browser and in Node, so a
 * path is the same bits on a client as on the server — imported only when
 * a scene actually carries one. Queries are stateless reads of the baked
 * mesh: nothing here is simulation state, so snapshots and prediction owe
 * it nothing.
 *
 * The scene declares its meshes in `assets.navmeshes`, one per agent
 * profile the project names in `navAgents`. Each entry carries the bake's
 * stamp; at load the stamp is recomputed from the built level and a stale
 * or missing bake is reported (`issues`, and the console), not trusted.
 *
 * In 2D the mesh lives in flat nav space — world (x, y) on nav (x, z) —
 * and `findPath` speaks world 2D points; in 3D it speaks world metres.
 */

import { NavAreas } from './navAreas.js';
import { navGeometryOf, AGENT_DEFAULTS } from './navGeometry.js';
import { bakeStamp } from './stamp.js';
import { fetchBinary } from './fetchBinary.js';

export class Nav {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {{navAreas?: object, navAgents?: object}} options - The project's declarations.
   */
  constructor(game, { navAreas, navAgents } = {}) {
    this.game = game;
    /** The project's nav areas, name to id and cost. */
    this.areas = new NavAreas(navAreas);
    /** The project's agent profiles, by name. @type {Map<string, object>} */
    this.agents = new Map(Object.entries(navAgents ?? {}));
    /** One loaded mesh per agent profile: `{ navMesh, query, filter, debug }`. @type {Map<string, object>} */
    this.meshes = new Map();
    /**
     * What load found wrong, for the editor's audit and the console:
     * `{ kind: 'missing'|'stale'|'undeclared', agent, message }[]`.
     */
    this.issues = [];
  }

  /** An agent profile by name; unnamed, the only one a query could mean. */
  agent(name) {
    if (name === undefined) {
      if (this.agents.size === 1) return this.agents.keys().next().value;
      throw new Error(`M2D nav: say which agent (m2d.project.json navAgents: ${[...this.agents.keys()].join(', ') || 'none declared'})`);
    }
    if (!this.agents.has(name)) {
      throw new Error(`M2D nav: no nav agent named '${name}' (m2d.project.json navAgents: ${[...this.agents.keys()].join(', ') || 'none declared'})`);
    }
    return name;
  }

  /** Whether a mesh for this agent (or the only agent) is loaded. */
  has(agent) {
    try {
      return this.meshes.has(this.agent(agent));
    } catch {
      return false;
    }
  }

  /**
   * Load the scene's baked meshes and check each against the level as
   * built. A problem is reported, never thrown: a stale mesh still plays,
   * it just plays on yesterday's walls, and the report is how that gets
   * fixed rather than shipped.
   * @param {import('../scene.js').Scene} scene
   */
  async loadScene(scene) {
    this.unload();
    const entries = Object.entries(scene.config.assets?.navmeshes ?? {});
    if (!entries.length) return;
    const { importNavMesh, NavMeshQuery, QueryFilter, getNavMeshPositionsAndIndices, init } = await import('@recast-navigation/core');
    await init();

    const report = (kind, agent, message) => {
      this.issues.push({ kind, agent, message });
      console.warn(`M2D nav: ${message}`);
    };

    for (const [agentName, entry] of entries) {
      if (!this.agents.has(agentName)) {
        report('undeclared', agentName, `scene '${scene.config.name}' has a navmesh for agent '${agentName}', which m2d.project.json does not declare in navAgents`);
        continue;
      }
      let bytes;
      try {
        bytes = await fetchBinary((this.game.options.basePath ?? '') + entry.url);
      } catch (error) {
        report('missing', agentName, `scene '${scene.config.name}' names navmesh '${entry.url}' for agent '${agentName}', which did not load (${error.message}); bake it in the editor`);
        continue;
      }
      const stamp = bakeStamp(navGeometryOf(this.game, this.agents.get(agentName), scene), this.agents.get(agentName), this.areas);
      if (stamp !== entry.stamp) {
        report('stale', agentName, `scene '${scene.config.name}': the navmesh for agent '${agentName}' is stale — the level's colliders, nav volumes or agent no longer match the bake; bake it again in the editor`);
      }
      const { navMesh } = importNavMesh(bytes);
      const filter = new QueryFilter();
      for (const { id, cost } of this.areas.costs) filter.setAreaCost(id === 63 ? 0 : id, cost);
      const query = new NavMeshQuery(navMesh);
      const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
      this.meshes.set(agentName, { navMesh, query, filter, debug: { positions, indices } });
    }
  }

  /** Free the wasm-side meshes: their memory is manual. */
  unload() {
    for (const { navMesh, query } of this.meshes.values()) {
      query.destroy?.();
      navMesh.destroy?.();
    }
    this.meshes.clear();
    this.issues = [];
  }

  /**
   * A viable route from `from` to `to`, or null: unreachable, off the
   * mesh, or longer than `maxLength`. The points are world points — `{x,
   * y}` in 2D, `{x, y, z}` in 3D — from the straightened (funnelled) path,
   * weighed by the nav areas' costs.
   *
   * @param {{x: number, y: number, z?: number}} from
   * @param {{x: number, y: number, z?: number}} to
   * @param {{agent?: string, maxLength?: number}} [options]
   * @returns {{points: object[], length: number}|null}
   */
  findPath(from, to, { agent, maxLength } = {}) {
    const name = this.agent(agent);
    const mesh = this.meshes.get(name);
    if (!mesh) return null;
    const profile = AGENT_DEFAULTS(this.agents.get(name));
    const flat = (this.game.options.dimensions ?? 2) !== 3;
    const toNav = (p) => (flat ? { x: p.x, y: 0, z: p.y } : { x: p.x, y: p.y, z: p.z ?? 0 });
    const fromNav = (v) => (flat ? { x: v.x, y: v.z } : { x: v.x, y: v.y, z: v.z });
    const reach = profile.radius * 4;
    const halfExtents = { x: reach, y: Math.max(profile.height * 4, reach), z: reach };

    const result = mesh.query.computePath(toNav(from), toNav(to), { filter: mesh.filter, halfExtents });
    if (!result.success || !result.path?.length) return null;

    // Detour answers a blocked goal with its best partial path; a route
    // that gives up short of the goal is no route.
    const goal = toNav(to);
    const last = result.path[result.path.length - 1];
    if (Math.hypot(last.x - goal.x, last.z - goal.z) > reach) return null;

    const points = result.path.map(fromNav);
    let length = 0;
    for (let i = 1; i < result.path.length; i++) {
      const a = result.path[i - 1], b = result.path[i];
      length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    if (maxLength !== undefined && length > maxLength) return null;
    return { points, length };
  }

  /**
   * The nearest point on the mesh to a world point, or null off it: where
   * a click beside a wall actually means, and whether a spot is walkable
   * at all.
   * @param {{x: number, y: number, z?: number}} point
   * @param {{agent?: string}} [options]
   */
  nearestPoint(point, { agent } = {}) {
    const name = this.agent(agent);
    const mesh = this.meshes.get(name);
    if (!mesh) return null;
    const profile = AGENT_DEFAULTS(this.agents.get(name));
    const flat = (this.game.options.dimensions ?? 2) !== 3;
    const nav = flat ? { x: point.x, y: 0, z: point.y } : { x: point.x, y: point.y, z: point.z ?? 0 };
    const reach = profile.radius * 4;
    const result = mesh.query.findNearestPoly(nav, {
      filter: mesh.filter,
      halfExtents: { x: reach, y: Math.max(profile.height * 4, reach), z: reach }
    });
    if (!result.success || !result.nearestRef) return null;
    const p = result.nearestPoint;
    return flat ? { x: p.x, y: p.z } : { x: p.x, y: p.y, z: p.z };
  }
}
