import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { M2D } from 'm2d-engine';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { navGeometryOf } from 'm2d-engine/core/nav/navGeometry.js';
import { bakeNavMesh } from 'm2d-engine/core/nav/navBake.js';
import { bakeNav, type BakeGame, type BakeDeps } from '../src/nav.ts';
import { Companion } from '../src/index.ts';

/**
 * The host's navmesh bake, end to end against the real engine: a project
 * with a nav agent, a level with a wall, one `bakeNav` — and the written
 * sidecar plus the recorded asset load back into a fresh game with no
 * stale or missing report, which is the parity a server relies on.
 */

let root: string;
let companion: Companion;

const PROJECT = {
  name: 'nav-demo',
  navAgents: { goblin: { radius: 10 } },
  navAreas: { mud: { cost: 4 } }
};

const LEVEL = {
  version: 6, type: 'level', name: 'room',
  world: { width: 400, height: 400, gravity: { x: 0, y: 0 } },
  prefabs: { wall: { actor: 'Prop', physics: { bodyType: 'static' } } },
  layers: [{ name: 'main', objects: [{ id: 'wall', prefab: 'wall', x: 230, y: 200, width: 340, height: 20 }] }]
};

async function makeGame(): Promise<BakeGame> {
  await initPhysics();
  const game = new M2D(null, { headless: true, seed: 1, navAgents: PROJECT.navAgents, navAreas: PROJECT.navAreas, basePath: root + '/' });
  return game as BakeGame;
}

const deps = {
  makeGame,
  navModules: async () => ({ navGeometryOf, bakeNavMesh })
} as unknown as BakeDeps;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'm2d-nav-bake-'));
  await mkdir(join(root, 'scenes'), { recursive: true });
  await writeFile(join(root, 'm2d.project.json'), JSON.stringify(PROJECT, null, 2));
  await writeFile(join(root, 'scenes', 'room.json'), JSON.stringify(LEVEL, null, 2));
  companion = new Companion({ root });
});

afterAll(async () => {
  await companion?.close();
  await rm(root, { recursive: true, force: true });
});

describe('the navmesh bake', () => {
  it('bakes, writes the sidecar and records the asset, and the result loads clean', async () => {
    const result = await bakeNav(companion.session, companion.project, deps, 'scenes/room.json', {}, { origin: 'test' });
    expect(result.baked).toHaveLength(1);
    expect(result.baked[0]?.agent).toBe('goblin');
    expect(result.baked[0]?.polys).toBeGreaterThan(0);

    // The sidecar is on disk, beside the scene.
    const sidecar = join(root, 'scenes', 'room.goblin.navmesh');
    expect((await stat(sidecar)).size).toBeGreaterThan(0);

    // The edit landed as one step: the scene's assets name the mesh and its stamp.
    const doc = await companion.session.document('scenes/room.json');
    const navmeshes = (doc.data as { assets?: { navmeshes?: Record<string, { url: string; stamp: string }> } }).assets?.navmeshes;
    expect(navmeshes?.goblin?.url).toBe('scenes/room.goblin.navmesh');
    expect(navmeshes?.goblin?.stamp).toMatch(/^[0-9a-f]{16}$/);

    // Full circle: a fresh headless game loads the scene as edited and
    // reports nothing stale or missing, and a path routes around the wall.
    const game = await makeGame() as BakeGame & { nav: { issues: unknown[]; findPath(a: object, b: object): { length: number } | null } };
    game.sceneManager.addScene('room', { fetch: async () => structuredClone(doc.data) });
    await game.sceneManager.switchTo('room');
    expect(game.nav.issues).toEqual([]);
    const path = game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 });
    expect(path).not.toBeNull();
    expect(path && path.length).toBeGreaterThan(300);
  });

  it('refuses a bake when the project declares no nav agents', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'm2d-nav-bare-'));
    await mkdir(join(bare, 'scenes'), { recursive: true });
    await writeFile(join(bare, 'scenes', 'room.json'), JSON.stringify(LEVEL, null, 2));
    const other = new Companion({ root: bare });
    try {
      await expect(bakeNav(other.session, other.project, deps, 'scenes/room.json', {}, { origin: 'test' }))
        .rejects.toThrow(/navAgents/);
    } finally {
      await other.close();
      await rm(bare, { recursive: true, force: true });
    }
  });

  it('refuses an agent the project does not declare', async () => {
    await expect(bakeNav(companion.session, companion.project, deps, 'scenes/room.json', { agents: ['ogre'] }, { origin: 'test' }))
      .rejects.toThrow(/ogre/);
  });
});
