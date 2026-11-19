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

/** Whether two obstacle boxes differ in any field. */
/**
 * Whether the segment a→b, already in a box's own frame, crosses the box
 * of half-extents (hx, hy): a Liang-Barsky clip that only answers yes/no.
 */
function segmentCrossesBox(ax, ay, bx, by, hx, hy) {
  const dx = bx - ax;
  const dy = by - ay;
  let enter = 0;
  let exit = 1;
  for (const [p, q] of [[-dx, ax + hx], [dx, hx - ax], [-dy, ay + hy], [dy, hy - ay]]) {
    if (p === 0) {
      if (q < 0) return false; // parallel and outside this slab
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
    if (enter > exit) return false;
  }
  return true;
}

const movedBox = (a, b) => a.x !== b.x || a.y !== b.y || (a.z ?? 0) !== (b.z ?? 0)
  || a.halfX !== b.halfX || a.halfY !== b.halfY || (a.halfZ ?? 0) !== (b.halfZ ?? 0) || (a.angle ?? 0) !== (b.angle ?? 0);

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
     * `{ kind: 'missing'|'stale'|'undeclared'|'static', agent, message }[]`.
     */
    this.issues = [];
    /**
     * The dynamic obstacles, id to a plain box record: simulation state,
     * carried by `trackState`; the wasm tile caches are derived from it.
     * @type {Map<number, object>}
     */
    this.obstacles = new Map();
    /** The next obstacle id, part of the tracked state. */
    this.nextObstacleId = 1;
    /** The recast module, kept once a scene loads a mesh. */
    this.recast = null;
  }

  /** Whether the obstacle list changed since the caches last converged. */
  #dirty = false;

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
    const recast = await import('recast-navigation');
    const { importNavMesh, NavMeshQuery, QueryFilter, getNavMeshPositionsAndIndices, init } = recast;
    await init();
    this.recast = recast;

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
      const profile = this.agents.get(agentName);
      let navMesh, tileCache = null;
      if (profile.dynamic) {
        const { tileCacheMeshProcess } = await import('./navBake.js');
        const imported = recast.importTileCache(bytes, tileCacheMeshProcess(recast));
        navMesh = imported.navMesh;
        tileCache = imported.tileCache;
      } else {
        ({ navMesh } = importNavMesh(bytes));
      }
      const filter = new QueryFilter();
      for (const { id, cost } of this.areas.costs) filter.setAreaCost(id === 63 ? 0 : id, cost);
      const query = new NavMeshQuery(navMesh);
      const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
      this.meshes.set(agentName, { navMesh, tileCache, query, filter, debug: { positions, indices }, refs: new Map() });
    }

    // The obstacle list is simulation state a snapshot carries; the wasm
    // tile caches are derived from it, so a restore only has to converge
    // them (see #converge). Registered here because a scene load clears
    // tracked state.
    if ([...this.meshes.values()].some((mesh) => mesh.tileCache)) {
      this.game.trackState('nav.obstacles', {
        save: () => ({ next: this.nextObstacleId, list: [...this.obstacles.entries()].map(([id, box]) => [id, { ...box }]) }),
        load: (data) => {
          this.nextObstacleId = data.next;
          this.obstacles = new Map(data.list.map(([id, box]) => [id, { ...box }]));
          this.#converge();
        }
      });
    }
  }

  /**
   * Cut the mesh around a box, for every dynamic agent: a crate dragged
   * across a hall, a gate swung shut. Returns an id for `moveObstacle` and
   * `removeObstacle`; the cut lands before the next tick's constraints
   * run. The box is world units: `{ x, y, halfX, halfY, angle? }` in 2D
   * (`angle` the body's), with `z`, `halfZ` and `y` the height in 3D.
   * On a scene with no dynamic mesh it is reported once and ignored.
   */
  addObstacle(box) {
    if (![...this.meshes.values()].some((mesh) => mesh.tileCache)) {
      if (!this.issues.some((issue) => issue.kind === 'static')) {
        const message = 'an obstacle was added but no nav agent is dynamic (m2d.project.json navAgents.<name>.dynamic); the mesh will not cut';
        this.issues.push({ kind: 'static', agent: null, message });
        console.warn(`M2D nav: ${message}`);
      }
      return 0;
    }
    const id = this.nextObstacleId++;
    this.obstacles.set(id, { ...box });
    this.#dirty = true;
    return id;
  }

  /** Move or resize an obstacle: the old cut heals, the new one lands. */
  moveObstacle(id, box) {
    if (!this.obstacles.has(id)) return;
    this.obstacles.set(id, { ...box });
    this.#dirty = true;
  }

  removeObstacle(id) {
    if (this.obstacles.delete(id)) this.#dirty = true;
  }

  /**
   * Whether a route's corners cross any tracked obstacle's box on the
   * ground plane. The cheap staleness test a walker runs between re-plans:
   * a cart rolls onto the line a route was funnelled along, and the route
   * is stale long before the walker presses against it. The list is plain
   * simulation state, so this is a handful of segment-against-box clips —
   * no query into the wasm, and nothing re-planned unless it says so.
   *
   * @param {{x: number, y: number, z?: number}[]} points - The corners
   *   still ahead, the walker's own position first
   * @returns {boolean}
   */
  routeBlocked(points) {
    if (this.obstacles.size === 0 || points.length < 2) return false;
    const solid = (this.game.options.dimensions ?? 2) === 3;
    const ground = (p) => (solid ? { x: p.x, y: p.z ?? 0 } : { x: p.x, y: p.y });
    for (const box of this.obstacles.values()) {
      const hx = box.halfX;
      const hy = solid ? (box.halfZ ?? box.halfX) : box.halfY;
      const cx = box.x;
      const cy = solid ? (box.z ?? 0) : box.y;
      const c = Math.cos(box.angle ?? 0);
      const s = Math.sin(box.angle ?? 0);
      for (let i = 1; i < points.length; i++) {
        const a = ground(points[i - 1]);
        const b = ground(points[i]);
        // Into the box's frame, then a slab clip against its half-extents.
        const ax = (a.x - cx) * c + (a.y - cy) * s;
        const ay = -(a.x - cx) * s + (a.y - cy) * c;
        const bx = (b.x - cx) * c + (b.y - cy) * s;
        const by = -(b.x - cx) * s + (b.y - cy) * c;
        if (segmentCrossesBox(ax, ay, bx, by, hx, hy)) return true;
      }
    }
    return false;
  }

  /**
   * Bring every dynamic mesh up to date with the obstacle list, fully, so
   * the wasm state is a pure function of it. `M2D.fixedUpdate` calls this
   * before the entities run; with nothing dirty it costs a flag read.
   */
  tick() {
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#converge();
  }

  /** Make each tile cache's obstacles match the list, and rebuild to quiet. */
  #converge() {
    const flat = (this.game.options.dimensions ?? 2) !== 3;
    for (const [agentName, mesh] of this.meshes) {
      if (!mesh.tileCache) continue;
      // In flat 2D the cut spans the mesh's whole height, as a wall does.
      const rise = AGENT_DEFAULTS(this.agents.get(agentName)).height * 4;
      for (const [id, ref] of mesh.refs) {
        if (!this.obstacles.has(id)) {
          mesh.tileCache.removeObstacle(ref.obstacle);
          mesh.refs.delete(id);
        }
      }
      for (const [id, box] of this.obstacles) {
        const stale = mesh.refs.get(id);
        if (stale && !movedBox(stale.box, box)) continue;
        if (stale) {
          mesh.tileCache.removeObstacle(stale.obstacle);
          mesh.refs.delete(id);
        }
        const centre = flat
          ? { x: box.x, y: 0, z: box.y }
          : { x: box.x, y: box.y, z: box.z ?? 0 };
        const half = flat
          ? { x: box.halfX, y: rise, z: box.halfY }
          : { x: box.halfX, y: box.halfY, z: box.halfZ ?? box.halfX };
        const added = mesh.tileCache.addBoxObstacle(centre, half, flat ? -(box.angle ?? 0) : (box.angle ?? 0));
        if (added.success) mesh.refs.set(id, { obstacle: added.obstacle, box: { ...box } });
      }
      // Fully up to date every time: bounded in practice (an update takes
      // up to 64 tiles), and what makes a restore converge to the same mesh.
      for (let i = 0; i < 128; i++) {
        const { upToDate } = mesh.tileCache.update(mesh.navMesh);
        if (upToDate) break;
      }
      const [positions, indices] = this.recast.getNavMeshPositionsAndIndices(mesh.navMesh);
      mesh.debug = { positions, indices };
      mesh.overlayGeometry = null;
    }
  }

  /** Free the wasm-side meshes: their memory is manual. */
  unload() {
    for (const { navMesh, tileCache, query } of this.meshes.values()) {
      query.destroy?.();
      tileCache?.destroy?.();
      navMesh.destroy?.();
    }
    this.meshes.clear();
    this.issues = [];
    this.obstacles.clear();
    this.nextObstacleId = 1;
    this.#dirty = false;
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

    // The goal has to be on the mesh itself, give or take the agent's
    // radius: a click on a wall is refused, not walked to the wall's foot.
    const goal = toNav(to);
    const near = mesh.query.findNearestPoly(goal, { filter: mesh.filter, halfExtents });
    if (!near.success || !near.nearestRef) return null;
    const snapped = near.nearestPoint;
    if (Math.hypot(snapped.x - goal.x, snapped.z - goal.z) > profile.radius) return null;

    const result = mesh.query.computePath(toNav(from), snapped, { filter: mesh.filter, halfExtents });
    if (!result.success || !result.path?.length) return null;

    // Detour answers a blocked goal with its best partial path; a route
    // that gives up short of the goal is no route.
    const last = result.path[result.path.length - 1];
    if (Math.hypot(last.x - snapped.x, last.z - snapped.z) > reach) return null;

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
