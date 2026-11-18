import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
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
