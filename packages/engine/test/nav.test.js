import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { M2D } from '../src/core/m2d.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { navGeometryOf } from '../src/core/nav/navGeometry.ts';
import { bakeNavMesh } from '../src/core/nav/navBake.ts';
import { NavAreas } from '../src/core/nav/navAreas.ts';
import '../src/testing/setup.js';

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
  game.sceneManager.addScene('room', { fetch: async () => structuredClone(scene) });
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

  describe('click to move', () => {
    /** The room with a walker at the top, driving `PointerMove` through fed input. */
    async function walker(params = {}) {
      const scene = makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } });
      scene.world.player = 'walker';
      scene.prefabs.walker = {
        actor: 'Prop',
        physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true },
        constraints: { walk: { type: 'PointerMove', params: { speed: 200, arrive: 6, ...params } } }
      };
      scene.layers[0].objects.push({ id: 'walker', prefab: 'walker', x: 200, y: 80, width: 20, height: 20 });
      const game = await boot(scene);
      expect(game.nav.issues).toEqual([]);
      const entity = game.sceneManager.getCurrentScene().entitiesById.get('walker');
      return { game, entity, walk: entity.getConstraint('walk') };
    }

    /** One tick's input: a press at a world point, then nothing held. */
    const clickAt = (game, x, y) => {
      let first = true;
      game.input.setSnapshotSource(() => {
        const pointer = { ui: { x: 0, y: 0 }, world: { x, y }, isDown: first, pressed: first, pressedButtons: first ? 1 : 0, buttons: first ? 1 : 0, type: 'mouse' };
        first = false;
        return { down: [], pressed: [], pointer };
      });
    };

    it('clicking behind the wall walks around it', async () => {
      const { game, entity, walk } = await walker();
      clickAt(game, 200, 320);
      game.step(1);
      expect(walk.moving).toBe(true);
      expect(walk.path.length).toBeGreaterThan(2);
      let through = false;
      for (let i = 0; i < 60 * 20 && walk.moving; i++) {
        game.step(1);
        if (Math.abs(entity.position.y - 200) < 25 && entity.position.x < 70) through = true;
        expect(entity.position.x).toBeGreaterThan(-5); // never through the wall row except at the gap
        if (Math.abs(entity.position.y - 200) < 10) expect(entity.position.x).toBeLessThan(70);
      }
      expect(walk.moving).toBe(false);
      expect(through).toBe(true);
      expect(Math.hypot(entity.position.x - 200, entity.position.y - 320)).toBeLessThan(20);
    });

    it('an unreachable click does nothing', async () => {
      const { game, entity, walk } = await walker();
      clickAt(game, 230, 200); // the wall's own middle
      game.step(30);
      expect(walk.moving).toBe(false);
      expect(Math.hypot(entity.position.x - 200, entity.position.y - 80)).toBeLessThan(2);
    });

    it('a click over the length budget does nothing', async () => {
      const { game, walk } = await walker({ maxPathLength: 250 });
      clickAt(game, 200, 320); // the detour is ~480 px
      game.step(5);
      expect(walk.moving).toBe(false);
      clickAt(game, 200, 180); // straight down, inside the budget
      game.step(5);
      expect(walk.moving).toBe(true);
    });

    it('goTo routes and reports a refusal', async () => {
      const { walk } = await walker();
      expect(walk.goTo(230, 200)).toBe(false);
      expect(walk.moving).toBe(false);
      expect(walk.goTo(200, 320)).toBe(true);
      expect(walk.path.length).toBeGreaterThan(2);
    });

    it('a snapshot carries a walk mid-route', async () => {
      const { game, entity, walk } = await walker();
      clickAt(game, 200, 320);
      game.step(90);
      expect(walk.moving).toBe(true);
      const snapshot = game.snapshot();
      const mark = { x: entity.position.x, y: entity.position.y, waypoint: walk.waypoint };
      game.step(60);
      game.restore(snapshot);
      expect(walk.waypoint).toBe(mark.waypoint);
      expect(entity.position.x).toBeCloseTo(mark.x, 5);
      for (let i = 0; i < 60 * 20 && walk.moving; i++) game.step(1);
      expect(walk.moving).toBe(false);
      expect(Math.hypot(entity.position.x - 200, entity.position.y - 320)).toBeLessThan(20);
    });

    it('walks the straight line it always did when no mesh is loaded', async () => {
      const scene = makeScene();
      scene.prefabs.walker = {
        actor: 'Prop',
        physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true },
        constraints: { walk: { type: 'PointerMove', params: { speed: 200, arrive: 6 } } }
      };
      scene.layers[0].objects.push({ id: 'walker', prefab: 'walker', x: 200, y: 80, width: 20, height: 20 });
      const game = await boot(scene);
      const entity = game.sceneManager.getCurrentScene().entitiesById.get('walker');
      const walk = entity.getConstraint('walk');
      expect(walk.goTo(200, 160)).toBe(true);
      expect(walk.path).toBeNull();
      game.step(60 * 3);
      expect(Math.hypot(entity.position.x - 200, entity.position.y - 160)).toBeLessThan(10);
    });
  });

  describe('the hunt', () => {
    /** The room with a still avatar below the wall and chasers above it. */
    async function pack(count, params = {}) {
      const scene = makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } });
      scene.prefabs.mark = { actor: 'Prop', physics: { bodyType: 'static', layer: 'none' } };
      scene.prefabs.hunter = {
        actor: 'Prop',
        physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true },
        constraints: { chase: { type: 'Chase', params: { speed: 150, detectionRange: 4000, separation: 36, ...params } } }
      };
      scene.layers[0].objects.push({ id: 'mark', prefab: 'mark', x: 200, y: 320, width: 16, height: 16 });
      for (let i = 0; i < count; i++) {
        scene.layers[0].objects.push({ id: `hunter-${i}`, prefab: 'hunter', x: 150 + i * 34, y: 80, width: 20, height: 20 });
      }
      const game = await boot(scene);
      expect(game.nav.issues).toEqual([]);
      const scene2 = game.sceneManager.getCurrentScene();
      game.players.local.avatar = scene2.entitiesById.get('mark');
      return { game, hunters: [...Array(count)].map((_, i) => scene2.entitiesById.get(`hunter-${i}`)) };
    }

    it('routes around the wall to the player', async () => {
      const { game, hunters } = await pack(1, { separation: 0 });
      const [hunter] = hunters;
      const chase = hunter.getConstraint('chase');
      game.step(2);
      expect(chase.path).not.toBeNull();
      expect(chase.path.length).toBeGreaterThan(2);
      for (let i = 0; i < 60 * 20; i++) {
        game.step(1);
        // Never through the wall: on its row only the gap is stood in.
        if (Math.abs(hunter.position.y - 200) < 8) expect(hunter.position.x).toBeLessThan(70);
        if (Math.hypot(hunter.position.x - 200, hunter.position.y - 320) < 30) break;
      }
      expect(Math.hypot(hunter.position.x - 200, hunter.position.y - 320)).toBeLessThan(30);
    });

    it('a pack arrives around the wall without stacking', async () => {
      const { game, hunters } = await pack(4);
      game.step(60 * 25);
      for (const hunter of hunters) {
        expect(Math.hypot(hunter.position.x - 200, hunter.position.y - 320)).toBeLessThan(80);
      }
      for (let a = 0; a < hunters.length; a++) {
        for (let b = a + 1; b < hunters.length; b++) {
          const distance = Math.hypot(
            hunters[a].position.x - hunters[b].position.x,
            hunters[a].position.y - hunters[b].position.y);
          expect(distance).toBeGreaterThan(24);
        }
      }
    });

    it('hunts the same way twice', async () => {
      const run = async () => {
        const { game, hunters } = await pack(3);
        game.step(60 * 10);
        return hunters.map((hunter) => ({ x: hunter.position.x, y: hunter.position.y }));
      };
      expect(await run()).toEqual(await run());
    });
  });

  describe('dynamic obstacles', () => {
    const DYNAMIC_GAME = { navAgents: { goblin: { radius: 10, dynamic: true } } };
    let dynUrl, dynStamp;

    beforeAll(async () => {
      const game = await boot(makeScene(), DYNAMIC_GAME);
      const agent = game.nav.agents.get('goblin');
      const baked = await bakeNavMesh(navGeometryOf(game, agent), agent, game.nav.areas);
      expect(baked.polys).toBeGreaterThan(0);
      dynUrl = join(dir, 'room.dynamic.navmesh');
      dynStamp = baked.stamp;
      await writeFile(dynUrl, baked.data);
    });

    const bootDynamic = () => boot(makeScene({ navmeshes: { goblin: { url: dynUrl, stamp: dynStamp } } }), DYNAMIC_GAME);
    const route = (game) => game.nav.findPath({ x: 200, y: 80 }, { x: 200, y: 320 });

    it('a dynamic bake is its own stamp, loads clean and routes as the static one', async () => {
      expect(dynStamp).not.toBe(stamp);
      const game = await bootDynamic();
      expect(game.nav.issues).toEqual([]);
      expect(route(game).length).toBeGreaterThan(300);
    });

    it('an obstacle across the gap closes the route before the next tick, and heals when removed', async () => {
      const game = await bootDynamic();
      const id = game.nav.addObstacle({ x: 30, y: 200, halfX: 30, halfY: 30 });
      expect(id).toBeGreaterThan(0);
      game.step(1);
      expect(route(game)).toBeNull();
      game.nav.removeObstacle(id);
      game.step(1);
      expect(route(game).length).toBeGreaterThan(300);
    });

    it('routeBlocked clips the remaining corners against the tracked boxes, angled ones included', async () => {
      const game = await bootDynamic();
      game.nav.addObstacle({ x: 200, y: 150, halfX: 20, halfY: 20 });
      // Straight through the box; beside it; ending before it.
      expect(game.nav.routeBlocked([{ x: 200, y: 80 }, { x: 200, y: 320 }])).toBe(true);
      expect(game.nav.routeBlocked([{ x: 240, y: 80 }, { x: 240, y: 320 }])).toBe(false);
      expect(game.nav.routeBlocked([{ x: 200, y: 80 }, { x: 200, y: 120 }])).toBe(false);
      // A thin box turned 45°: its corners reach where its sides do not.
      game.nav.addObstacle({ x: 300, y: 200, halfX: 40, halfY: 2, angle: Math.PI / 4 });
      expect(game.nav.routeBlocked([{ x: 320, y: 150 }, { x: 320, y: 250 }])).toBe(true);
      expect(game.nav.routeBlocked([{ x: 340, y: 160 }, { x: 345, y: 170 }])).toBe(false);
      game.destroy();
    });

    it('a walk re-plans when an obstacle rolls onto its route, and stops when the way is gone', async () => {
      const scene = makeScene({ navmeshes: { goblin: { url: dynUrl, stamp: dynStamp } } });
      scene.prefabs.walker = {
        actor: 'Prop',
        physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true },
        constraints: { walk: { type: 'PointerMove', params: { speed: 120, arrive: 6 } } }
      };
      scene.layers[0].objects.push({ id: 'walker', prefab: 'walker', x: 200, y: 80, width: 20, height: 20 });
      const game = await boot(scene, DYNAMIC_GAME);
      game.players.local.avatar = game.sceneManager.getCurrentScene().entitiesById.get('walker');
      const entity = game.players.local.avatar;
      const walk = entity.getConstraint('walk');
      let first = true;
      game.input.setSnapshotSource(() => {
        const pointer = { ui: { x: 0, y: 0 }, world: { x: 200, y: 320 }, isDown: first, pressed: first, pressedButtons: first ? 1 : 0, buttons: first ? 1 : 0, type: 'mouse' };
        first = false;
        return { down: [], pressed: [], pointer };
      });
      game.step(2);
      expect(walk.moving).toBe(true);

      // The gap — the only way through — closes while the walk is young.
      const id = game.nav.addObstacle({ x: 30, y: 200, halfX: 30, halfY: 30 });
      let travelled = 0;
      let last = { ...entity.position };
      for (let i = 0; i < 120 && walk.moving; i++) {
        game.step(1);
        travelled += Math.hypot(entity.position.x - last.x, entity.position.y - last.y);
        last = { ...entity.position };
      }
      // It noticed within the quarter-second watch and stood down — long
      // before walking the ~200 units to press against the box.
      expect(walk.moving).toBe(false);
      expect(travelled).toBeLessThan(120);

      // The gap opens again, but a box sits beside the route's first leg:
      // the walk replans around it and still arrives.
      game.nav.removeObstacle(id);
      first = true; // click again
      game.step(2);
      expect(walk.moving).toBe(true);
      const before = walk.path.map((p) => ({ ...p }));
      game.nav.addObstacle({ x: 150, y: 130, halfX: 25, halfY: 25 });
      game.step(30);
      expect(walk.moving).toBe(true);
      expect(walk.path).not.toEqual(before);
      for (let i = 0; i < 60 * 20 && walk.moving; i++) game.step(1);
      expect(walk.moving).toBe(false);
      expect(Math.hypot(entity.position.x - 200, entity.position.y - 320)).toBeLessThan(20);
      game.destroy();
    });

    it('a restore converges the mesh to the snapshot it rewinds to', async () => {
      const game = await bootDynamic();
      const open = game.snapshot();
      const openRoute = route(game);
      const id = game.nav.addObstacle({ x: 30, y: 200, halfX: 30, halfY: 30 });
      game.step(1);
      expect(route(game)).toBeNull();
      const blocked = game.snapshot();
      game.restore(open);
      game.step(1);
      expect(route(game)).toEqual(openRoute);
      game.restore(blocked);
      expect(route(game)).toBeNull();
      // And the restored list is live: the obstacle can still be taken away.
      game.nav.removeObstacle(id);
      game.step(1);
      expect(route(game)).toEqual(openRoute);
    });

    it('a NavObstacle entity cuts where it stands and the cut follows it', async () => {
      const scene = makeScene({ navmeshes: { goblin: { url: dynUrl, stamp: dynStamp } } });
      scene.prefabs.cart = {
        actor: 'Prop',
        physics: { bodyType: 'kinematic', layer: 'none' },
        constraints: { blocks: { type: 'NavObstacle', params: { margin: 2 } } }
      };
      scene.layers[0].objects.push({ id: 'cart', prefab: 'cart', x: 30, y: 200, width: 60, height: 50 });
      const game = await boot(scene, DYNAMIC_GAME);
      expect(game.nav.issues).toEqual([]);
      game.step(2);
      expect(route(game)).toBeNull();
      // The cart rolls out of the gap; the route comes back.
      const cart = game.sceneManager.getCurrentScene().entitiesById.get('cart');
      cart.body.setPosition({ x: 330, y: 80 });
      game.step(3);
      expect(route(game)).not.toBeNull();
      // And the cart's wall is cut where it stands now.
      expect(game.nav.findPath({ x: 330, y: 50 }, { x: 330, y: 80 })).toBeNull();
      // The cart goes, the cut heals.
      game.removeEntity(cart);
      game.step(2);
      expect(game.nav.obstacles.size).toBe(0);
    });

    it('refuses a dynamic bake over a costly nav volume', async () => {
      const volumes = [{ id: 'mud', prefab: 'nav', x: 30, y: 200, width: 60, height: 60, properties: { area: 'mud' } }];
      const game = await boot(makeScene({ volumes }), DYNAMIC_GAME);
      const agent = game.nav.agents.get('goblin');
      await expect(bakeNavMesh(navGeometryOf(game, agent), agent, game.nav.areas)).rejects.toThrow(/mud/);
    });

    it('an obstacle on a static mesh is reported once and ignored', async () => {
      const game = await boot(makeScene({ navmeshes: { goblin: { url: meshUrl, stamp } } }));
      expect(game.nav.addObstacle({ x: 30, y: 200, halfX: 30, halfY: 30 })).toBe(0);
      expect(game.nav.addObstacle({ x: 30, y: 200, halfX: 30, halfY: 30 })).toBe(0);
      expect(game.nav.issues.filter((issue) => issue.kind === 'static')).toHaveLength(1);
      game.step(1);
      expect(route(game)).not.toBeNull();
    });
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
