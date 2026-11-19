import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestGame, makeBody } from 'm2d-engine/test/helpers/testGame.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { Attack } from 'm2d-engine/constraints/attack.js';
import { navGeometryOf } from 'm2d-engine/core/nav/navGeometry.js';
import { bakeNavMesh } from 'm2d-engine/core/nav/navBake.js';
import { Behavior } from '../src/ai/behavior.ts';

/**
 * The NPC ladder, headless and end to end, in a 400 by 400 arena with a
 * wall across the middle and one gap at the left (the engine's nav-test
 * room): a watcher that patrols, sees only what its cone and the wall
 * allow, hears what the world says, hunts around the wall, telegraphs,
 * strikes, recovers and walks home — every invariant the project file
 * lists, one test each.
 */

/** The hero: an avatar-shaped target with health, driven by the tests by hand. */
class Hero extends Entity {
  name = 'Hero';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('health', new Health(this, { maxHealth: 100, invulnerableDuration: 0 }));
  }
}

/** The watcher: the kit cast the behaviour conducts. */
class Watcher extends Entity {
  name = 'Watcher';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('chase', new Chase(this, { speed: 90, detectionRange: 240, agent: 'watcher' }));
    this.addConstraint('attack', new Attack(this, { range: 40, windup: 12, cooldown: 30, damage: 10, knockback: 0, targets: ['player'] }));
    this.addConstraint('behavior', new Behavior(this, { sightRange: 240, speed: 80, agent: 'watcher' }));
  }
}

/** A watcher with no attack slot: contact damage would do the hurting. */
class Howler extends Entity {
  name = 'Howler';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('chase', new Chase(this, { speed: 90, detectionRange: 240, agent: 'watcher' }));
    this.addConstraint('behavior', new Behavior(this, { sightRange: 240, speed: 80, agent: 'watcher', strikeRange: 50 }));
  }
}

/** The wall spans x = 60..400 around y = 200: the gap is at the left edge. */
const WALL = { x: 230, y: 200, width: 340, height: 20 };

const makeScene = ({ navmeshes, objects = [] } = {}) => ({
  version: SCENE_VERSION, type: 'level', name: 'arena',
  world: { width: 400, height: 400, gravity: { x: 0, y: 0 }, player: 'hero' },
  ...(navmeshes && { assets: { navmeshes } }),
  prefabs: {
    wall: { actor: 'Prop', physics: { bodyType: 'static' } },
    hero: { actor: 'Hero', physics: { bodyType: 'dynamic', layer: 'player' } },
    watcher: { actor: 'Watcher', physics: { bodyType: 'dynamic', layer: 'mob' } },
    howler: { actor: 'Howler', physics: { bodyType: 'dynamic', layer: 'mob' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'wall', prefab: 'wall', ...WALL },
    { id: 'hero', prefab: 'hero', x: 200, y: 80, width: 16, height: 16 },
    ...objects
  ] }]
});

const GAME = {
  headless: true, seed: 11, worldWidth: 400, worldHeight: 400,
  layers: ['world', 'player', 'mob'], navAgents: { watcher: { radius: 10 } }
};

let dir, meshUrl, stamp;

async function boot(scene) {
  const game = new M2D(null, GAME);
  game.registerActor('Hero', Hero);
  game.registerActor('Watcher', Watcher);
  game.registerActor('Howler', Howler);
  game.sceneManager.addScene('arena', { fetch: async () => structuredClone(scene) });
  await game.sceneManager.switchTo('arena');
  game.setupCollisionHandlers();
  return game;
}

/** A booted arena with the baked mesh and one NPC, tuned per test. */
async function arena({ prefab = 'watcher', at = { x: 200, y: 320 }, params = {}, constraints = {}, mesh = true } = {}) {
  const scene = makeScene({
    ...(mesh && { navmeshes: { watcher: { url: meshUrl, stamp } } }),
    objects: [{
      id: 'npc', prefab, ...at, width: 20, height: 20,
      constraints: { behavior: { params }, ...constraints }
    }]
  });
  const game = await boot(scene);
  expect(game.nav?.issues ?? []).toEqual([]);
  const scn = game.sceneManager.getCurrentScene();
  const npc = scn.entitiesById.get('npc');
  const hero = scn.entitiesById.get('hero');
  return { game, npc, hero, behavior: npc.getConstraint('behavior') };
}

const inWall = ({ x, y }, pad = 0) =>
  x > WALL.x - WALL.width / 2 - pad && x < WALL.x + WALL.width / 2 + pad &&
  y > WALL.y - WALL.height / 2 - pad && y < WALL.y + WALL.height / 2 + pad;

/** Step until `check` holds, bounded; returns the ticks it took. */
function until(game, check, ticks = 1200) {
  for (let i = 0; i < ticks; i++) {
    game.step(1);
    if (check()) return i + 1;
  }
  throw new Error(`not reached within ${ticks} ticks`);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'm2d-kit-behavior-'));
  const game = await boot(makeScene());
  const agent = game.nav.agents.get('watcher');
  const baked = await bakeNavMesh(navGeometryOf(game, agent), agent, game.nav.areas);
  expect(baked.polys).toBeGreaterThan(0);
  meshUrl = join(dir, 'arena.watcher.navmesh');
  stamp = baked.stamp;
  await writeFile(meshUrl, baked.data);
  game.destroy?.();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('sensing is honest', () => {
  it('a hero behind the wall is never seen; one in the open alerts on a sense tick, and patrol is PathFollow\'s', async () => {
    const { game, npc, behavior } = await arena({
      params: { patience: 1 },
      constraints: { path: { type: 'PathFollow', params: { points: [{ x: 150, y: 320 }, { x: 250, y: 320 }], speed: 60, waitTime: 100 } } }
    });
    const path = npc.getConstraint('path');
    // Patrolling: the path moves it, the chase stands down, no sighting
    // through the wall for three full seconds.
    game.step(180);
    expect(behavior.state).toBe('patrol');
    expect(path.suspended).toBe(false);
    expect(npc.getConstraint('chase').suspended).toBe(true);
    const start = { ...npc.position };
    game.step(60);
    expect(npc.position).not.toEqual(start); // the patrol walks

    // The hero steps around to the south side, in the open.
    const hero = game.sceneManager.getCurrentScene().entitiesById.get('hero');
    hero.body.setPosition({ x: 200, y: 260 });
    until(game, () => behavior.state === 'alert', 30);
    expect(behavior.lastSeen).toMatchObject({ x: 200, y: 260 });
    expect(path.suspended).toBe(true);
    game.destroy();
  });

  it('the cone excludes what is behind, and a look happens on the interval, not every tick', async () => {
    const { game, hero, behavior } = await arena({
      params: { sightCone: Math.PI / 2, senseInterval: 0.5 }
    });
    // The watcher stands facing east (facing 0). The hero close behind it,
    // west and in the open, is outside the cone.
    hero.body.setPosition({ x: 120, y: 320 });
    game.step(120);
    expect(behavior.state).toBe('patrol');

    // In front: seen — but only when the half-second look comes around.
    hero.body.setPosition({ x: 280, y: 320 });
    const ticks = until(game, () => behavior.state === 'alert', 40);
    expect(ticks).toBeGreaterThan(10); // not the very next tick
    game.destroy();
  });

  it('hearing is ranged, never its own events, and walks the noise down', async () => {
    const { game, npc, behavior } = await arena({ params: { hearingRange: 150, patience: 60 } });
    // A step at the hero, 240 px away and behind the wall: out of earshot.
    game.events.emit('step', { id: 7, at: { x: 200, y: 80 } });
    game.step(30);
    expect(behavior.state).toBe('patrol');
    // Its own noise is nobody's alarm.
    game.events.emit('step', { id: npc.netId, at: { x: 240, y: 320 } });
    game.step(30);
    expect(behavior.state).toBe('patrol');
    // A noise in earshot alerts and is investigated, without a sighting.
    game.events.emit('step', { id: 7, at: { x: 320, y: 340 } });
    until(game, () => behavior.state === 'alert', 10);
    expect(behavior.lastSeen).toEqual({ x: 320, y: 340 });
    until(game, () => Math.hypot(npc.position.x - 320, npc.position.y - 340) < 16, 300);
    game.destroy();
  });
});

describe('the ladder', () => {
  it('hears the hero beyond the wall, walks the trail around it, hunts on sight, telegraphs, strikes and recovers', async () => {
    const { game, npc, hero, behavior } = await arena({
      params: { hearingRange: 600, patience: 1.5, recover: 0.4 }
    });
    const states = new Set();
    const watch = () => { states.add(behavior.state); return false; };

    // The hero, across the wall, makes a noise. The only way there is the
    // gap at the left: the behaviour's own walk routes it.
    game.events.emit('step', { id: hero.netId, at: { x: 200, y: 80 } });
    until(game, () => (watch(), behavior.state === 'telegraph'), 1500);
    for (let i = 0; i < 1500 && behavior.state !== 'patrol'; i++) {
      game.step(1);
      watch();
      expect(inWall(npc.position)).toBe(false);
    }

    // The whole ladder ran, and the strike landed.
    expect([...states]).toEqual(expect.arrayContaining(['alert', 'telegraph', 'attack', 'recover']));
    expect(hero.getConstraint('health').currentHealth).toBeLessThan(100);
    game.destroy();
  }, 30000);

  it('a restore mid-telegraph resumes the run it rewound, bit for bit', async () => {
    const { game, npc, hero, behavior } = await arena({ params: { patience: 1.5, recover: 0.4 } });
    hero.body.setPosition({ x: 200, y: 290 });
    until(game, () => behavior.state === 'telegraph', 600);

    const snapshot = game.snapshot();
    const trace = () => {
      const t = [];
      for (let i = 0; i < 180; i++) {
        game.step(1);
        t.push([behavior.state, behavior.stateTime, npc.position.x, npc.position.y,
          hero.getConstraint('health').currentHealth]);
      }
      return t;
    };
    const first = trace();
    expect(first.some(([state]) => state === 'attack')).toBe(true);

    game.restore(snapshot);
    expect(behavior.state).toBe('telegraph');
    expect(trace()).toEqual(first);
    game.destroy();
  });

  it('the leash breaks the hunt, the walk home re-arms it, and patrol re-anchors the path', async () => {
    const { game, npc, hero, behavior } = await arena({
      at: { x: 200, y: 350 },
      params: { leash: 60, patience: 3 },
      constraints: { path: { type: 'PathFollow', params: { points: [{ x: 150, y: 350 }, { x: 250, y: 350 }], speed: 60, waitTime: 100 } } }
    });
    // Engaged inside the leash, then the hero retreats just outside it:
    // the hunt follows only to the line, and no blow ever lands.
    hero.body.setPosition({ x: 180, y: 310 });
    until(game, () => behavior.state === 'alert', 30);
    hero.body.setPosition({ x: 150, y: 222 });
    until(game, () => behavior.state === 'return', 900);
    expect(Math.hypot(npc.position.x - behavior.home.x, npc.position.y - behavior.home.y))
      .toBeLessThanOrEqual(60 + 20);
    expect(hero.getConstraint('health').currentHealth).toBe(100);

    // In plain sight but outside the leash the whole way home: the guard
    // stands down to its patrol rather than pacing the leash line forever.
    until(game, () => behavior.state === 'patrol', 900);
    for (let i = 0; i < 120; i++) {
      game.step(1);
      expect(behavior.state).toBe('patrol');
    }
    expect(npc.getConstraint('path').suspended).toBe(false);

    // Back inside the leash: the guard's business again.
    hero.body.setPosition({ x: 180, y: 310 });
    until(game, () => behavior.state === 'alert', 30);
    game.destroy();
  });
});

describe('the cast and its ownership', () => {
  it('without an attack slot the ladder never telegraphs, and a strikeRange there warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { game, npc, hero, behavior } = await arena({ prefab: 'howler', params: { strikeRange: 50 } });
    hero.body.setPosition({ x: 200, y: 290 });
    until(game, () => behavior.state === 'alert', 30);
    until(game, () => Math.hypot(npc.position.x - hero.position.x, npc.position.y - hero.position.y) < 50, 600);
    game.step(60);
    expect(behavior.state).toBe('alert');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/strikeRange with no 'attack' slot/);
    warn.mockRestore();
    game.destroy();
  });

  it('suspending the behaviour freezes the arrangement for the game to take over', async () => {
    const { game, npc, hero, behavior } = await arena({ params: { patience: 5 } });
    hero.body.setPosition({ x: 200, y: 260 });
    const chase = npc.getConstraint('chase');
    until(game, () => chase.suspended === false, 60);

    // A ward: the game suspends the behaviour and takes the chase itself.
    behavior.suspended = true;
    chase.suspended = true;
    game.step(30);
    expect(chase.suspended).toBe(true); // nothing fought the game for it
    behavior.suspended = false;
    until(game, () => chase.suspended === false, 60);
    game.destroy();
  });

  it('declares what a watcher needs replicated', () => {
    expect(Behavior.replicated).toEqual(['state', 'stateTime', 'lastSeen', 'facing', 'sinceSeen']);
  });

  it('tells its state in plain play, and lays its working state on the overlay under debug', () => {
    const game = makeTestGame();
    const npc = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'dynamic' }), null, game);
    const behavior = new Behavior(npc, { sightCone: Math.PI / 2, leash: 120 });
    npc.addConstraint('behavior', behavior);
    behavior.home = { x: 100, y: 100 };
    const overlay = game.worldOverlay;

    // Patrolling, cvars off: nothing over its head and nothing on the ground.
    game.renderer.setDebugEnabled(false);
    behavior.draw();
    expect(overlay.shapes).toHaveLength(0);
    expect(overlay.labels).toHaveLength(0);

    // On the hunt: the tell alone, with the cvars still off.
    behavior.state = 'alert';
    behavior.stateTime = 1;
    behavior.sinceSeen = 0;
    behavior.lastSeen = { x: 160, y: 100 };
    behavior.draw();
    expect(overlay.shapes).toHaveLength(0);
    expect(overlay.labels).toHaveLength(1);
    expect(overlay.labels[0].text).toBe('!');

    // Debug on: the cone, the leash, the last-seen mark and the state name.
    overlay.shapes.length = 0;
    overlay.labels.length = 0;
    game.renderer.setDebugEnabled(true);
    behavior.draw();
    expect(overlay.shapes.length).toBeGreaterThanOrEqual(3);
    expect(overlay.labels.map((label) => label.text)).toEqual(['!', 'alert']);
    game.destroy?.();
  });

  it('works with no navmesh: the walks go straight and the ladder stands', async () => {
    const { game, behavior, hero } = await arena({ mesh: false, params: { hearingRange: 400, patience: 60 } });
    game.events.emit('step', { id: hero.netId, at: { x: 320, y: 340 } });
    until(game, () => behavior.state === 'alert', 10);
    const { npc } = { npc: game.sceneManager.getCurrentScene().entitiesById.get('npc') };
    until(game, () => Math.hypot(npc.position.x - 320, npc.position.y - 340) < 16, 300);
    game.destroy();
  });
});
