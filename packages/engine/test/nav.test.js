import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { M2D } from '../src/core/m2d.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { navGeometryOf } from '../src/core/nav/navGeometry.js';
import { bakeNavMesh } from '../src/core/nav/navBake.js';
import { NavAreas } from '../src/core/nav/navAreas.js';
import './helpers/setupPhysics.js';

/**
 * The navmesh, headless and end to end: baked in Node from a built level,
 * written to disk, loaded back by a second game as a scene asset, checked
 * against its stamp, and queried around a wall — the whole path a server
 * takes, with no browser anywhere.
 */

/** A 400 by 400 room with a wall across the middle and one 60 px gap at the left. */
const makeScene = ({ navmeshes, wallY = 200, volumes = [] } = {}) => ({
  version: SCENE_VERSION, type: 'level', name: 'room',
  world: { width: 400, height: 400, gravity: { x: 0, y: 0 } },
  ...(navmeshes && { assets: { navmeshes } }),
  prefabs: {
    wall: { actor: 'Prop', physics: { bodyType: 'static' } },
    nav: { actor: 'NavVolume', physics: { bodyType: 'static', layer: 'none' } }
  },
  layers: [{ name: 'main', objects: [
    // The wall spans from x = 60 to the right edge: the gap is at the left.
    { id: 'wall', prefab: 'wall', x: 230, y: wallY, width: 340, height: 20 },
    ...volumes
  ] }]
});

const GAME = { headless: true, seed: 1, navAgents: { goblin: { radius: 10 } }, navAreas: { mud: { cost: 8 } } };

async function boot(scene, options = {}) {
  const game = new M2D(null, { ...GAME, ...options });
  game.sceneManager.addScene('room', { fetch: async () => scene });
  await game.sceneManager.switchTo('room');
  return game;
}

describe('navmesh', () => {
  let dir, meshUrl, stamp;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'm2d-nav-'));
    // Bake from a built level, exactly as the editor's bake does.
    const game = await boot(makeScene());
    const areas = game.nav.areas;
    const agent = game.nav.agents.get('goblin');
    const geometry = navGeometryOf(game, agent);
    const baked = await bakeNavMesh(geometry, agent, areas);
    expect(baked.polys).toBeGreaterThan(0);
    meshUrl = join(dir, 'room.goblin.navmesh');
    stamp = baked.stamp;
    await writeFile(meshUrl, baked.data);
    game.destroy?.();
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('bakes the same bytes and stamp twice', async () => {
    const game = await boot(makeScene());
    const agent = game.nav.agents.get('goblin');
    const geometry = navGeometryOf(game, agent);
    const again = await bakeNavMesh(geometry, agent, game.nav.areas);
    expect(again.stamp).toBe(stamp);
    const bytes = await import('node:fs/promises').then((fs) => fs.readFile(meshUrl));
    expect(Buffer.compare(Buffer.from(again.data), bytes)).toBe(0);
  });

  it('loads the baked mesh as a scene asset, with no issues', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
    expect(game.nav.issues).toEqual([]);
    expect(game.nav.has('goblin')).toBe(true);
  });

  it('routes around the wall, through the gap', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
    const path = game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 });
    expect(path).not.toBeNull();
    // A straight line is 240 px; the detour through the left gap is far longer.
    expect(path.length).toBeGreaterThan(300);
    // The path bends through the gap at the left edge, not through the wall.
    const nearWall = path.points.filter((p) => Math.abs(p.y - 200) < 30);
    expect(nearWall.length).toBeGreaterThan(0);
    for (const p of nearWall) expect(p.x).toBeLessThan(70);
  });

  it('finds the same path twice', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
    const a = game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 });
    const b = game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 });
    expect(a).toEqual(b);
  });

  it('refuses a path over its length budget', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
    expect(game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 }, { maxLength: 250 })).toBeNull();
    expect(game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 }, { maxLength: 2000 })).not.toBeNull();
  });

  it('refuses a goal off the mesh', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
    // Far beyond the world's edge: no polygon anywhere near it.
    expect(game.nav.findPath({ x: 200, y: 80 }, { x: 700, y: 200 })).toBeNull();
  });

  it('reports a missing bake at load', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: join(dir, 'gone.navmesh'), stamp } } }));
    expect(game.nav.issues).toHaveLength(1);
    expect(game.nav.issues[0].kind).toBe('missing');
    expect(game.nav.has('goblin')).toBe(false);
  });

  it('reports a stale bake at load, and still loads the mesh', async () => {
    // The wall moved since the bake: same mesh file, different level.
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } }, wallY: 240 }));
    expect(game.nav.issues).toHaveLength(1);
    expect(game.nav.issues[0].kind).toBe('stale');
    expect(game.nav.has('goblin')).toBe(true);
  });

  it('reports a navmesh for an agent the project does not declare', async () => {
    const game = await boot(makeScene({ navmeshes: { ogre: { url: meshUrl, stamp } } }));
    expect(game.nav.issues).toHaveLength(1);
    expect(game.nav.issues[0].kind).toBe('undeclared');
  });

  it('keeps a blocked volume out of the mesh', async () => {
    // A blocked NavVolume over the gap: the only way around is gone.
    const volumes = [{ id: 'bed', prefab: 'nav', x: 30, y: 200, width: 60, height: 60, properties: { area: 'blocked' } }];
    const scene = makeScene({ volumes });
    const game = await boot(scene);
    const agent = game.nav.agents.get('goblin');
    const baked = await bakeNavMesh(navGeometryOf(game, agent), agent, game.nav.areas);
    const url = join(dir, 'blocked.goblin.navmesh');
    await writeFile(url, baked.data);
    const play = await boot(makeScene({ volumes, navmeshes: { goblin: { url, stamp: baked.stamp } } }));
    expect(play.nav.issues).toEqual([]);
    expect(play.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 })).toBeNull();
  });

  it('weighs a costly area, and a cost change goes into the stamp', async () => {
    const volumes = [{ id: 'mud', prefab: 'nav', x: 30, y: 200, width: 60, height: 60, properties: { area: 'mud' } }];
    const scene = makeScene({ volumes });
    const game = await boot(scene);
    const agent = game.nav.agents.get('goblin');
    const baked = await bakeNavMesh(navGeometryOf(game, agent), agent, game.nav.areas);
    const url = join(dir, 'mud.goblin.navmesh');
    await writeFile(url, baked.data);
    const play = await boot(makeScene({ volumes, navmeshes: { goblin: { url, stamp: baked.stamp } } }));
    expect(play.nav.issues).toEqual([]);
    // The gap is mud now: still the only way, so the path crosses it.
    expect(play.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 })).not.toBeNull();
    // A different cost is a different bake input.
    const other = new NavAreas({ mud: { cost: 2 } });
    const rebaked = await bakeNavMesh(navGeometryOf(game, agent), agent, other);
    expect(rebaked.stamp).not.toBe(baked.stamp);
  });

  it('snaps a point beside the mesh onto it', async () => {
    const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
    const point = game.nav.nearestPoint({ x: -15, y: 80 });
    expect(point).not.toBeNull();
    expect(point.x).toBeGreaterThanOrEqual(0);
    // And far off the mesh is nowhere, not the nearest edge of the world.
    expect(game.nav.nearestPoint({ x: -200, y: 80 })).toBeNull();
  });
});
