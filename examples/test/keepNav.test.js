import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NetClient } from 'm2d-engine/net';
import { createServer, issueTicket } from 'm2d-server';
import { KEEP_INPUT, sceneHooks } from '../src/iso/game.js';
import { scene as navMatchScene } from './fixtures/keepNavMatch.mjs';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/physics';
import { M2D } from 'm2d-engine';
import { registerKeep, KEEP_GAME } from '../src/iso/game.js';

/**
 * Cinder Keep's click to move over its baked navmesh, headless with the
 * real scene and the real project declarations: a click behind a wall
 * walks the knight around it, and a click on a wall or past the length
 * budget moves nothing — phase 2 of the pathfinding project, proven the
 * way the server runs it.
 */

const BASE = new URL('../src/iso/', import.meta.url).href;
const KEEP = JSON.parse(readFileSync(new URL('../src/iso/scenes/keep.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/iso/m2d.project.json', import.meta.url), 'utf8'));
const WALLS = KEEP.layers.flatMap((layer) => (layer.objects ?? [])
  .filter((object) => KEEP.prefabs[object.prefab]?.actor === 'Wall')
  .map((object) => ({ x: object.x, y: object.y, w: object.width, h: object.height })));

async function keep() {
  const game = new M2D(null, {
    ...KEEP_GAME, headless: true, seed: 3,
    navAgents: PROJECT.navAgents, navAreas: PROJECT.navAreas, basePath: BASE
  });
  registerKeep(game);
  game.sceneManager.addScene('keep', { fetch: async () => structuredClone(KEEP) });
  await game.sceneManager.switchTo('keep');
  game.setupCollisionHandlers();
  game.players.local.avatar = game.player;
  return game;
}

/** One tick's input: a press at a world point, then nothing. */
function clickAt(game, x, y) {
  let first = true;
  game.input.setSnapshotSource(() => {
    const pointer = { ui: { x: 0, y: 0 }, world: { x, y }, isDown: first, pressed: first, pressedButtons: first ? 1 : 0, buttons: first ? 1 : 0, type: 'mouse' };
    first = false;
    return { down: [], pressed: [], pointer };
  });
}

/** Whether a point stands inside any wall block, shrunk by a hair for touching corners. */
const inAWall = ({ x, y }) => WALLS.some((wall) =>
  Math.abs(x - wall.x) < wall.w / 2 - 1 && Math.abs(y - wall.y) < wall.h / 2 - 1);

beforeAll(async () => { await initPhysics(); });

describe("Cinder Keep's click to move", () => {
  it('loads the baked navmesh with nothing stale or missing', async () => {
    const game = await keep();
    expect(game.nav.issues).toEqual([]);
    expect(game.nav.has('knight')).toBe(true);
    game.destroy();
  });

  it('clicking behind the start room wall walks around it, never through', async () => {
    const game = await keep();
    const knight = game.player;
    const walk = knight.getConstraint('walk');
    // The start room's north wall runs along y = 2400; the click is in the
    // chamber beyond it, reached around the wall through the east corridor.
    clickAt(game, 600, 2200);
    game.step(1);
    expect(walk.moving).toBe(true);
    expect(walk.path.length).toBeGreaterThan(2);
    for (let i = 0; i < 60 * 30 && walk.moving; i++) {
      game.step(1);
      expect(inAWall(knight.position)).toBe(false);
    }
    expect(walk.moving).toBe(false);
    expect(Math.hypot(knight.position.x - 600, knight.position.y - 2200)).toBeLessThan(24);
    game.destroy();
  });

  it('a click on a wall does nothing', async () => {
    const game = await keep();
    const knight = game.player;
    const start = { ...knight.position };
    clickAt(game, 416, 2400); // a wall block of the start room
    game.step(30);
    expect(knight.getConstraint('walk').moving).toBe(false);
    expect(Math.hypot(knight.position.x - start.x, knight.position.y - start.y)).toBeLessThan(2);
    game.destroy();
  });

  it('a pack of goblins reaches the knight around the wall without stacking', async () => {
    // Four creatures in the vault at the keep's east end, the knight in
    // the hall next door: the straight line crosses the long wall between
    // them (the route around is over six times the straight line), so a
    // hunt that cannot route pushes that wall and this times out.
    const scene = structuredClone(KEEP);
    const spots = [[3400, 1440], [3440, 1440], [3400, 1500], [3440, 1500]];
    for (const [i, [x, y]] of spots.entries()) {
      scene.layers[0].objects.push({ id: `test-goblin-${i}`, prefab: 'skeleton', x, y, width: 28, height: 28 });
    }
    const game = new M2D(null, {
      ...KEEP_GAME, headless: true, seed: 3,
      navAgents: PROJECT.navAgents, navAreas: PROJECT.navAreas, basePath: BASE
    });
    registerKeep(game);
    game.sceneManager.addScene('keep', { fetch: async () => scene });
    await game.sceneManager.switchTo('keep');
    expect(game.nav.issues).toEqual([]);
    game.players.local.avatar = game.player;
    const knight = game.player;
    knight.body.setPosition({ x: 3944, y: 1480 });
    knight.body.setVelocity({ x: 0, y: 0 });
    const goblins = [...Array(4)].map((_, i) => game.sceneManager.getCurrentScene().entitiesById.get(`test-goblin-${i}`));
    // Hunt from the next room: the shipped senses are a room's worth.
    for (const goblin of goblins) {
      goblin.getConstraint('chase').detectionRange = 4000;
      const behavior = goblin.getConstraint('behavior');
      behavior.sightRange = 4000;
      behavior.hearingRange = 4000;
      behavior.patience = 4;
    }
    // The hunt starts honestly: a step heard through the wall puts the
    // pack on the trail; sight takes over where the corridor opens.
    game.events.emit('step', { id: knight.netId, at: { x: knight.position.x, y: knight.position.y } });

    for (let i = 0; i < 60 * 60; i++) {
      game.step(1);
      for (const goblin of goblins) expect(inAWall(goblin.position)).toBe(false);
      if (goblins.every((goblin) => Math.hypot(goblin.position.x - knight.position.x, goblin.position.y - knight.position.y) < 110)) break;
    }
    for (const goblin of goblins) {
      expect(Math.hypot(goblin.position.x - knight.position.x, goblin.position.y - knight.position.y)).toBeLessThan(110);
    }
    // Around the knight, not on one spot.
    for (let a = 0; a < goblins.length; a++) {
      for (let b = a + 1; b < goblins.length; b++) {
        expect(Math.hypot(
          goblins[a].position.x - goblins[b].position.x,
          goblins[a].position.y - goblins[b].position.y)).toBeGreaterThan(30);
      }
    }
    game.destroy();
  });

  it('a click past the length budget does nothing', async () => {
    const game = await keep();
    const knight = game.player;
    const walk = knight.getConstraint('walk');
    // A reachable hall ~1800 px of route away: past the 1500 px budget.
    expect(game.nav.findPath(knight.position, { x: 1800, y: 2000 }, { agent: 'knight' }).length).toBeGreaterThan(1500);
    clickAt(game, 1800, 2000);
    game.step(30);
    expect(walk.moving).toBe(false);
    // While a nearer room is taken.
    clickAt(game, 1400, 2200);
    game.step(2);
    expect(walk.moving).toBe(true);
    game.destroy();
  });
});

describe("Cinder Keep's goblins online", () => {
  const SECRET = 'n'.repeat(40);
  let server, url, client;

  beforeAll(async () => {
    server = createServer({ match: new URL('./fixtures/keepNavMatch.mjs', import.meta.url), secret: SECRET, host: '127.0.0.1' });
    url = `ws://127.0.0.1:${await server.start()}/play`;
  });

  afterAll(async () => {
    client?.stop();
    await server.stop();
  });

  async function until(check, timeout = 30000) {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeout) throw new Error('timed out waiting');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('a pack reaches the knight around the vault wall, replicated, without stacking', async () => {
    const game = new M2D(null, { headless: true, ...KEEP_GAME, navAgents: PROJECT.navAgents, basePath: BASE });
    game.netLogLevel = 0;
    registerKeep(game);
    game.sceneManager.addScene('keep', { fetch: navMatchScene, ...sceneHooks(game).keep });
    // A mutable pointer, so the test can click once the world is in: the
    // knight's steps are what tells the vault pack he is there at all.
    let click = null;
    let held = 0;
    game.input.setSnapshotSource(() => {
      const first = click !== null && held === 0;
      const at = click ?? { x: 0, y: 0 };
      const pointer = {
        ui: { x: 0, y: 0 }, world: { x: at.x, y: at.y },
        isDown: click !== null, pressed: first,
        pressedButtons: first ? 1 : 0, buttons: click ? 1 : 0, type: 'mouse'
      };
      if (click && ++held > 12) click = null;
      return { down: [], pressed: [], pointer };
    });
    // Held a dozen ticks, so the press survives the send interval.
    const clickFloor = (x, y) => { held = 0; click = { x, y }; };
    const net = await NetClient.connect(game, { url, ticket: issueTicket(SECRET, { player: 'ranger', match: 'keep' }), schema: KEEP_INPUT });
    const timer = setInterval(() => game.step(1), 1000 / 60);
    client = { stop() { clearInterval(timer); net.close(); } };

    // The knight stands at the hall's spawn point; the goblins replicate in.
    await until(() => game.players.local?.avatar && !game.sceneManager.loading);
    const knight = game.players.local.avatar;
    const goblins = () => [...game.entities].filter((entity) => entity.sceneId?.startsWith('vault-goblin'));
    await until(() => goblins().length === 4);

    // A short walk down the hall: the steps it raises are heard in the
    // vault, through the wall, and the hunt starts from them.
    const spawnAt = { ...knight.position };
    clickFloor(3944, 1280);
    await until(() => Math.hypot(knight.position.x - spawnAt.x, knight.position.y - spawnAt.y) > 40);

    // They arrive around the long wall — a hunt that cannot route pushes it
    // forever — and never stand inside one on the way.
    await until(() => {
      for (const goblin of goblins()) {
        expect(inAWall(goblin.position)).toBe(false);
      }
      return goblins().every((goblin) =>
        Math.hypot(goblin.position.x - knight.position.x, goblin.position.y - knight.position.y) < 120);
    }, 60000);

    // Around the knight, not on one spot.
    const pack = goblins();
    for (let a = 0; a < pack.length; a++) {
      for (let b = a + 1; b < pack.length; b++) {
        expect(Math.hypot(
          pack[a].position.x - pack[b].position.x,
          pack[a].position.y - pack[b].position.y)).toBeGreaterThan(26);
      }
    }
  }, 90000);
});
