import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { M2D } from '../src/core/m2d.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { navGeometryOf } from '../src/core/nav/navGeometry.js';
import { bakeNavMesh } from '../src/core/nav/navBake.js';

/**
 * The navmesh in three dimensions, headless: the same bake, asset and
 * query as 2D, over a yard in metres with y up — a slab for the ground and
 * a wall across it with a gap. 2D is flat 3D to the mesh; this is the
 * unflattened case.
 */

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

/** A 20 m yard: a slab, and a wall across the middle with a 2 m gap at the left. */
const makeScene = ({ navmeshes } = {}) => ({
  version: SCENE_VERSION, type: 'level', name: 'yard',
  world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
  ...(navmeshes && { assets: { navmeshes } }),
  prefabs: {
    slab: { actor: 'Prop', physics: { bodyType: 'static', shape: 'box' } },
    wall: { actor: 'Prop', physics: { bodyType: 'static', shape: 'box' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'slab', prefab: 'slab', x: 0, y: -0.25, z: 0, width: 20, height: 0.5, depth: 20 },
    // From x = -8 to the right edge: the gap is at the far left.
    { id: 'wall', prefab: 'wall', x: 1, y: 1, z: 0, width: 18, height: 2, depth: 0.4 }
  ] }]
});

const GAME = { headless: true, dimensions: 3, seed: 1, navAgents: { walker: { radius: 0.35, height: 1.8, step: 0.3 } } };

async function boot(scene) {
  const game = new M2D(null, { ...GAME });
  game.sceneManager.addScene('yard', { fetch: async () => scene });
  await game.sceneManager.switchTo('yard');
  return game;
}

describe('navmesh in 3D', () => {
  let dir, meshUrl, stamp;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'm2d-nav3d-'));
    const game = await boot(makeScene());
    const agent = game.nav.agents.get('walker');
    const baked = await bakeNavMesh(navGeometryOf(game, agent), agent, game.nav.areas);
    expect(baked.polys).toBeGreaterThan(0);
    meshUrl = join(dir, 'yard.walker.navmesh');
    stamp = baked.stamp;
    await writeFile(meshUrl, baked.data);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads and routes around the wall, through the gap, in metres', async () => {
    const game = await boot(makeScene({ navmeshes: { walker: { url: meshUrl, stamp } } }));
    expect(game.nav.issues).toEqual([]);
    const path = game.nav.findPath({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 5 });
    expect(path).not.toBeNull();
    // Straight is 10 m; through the gap at x = -8.7 is far longer.
    expect(path.length).toBeGreaterThan(14);
    const nearWall = path.points.filter((p) => Math.abs(p.z) < 1);
    expect(nearWall.length).toBeGreaterThan(0);
    for (const p of nearWall) expect(p.x).toBeLessThan(-8);
    // The points carry a height, and it is the slab's top.
    for (const p of path.points) expect(Math.abs(p.y)).toBeLessThan(0.3);
  });

  it('reports a stale bake when the yard changes', async () => {
    const scene = makeScene({ navmeshes: { walker: { url: meshUrl, stamp } } });
    scene.layers[0].objects[1].x = 2;
    const game = await boot(scene);
    expect(game.nav.issues).toHaveLength(1);
    expect(game.nav.issues[0].kind).toBe('stale');
  });
});
