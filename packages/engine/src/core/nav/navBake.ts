/**
 * The navmesh bake: the Recast pipeline over `navGeometryOf`'s triangles,
 * one run per agent profile, giving the Detour binary a scene asset holds.
 * It follows upstream's solo pipeline (@recast-navigation/generators, MIT)
 * with one addition it has no hook for: after erosion, each nav volume
 * marks its box of the compact heightfield with its area id, so a costly
 * area's polygons keep that id into the poly mesh and `findPath` can weigh
 * them. `blocked` volumes were already baked in as solid geometry.
 *
 * Runs wherever the engine runs — the editor's host bakes through it, and
 * a test bakes headless in Node — but is only imported on demand: the
 * recast WebAssembly is nothing a game pays for unless it navigates.
 */

import { WALKABLE_AREA } from './navAreas.ts';
import type { NavAreas } from './navAreas.ts';
import { AGENT_DEFAULTS } from './navGeometry.ts';
import type { BakeGeometry } from './navGeometry.ts';
import { bakeStamp } from './stamp.ts';
import type { NavAgent } from './stamp.ts';

/**
 * The recast members this bake touches. The package ships its own types,
 * but they do not resolve under nodenext (`"type": "module"` with
 * extensionless internal re-exports), so — like the vendored transcoder —
 * the handful of calls made here are declared, not the engine described.
 */
interface RecastHandle { destroy(): void }
interface RecastArray extends RecastHandle { copy(values: number[]): void; resize(n: number): void }
interface RcConfig {
  cs: number; ch: number; width: number; height: number;
  walkableRadius: number; walkableHeight: number; walkableClimb: number; walkableSlopeAngle: number;
  borderSize: number; tileSize: number; maxEdgeLen: number; maxSimplificationError: number;
  minRegionArea: number; mergeRegionArea: number; maxVertsPerPoly: number;
  detailSampleDist: number; detailSampleMaxError: number;
}
interface PolyMesh extends RecastHandle {
  npolys(): number;
  areas(i: number): number;
  setAreas(i: number, area: number): void;
  setFlags(i: number, flags: number): void;
}
interface NavMeshHandle extends RecastHandle {
  initSolo(data: unknown): boolean;
}
type Vec3Array = [number, number, number];
interface Recast {
  init(): Promise<void>;
  createRcConfig(partial: Record<string, number>): RcConfig;
  calcGridSize(min: Vec3Array, max: Vec3Array, cs: number): { width: number; height: number };
  RecastBuildContext: new () => RecastHandle;
  VerticesArray: new () => RecastArray;
  TrianglesArray: new () => RecastArray;
  TriangleAreasArray: new () => RecastArray;
  allocHeightfield(): RecastHandle;
  freeHeightfield(h: RecastHandle): void;
  createHeightfield(context: RecastHandle, heightfield: RecastHandle, width: number, height: number, min: Vec3Array, max: Vec3Array, cs: number, ch: number): boolean;
  markWalkableTriangles(context: RecastHandle, slope: number, verts: RecastArray, nv: number, tris: RecastArray, nt: number, areas: RecastArray): void;
  rasterizeTriangles(context: RecastHandle, verts: RecastArray, nv: number, tris: RecastArray, areas: RecastArray, nt: number, heightfield: RecastHandle, climb: number): boolean;
  filterLowHangingWalkableObstacles(context: RecastHandle, climb: number, heightfield: RecastHandle): void;
  filterLedgeSpans(context: RecastHandle, height: number, climb: number, heightfield: RecastHandle): void;
  filterWalkableLowHeightSpans(context: RecastHandle, height: number, heightfield: RecastHandle): void;
  allocCompactHeightfield(): RecastHandle;
  freeCompactHeightfield(h: RecastHandle): void;
  buildCompactHeightfield(context: RecastHandle, height: number, climb: number, heightfield: RecastHandle, compact: RecastHandle): boolean;
  erodeWalkableArea(context: RecastHandle, radius: number, compact: RecastHandle): boolean;
  markBoxArea(context: RecastHandle, min: number[], max: number[], area: number, compact: RecastHandle): void;
  buildDistanceField(context: RecastHandle, compact: RecastHandle): boolean;
  buildRegions(context: RecastHandle, compact: RecastHandle, border: number, minArea: number, mergeArea: number): boolean;
  allocContourSet(): RecastHandle;
  freeContourSet(c: RecastHandle): void;
  buildContours(context: RecastHandle, compact: RecastHandle, maxError: number, maxEdgeLen: number, contours: RecastHandle, flags: number): boolean;
  allocPolyMesh(): PolyMesh;
  freePolyMesh(p: PolyMesh): void;
  buildPolyMesh(context: RecastHandle, contours: RecastHandle, nvp: number, polyMesh: PolyMesh): boolean;
  allocPolyMeshDetail(): RecastHandle;
  freePolyMeshDetail(d: RecastHandle): void;
  buildPolyMeshDetail(context: RecastHandle, polyMesh: PolyMesh, compact: RecastHandle, sampleDist: number, maxError: number, detail: RecastHandle): boolean;
  NavMeshCreateParams: new () => RecastHandle & {
    setPolyMeshCreateParams(p: PolyMesh): void;
    setPolyMeshDetailCreateParams(d: RecastHandle): void;
    setWalkableHeight(v: number): void;
    setWalkableRadius(v: number): void;
    setWalkableClimb(v: number): void;
    setCellSize(v: number): void;
    setCellHeight(v: number): void;
    setBuildBvTree(v: boolean): void;
  };
  createNavMeshData(params: unknown): { success: boolean; navMeshData: unknown };
  NavMesh: new () => NavMeshHandle;
  exportNavMesh(mesh: NavMeshHandle): Uint8Array;
  exportTileCache(mesh: NavMeshHandle, cache: RecastHandle): Uint8Array;
  getNavMeshPositionsAndIndices(mesh: NavMeshHandle): [number[], number[]];
  TileCacheMeshProcess: new (process: (params: { polyCount(): number }, polyAreas: { set(i: number, v: number): void }, polyFlags: { set(i: number, v: number): void }) => void) => unknown;
  Recast: { RC_CONTOUR_TESS_WALL_EDGES: number };
}

/** The recast module, initialised once. */
let recastReady: Promise<Recast> | null = null;

/** Load and initialise recast-navigation's core, once. */
export async function initRecast(): Promise<Recast> {
  if (!recastReady) {
    recastReady = (import('recast-navigation') as Promise<unknown> as Promise<Recast>).then(async (module) => {
      await module.init();
      return module;
    });
  }
  return recastReady;
}

/** The Recast build settings an agent profile means, in world units. */
export function bakeConfig(agent: NavAgent) {
  const { radius, height, step, slope } = AGENT_DEFAULTS(agent);
  // The voxel grid is sized to the agent: fine enough that doorways of
  // twice the radius survive, coarse enough that a big level bakes fast.
  const cs = radius / 3;
  const ch = cs / 2;
  return {
    cs, ch,
    walkableRadius: Math.ceil(radius / cs),
    walkableHeight: Math.max(3, Math.ceil(height / ch)),
    walkableClimb: Math.floor(step / ch),
    walkableSlopeAngle: slope,
    borderSize: 0,
    tileSize: 0,
    maxEdgeLen: 12,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1
  };
}

/**
 * Bake one agent's navmesh from extracted geometry. `areas` gives the
 * volume area ids and goes into the stamp.
 */
export async function bakeNavMesh(geometry: BakeGeometry, agent: NavAgent, areas: NavAreas): Promise<{ data: Uint8Array; stamp: string; polys: number }> {
  const R = await initRecast();
  const { positions, indices, volumes } = geometry;
  if (!indices.length) throw new Error('M2D nav bake: the level has no geometry to bake from');
  if (agent.dynamic) return bakeTileCache(geometry, agent, areas, R);

  const config = bakeConfig(agent);
  const rcConfig = R.createRcConfig(config);
  rcConfig.minRegionArea = rcConfig.minRegionArea * rcConfig.minRegionArea;
  rcConfig.mergeRegionArea = rcConfig.mergeRegionArea * rcConfig.mergeRegionArea;
  rcConfig.detailSampleDist = rcConfig.detailSampleDist < 0.9 ? 0 : rcConfig.cs * rcConfig.detailSampleDist;
  rcConfig.detailSampleMaxError = rcConfig.ch * rcConfig.detailSampleMaxError;

  const bounds = boundsOf(positions);
  // Headroom above, one cell below: an exact fit clips the top voxels.
  bounds.min[1] -= rcConfig.ch;
  bounds.max[1] += rcConfig.ch * 2;
  const grid = R.calcGridSize(bounds.min, bounds.max, rcConfig.cs);
  rcConfig.width = grid.width;
  rcConfig.height = grid.height;

  const context = new R.RecastBuildContext();
  const freeable: (() => void)[] = [];
  const free = () => { for (const f of freeable.reverse()) f(); freeable.length = 0; };
  const fail = (message: string): never => { free(); throw new Error(`M2D nav bake: ${message}`); };

  try {
    const vertsArray = new R.VerticesArray();
    vertsArray.copy(positions);
    const trisArray = new R.TrianglesArray();
    trisArray.copy(indices);
    const triCount = indices.length / 3;
    freeable.push(() => { vertsArray.destroy(); trisArray.destroy(); });

    const heightfield = R.allocHeightfield();
    freeable.push(() => R.freeHeightfield(heightfield));
    if (!R.createHeightfield(context, heightfield, rcConfig.width, rcConfig.height, bounds.min, bounds.max, rcConfig.cs, rcConfig.ch)) {
      fail('could not create the heightfield');
    }

    const triAreas = new R.TriangleAreasArray();
    triAreas.resize(triCount);
    freeable.push(() => triAreas.destroy());
    R.markWalkableTriangles(context, rcConfig.walkableSlopeAngle, vertsArray, indices.length, trisArray, triCount, triAreas);
    if (!R.rasterizeTriangles(context, vertsArray, indices.length, trisArray, triAreas, triCount, heightfield, rcConfig.walkableClimb)) {
      fail('could not rasterize the level');
    }

    R.filterLowHangingWalkableObstacles(context, rcConfig.walkableClimb, heightfield);
    R.filterLedgeSpans(context, rcConfig.walkableHeight, rcConfig.walkableClimb, heightfield);
    R.filterWalkableLowHeightSpans(context, rcConfig.walkableHeight, heightfield);

    const compact = R.allocCompactHeightfield();
    freeable.push(() => R.freeCompactHeightfield(compact));
    if (!R.buildCompactHeightfield(context, rcConfig.walkableHeight, rcConfig.walkableClimb, heightfield, compact)) {
      fail('could not compact the heightfield');
    }
    if (!R.erodeWalkableArea(context, rcConfig.walkableRadius, compact)) {
      fail('could not erode by the agent radius');
    }

    // The nav volumes: each marks its box with its area id. `blocked` ones
    // became geometry in the extraction; what reaches here is the costly.
    for (const volume of volumes) {
      const id = areas.id(volume.area);
      if (id === 0 || id === WALKABLE_AREA) continue;
      R.markBoxArea(context,
        [volume.x - volume.halfX, volume.hmin, volume.z - volume.halfZ],
        [volume.x + volume.halfX, volume.hmax, volume.z + volume.halfZ],
        id, compact);
    }

    if (!R.buildDistanceField(context, compact)) fail('could not build the distance field');
    if (!R.buildRegions(context, compact, rcConfig.borderSize, rcConfig.minRegionArea, rcConfig.mergeRegionArea)) {
      fail('could not partition the walkable surface');
    }

    const contours = R.allocContourSet();
    freeable.push(() => R.freeContourSet(contours));
    if (!R.buildContours(context, compact, rcConfig.maxSimplificationError, rcConfig.maxEdgeLen, contours, R.Recast.RC_CONTOUR_TESS_WALL_EDGES)) {
      fail('could not trace contours');
    }

    const polyMesh = R.allocPolyMesh();
    freeable.push(() => R.freePolyMesh(polyMesh));
    if (!R.buildPolyMesh(context, contours, rcConfig.maxVertsPerPoly, polyMesh)) {
      fail('could not build the polygon mesh');
    }

    const detail = R.allocPolyMeshDetail();
    freeable.push(() => R.freePolyMeshDetail(detail));
    if (!R.buildPolyMeshDetail(context, polyMesh, compact, rcConfig.detailSampleDist, rcConfig.detailSampleMaxError, detail)) {
      fail('could not build the detail mesh');
    }

    // Plain ground becomes area 0 as upstream has it; a marked area keeps
    // its id. Every polygon gets flag 1, so one filter sees them all and
    // weighs the marked ones by cost.
    for (let i = 0; i < polyMesh.npolys(); i++) {
      if (polyMesh.areas(i) === WALKABLE_AREA) polyMesh.setAreas(i, 0);
      polyMesh.setFlags(i, 1);
    }

    const params = new R.NavMeshCreateParams();
    params.setPolyMeshCreateParams(polyMesh);
    params.setPolyMeshDetailCreateParams(detail);
    params.setWalkableHeight(rcConfig.walkableHeight * rcConfig.ch);
    params.setWalkableRadius(rcConfig.walkableRadius * rcConfig.cs);
    params.setWalkableClimb(rcConfig.walkableClimb * rcConfig.ch);
    params.setCellSize(rcConfig.cs);
    params.setCellHeight(rcConfig.ch);
    params.setBuildBvTree(true);
    const result = R.createNavMeshData(params);
    params.destroy();
    if (!result.success) fail('could not create the Detour data');

    const polys = polyMesh.npolys();
    // `initSolo` takes ownership of the data; export reads the whole mesh
    // back as the serialised form `importNavMesh` loads.
    const navMesh = new R.NavMesh();
    if (!navMesh.initSolo(result.navMeshData)) fail('could not initialise the Detour mesh');
    const data = R.exportNavMesh(navMesh);
    navMesh.destroy();
    free();
    context.destroy();
    return { data, stamp: bakeStamp(geometry, agent, areas), polys };
  } catch (error) {
    context.destroy();
    throw error;
  }
}

/**
 * The dynamic bake: a Detour tile cache instead of one solo mesh, so
 * `NavObstacle` entities can cut the mesh tile by tile in play. The tile
 * pipeline has no hook to mark areas on the compact heightfield, so a
 * costly nav volume is refused here — `blocked` ones became geometry in
 * the extraction and work as ever.
 */
async function bakeTileCache(geometry: BakeGeometry, agent: NavAgent, areas: NavAreas, R: Recast): Promise<{ data: Uint8Array; stamp: string; polys: number }> {
  const { positions, indices, volumes } = geometry;
  const costly = volumes.find((volume) => volume.area !== 'blocked' && volume.area !== 'walkable');
  if (costly) {
    throw new Error(`M2D nav bake: agent is dynamic (a tile cache), which cannot mark the costly nav area '${costly.area}'; make the volume blocked, or the agent static`);
  }
  const { generateTileCache } = await (import('recast-navigation/generators') as Promise<unknown> as Promise<{
    generateTileCache(positions: number[], indices: number[], config: Record<string, unknown>): {
      success: boolean; error?: string; navMesh: NavMeshHandle; tileCache: RecastHandle;
    };
  }>);
  const bounds = boundsOf(positions);
  const config = bakeConfig(agent);
  bounds.min[1] -= config.ch;
  bounds.max[1] += config.ch * 2;
  const result = generateTileCache(positions, indices, {
    ...config, bounds: [bounds.min, bounds.max],
    tileSize: 48, expectedLayersPerTile: 2, maxObstacles: 256
  });
  if (!result.success) throw new Error(`M2D nav bake: ${result.error}`);
  const data = R.exportTileCache(result.navMesh, result.tileCache);
  let polys = 0;
  const [, tileIndices] = R.getNavMeshPositionsAndIndices(result.navMesh);
  polys = tileIndices.length / 3;
  result.tileCache.destroy();
  result.navMesh.destroy();
  return { data, stamp: bakeStamp(geometry, agent, areas), polys };
}

/** How every tile cache marks its polygons: plain ground, one flag, as the solo bake ends up. */
export function tileCacheMeshProcess(R: Recast) {
  return new R.TileCacheMeshProcess((params: { polyCount(): number }, polyAreas: { set(i: number, v: number): void }, polyFlags: { set(i: number, v: number): void }) => {
    for (let i = 0; i < params.polyCount(); ++i) {
      polyAreas.set(i, 0);
      polyFlags.set(i, 1);
    }
  });
}

/** The geometry's axis-aligned bounds, as recast takes them. */
function boundsOf(positions: number[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, positions[i + axis]!);
      max[axis] = Math.max(max[axis]!, positions[i + axis]!);
    }
  }
  return { min, max };
}
