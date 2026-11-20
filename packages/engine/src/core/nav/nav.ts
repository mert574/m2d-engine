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

import { NavAreas } from './navAreas.ts';
import { navGeometryOf, AGENT_DEFAULTS } from './navGeometry.ts';
import { bakeStamp } from './stamp.ts';
import type { NavAgent } from './stamp.ts';
import { fetchBinary } from './fetchBinary.ts';
import type { M2D } from '../m2d.js';

/** A point either dimension's world hands around. */
interface Point3ish { x: number; y: number; z?: number }

/** A nav-space vector, as Detour speaks it. */
interface NavVec { x: number; y: number; z: number }

/**
 * The recast/Detour members the queries touch. The package's own types do
 * not resolve under nodenext (see navBake.ts), so the calls made here are
 * declared, not the engine described.
 */
interface MeshQuery {
  destroy?(): void;
  findNearestPoly(point: NavVec, options: { filter: unknown; halfExtents: NavVec }): { success: boolean; nearestRef: number; nearestPoint: NavVec };
  computePath(from: NavVec, to: NavVec, options: { filter: unknown; halfExtents: NavVec }): { success: boolean; path?: NavVec[] };
}
interface TileCacheLike {
  destroy?(): void;
  addBoxObstacle(centre: NavVec, half: NavVec, angle: number): { success: boolean; obstacle: unknown };
  removeObstacle(obstacle: unknown): void;
  update(navMesh: unknown): { upToDate: boolean };
}
interface RecastRuntime {
  init(): Promise<void>;
  importNavMesh(bytes: Uint8Array): { navMesh: NavMeshLike };
  importTileCache(bytes: Uint8Array, process: unknown): { navMesh: NavMeshLike; tileCache: TileCacheLike };
  NavMeshQuery: new (mesh: NavMeshLike) => MeshQuery;
  QueryFilter: new () => { setAreaCost(id: number, cost: number): void };
  getNavMeshPositionsAndIndices(mesh: NavMeshLike): [number[], number[]];
}
interface NavMeshLike { destroy?(): void }

/** One loaded mesh and everything a query needs around it. */
interface LoadedMesh {
  navMesh: NavMeshLike;
  tileCache: TileCacheLike | null;
  query: MeshQuery;
  filter: unknown;
  debug: { positions: number[]; indices: number[] };
  refs: Map<number, { obstacle: unknown; box: ObstacleBox }>;
  overlayGeometry?: unknown;
}

/** A tracked obstacle box, in world terms. */
interface ObstacleBox {
  x: number;
  y: number;
  z?: number;
  halfX: number;
  halfY?: number;
  halfZ?: number;
  angle?: number;
}

/** Whether two obstacle boxes differ in any field. */
/**
 * Whether the segment a→b, already in a box's own frame, crosses the box
 * of half-extents (hx, hy): a Liang-Barsky clip that only answers yes/no.
 */
function segmentCrossesBox(ax: number, ay: number, bx: number, by: number, hx: number, hy: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let enter = 0;
  let exit = 1;
  for (const [p, q] of [[-dx, ax + hx], [dx, hx - ax], [-dy, ay + hy], [dy, hy - ay]] as [number, number][]) {
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

const movedBox = (a: ObstacleBox, b: ObstacleBox) => a.x !== b.x || a.y !== b.y || (a.z ?? 0) !== (b.z ?? 0)
  || a.halfX !== b.halfX || a.halfY !== b.halfY || (a.halfZ ?? 0) !== (b.halfZ ?? 0) || (a.angle ?? 0) !== (b.angle ?? 0);

export class Nav {
  game: M2D;
  /** The project's nav areas, name to id and cost. */
  areas: NavAreas;
  /** The project's agent profiles, by name. */
  agents: Map<string, NavAgent>;
  /** One loaded mesh per agent profile. */
  meshes: Map<string, LoadedMesh>;
  /** What load found wrong, for the editor's audit and the console. */
  issues: { kind: 'missing' | 'stale' | 'undeclared' | 'static'; agent: string | null; message: string }[];
  /**
   * The dynamic obstacles, id to a plain box record: simulation state,
   * carried by `trackState`; the wasm tile caches are derived from it.
   */
  obstacles: Map<number, ObstacleBox>;
  /** The next obstacle id, part of the tracked state. */
  nextObstacleId: number;
  /** The recast module, kept once a scene loads a mesh. */
  recast: RecastRuntime | null;

  /** `options` are the project's declarations. */
  constructor(game: M2D, { navAreas, navAgents }: { navAreas?: Record<string, { cost?: number }>; navAgents?: Record<string, NavAgent> } = {}) {
    this.game = game;
    this.areas = new NavAreas(navAreas);
    this.agents = new Map(Object.entries(navAgents ?? {}));
    this.meshes = new Map();
    this.issues = [];
    this.obstacles = new Map();
    this.nextObstacleId = 1;
    this.recast = null;
  }

  /** Whether the obstacle list changed since the caches last converged. */
  #dirty = false;

  /** An agent profile by name; unnamed, the only one a query could mean. */
  agent(name?: string): string {
    if (name === undefined) {
      if (this.agents.size === 1) return this.agents.keys().next().value!;
      throw new Error(`M2D nav: say which agent (m2d.project.json navAgents: ${[...this.agents.keys()].join(', ') || 'none declared'})`);
    }
    if (!this.agents.has(name)) {
      throw new Error(`M2D nav: no nav agent named '${name}' (m2d.project.json navAgents: ${[...this.agents.keys()].join(', ') || 'none declared'})`);
    }
    return name;
  }

  /** Whether a mesh for this agent (or the only agent) is loaded. */
  has(agent?: string): boolean {
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
   */
  async loadScene(scene: { config: { name?: string; assets?: { navmeshes?: Record<string, { url: string; stamp?: string }> } } }): Promise<void> {
    this.unload();
    const entries = Object.entries(scene.config.assets?.navmeshes ?? {});
    if (!entries.length) return;
    const recast = await (import('recast-navigation') as Promise<unknown> as Promise<RecastRuntime>);
    const { importNavMesh, NavMeshQuery, QueryFilter, getNavMeshPositionsAndIndices, init } = recast;
    await init();
    this.recast = recast;

    const report = (kind: 'missing' | 'stale' | 'undeclared', agent: string, message: string) => {
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
        bytes = await fetchBinary(((this.game.options as { basePath?: string }).basePath ?? '') + entry.url);
      } catch (error) {
        report('missing', agentName, `scene '${scene.config.name}' names navmesh '${entry.url}' for agent '${agentName}', which did not load (${(error as Error).message}); bake it in the editor`);
        continue;
      }
      const agentProfile = this.agents.get(agentName)!;
      const stamp = bakeStamp(navGeometryOf(this.game, agentProfile, scene as never), agentProfile, this.areas);
      if (stamp !== entry.stamp) {
        report('stale', agentName, `scene '${scene.config.name}': the navmesh for agent '${agentName}' is stale — the level's colliders, nav volumes or agent no longer match the bake; bake it again in the editor`);
      }
      const profile = this.agents.get(agentName)!;
      let navMesh: NavMeshLike, tileCache: TileCacheLike | null = null;
      if (profile.dynamic) {
        const { tileCacheMeshProcess } = await import('./navBake.ts');
        const imported = recast.importTileCache(bytes, tileCacheMeshProcess(recast as never));
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
        save: () => ({ next: this.nextObstacleId, list: [...this.obstacles.entries()].map(([id, box]) => [id, { ...box }] as [number, ObstacleBox]) }),
        load: (data: { next: number; list: [number, ObstacleBox][] }) => {
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
  addObstacle(box: ObstacleBox): number {
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
  moveObstacle(id: number, box: ObstacleBox): void {
    if (!this.obstacles.has(id)) return;
    this.obstacles.set(id, { ...box });
    this.#dirty = true;
  }

  removeObstacle(id: number): void {
    if (this.obstacles.delete(id)) this.#dirty = true;
  }

  /**
   * Whether a route's corners cross any tracked obstacle's box on the
   * ground plane. The cheap staleness test a walker runs between re-plans:
   * a cart rolls onto the line a route was funnelled along, and the route
   * is stale long before the walker presses against it. The list is plain
   * simulation state, so this is a handful of segment-against-box clips,
   * with no query into the wasm.
   *
   * `points` are the corners still ahead, the walker's own position first.
   */
  routeBlocked(points: Point3ish[]): boolean {
    if (this.obstacles.size === 0 || points.length < 2) return false;
    const solid = ((this.game.options as { dimensions?: number }).dimensions ?? 2) === 3;
    const ground = (p: Point3ish) => (solid ? { x: p.x, y: p.z ?? 0 } : { x: p.x, y: p.y });
    for (const box of this.obstacles.values()) {
      const hx = box.halfX;
      const hy = solid ? (box.halfZ ?? box.halfX) : box.halfY!;
      const cx = box.x;
      const cy = solid ? (box.z ?? 0) : box.y;
      const c = Math.cos(box.angle ?? 0);
      const s = Math.sin(box.angle ?? 0);
      for (let i = 1; i < points.length; i++) {
        const a = ground(points[i - 1]!);
        const b = ground(points[i]!);
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
  tick(): void {
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#converge();
  }

  /** Make each tile cache's obstacles match the list, and rebuild to quiet. */
  #converge(): void {
    const flat = ((this.game.options as { dimensions?: number }).dimensions ?? 2) !== 3;
    for (const [agentName, mesh] of this.meshes) {
      if (!mesh.tileCache) continue;
      // In flat 2D the cut spans the mesh's whole height, as a wall does.
      const rise = AGENT_DEFAULTS(this.agents.get(agentName)!).height * 4;
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
          ? { x: box.halfX, y: rise, z: box.halfY! }
          : { x: box.halfX, y: box.halfY!, z: box.halfZ ?? box.halfX };
        const added = mesh.tileCache.addBoxObstacle(centre, half, flat ? -(box.angle ?? 0) : (box.angle ?? 0));
        if (added.success) mesh.refs.set(id, { obstacle: added.obstacle, box: { ...box } });
      }
      // Fully up to date every time: bounded in practice (an update takes
      // up to 64 tiles), and what makes a restore converge to the same mesh.
      for (let i = 0; i < 128; i++) {
        const { upToDate } = mesh.tileCache.update(mesh.navMesh);
        if (upToDate) break;
      }
      const [positions, indices] = this.recast!.getNavMeshPositionsAndIndices(mesh.navMesh);
      mesh.debug = { positions, indices };
      mesh.overlayGeometry = null;
    }
  }

  /** Free the wasm-side meshes: their memory is manual. */
  unload(): void {
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
   */
  findPath(from: Point3ish, to: Point3ish, { agent, maxLength }: { agent?: string; maxLength?: number } = {}): { points: Point3ish[]; length: number } | null {
    const name = this.agent(agent);
    const mesh = this.meshes.get(name);
    if (!mesh) return null;
    const profile = AGENT_DEFAULTS(this.agents.get(name)!);
    const flat = ((this.game.options as { dimensions?: number }).dimensions ?? 2) !== 3;
    const toNav = (p: Point3ish): NavVec => (flat ? { x: p.x, y: 0, z: p.y } : { x: p.x, y: p.y, z: p.z ?? 0 });
    const fromNav = (v: NavVec): Point3ish => (flat ? { x: v.x, y: v.z } : { x: v.x, y: v.y, z: v.z });
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
    const last = result.path![result.path!.length - 1]!;
    if (Math.hypot(last.x - snapped.x, last.z - snapped.z) > reach) return null;

    const points = result.path!.map(fromNav);
    let length = 0;
    for (let i = 1; i < result.path!.length; i++) {
      const a = result.path![i - 1]!, b = result.path![i]!;
      length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    if (maxLength !== undefined && length > maxLength) return null;
    return { points, length };
  }

  /**
   * The nearest point on the mesh to a world point, or null off it: where
   * a click beside a wall actually means, and whether a spot is walkable
   * at all.
   */
  nearestPoint(point: Point3ish, { agent }: { agent?: string } = {}): Point3ish | null {
    const name = this.agent(agent);
    const mesh = this.meshes.get(name);
    if (!mesh) return null;
    const profile = AGENT_DEFAULTS(this.agents.get(name)!);
    const flat = ((this.game.options as { dimensions?: number }).dimensions ?? 2) !== 3;
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
