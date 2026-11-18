import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register, GAME } from '../src/yard/game.js';

/**
 * The Court — the yard's click-to-move demo, authored entirely through
 * MCP — headless in three dimensions: the baked tile-cache navmesh loads
 * clean, a click across the divider walks the capsule around it, the pond
 * (a blocked NavVolume) refuses a click, and the patrol cart cuts the
 * mesh where it stands.
 */

const BASE = new URL('../src/yard/', import.meta.url).href;
const COURT = JSON.parse(readFileSync(new URL('../src/yard/scenes/court.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/yard/m2d.project.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

async function court() {
  const game = new M2D(null, {
    ...GAME, headless: true, seed: 5,
    navAgents: PROJECT.navAgents, basePath: BASE
  });
  register(game);
  game.sceneManager.addScene('court', { fetch: async () => structuredClone(COURT) });
  await game.sceneManager.switchTo('court');
  game.players.local.avatar = game.player;
  return game;
}

/** One tick's input: a press on the 3D ground at (x, z), then nothing. */
function clickAt(game, x, z) {
  let first = true;
  game.input.setSnapshotSource(() => {
    const pointer = { ui: { x: 0, y: 0 }, world: { x, y: 0, z }, isDown: first, pressed: first, pressedButtons: first ? 1 : 0, buttons: first ? 1 : 0, type: 'mouse' };
    first = false;
    return { down: [], pressed: [], pointer };
  });
}

describe('the court', () => {
  it('loads its baked tile cache with no issues, and the cart cuts the mesh', async () => {
    const game = await court();
    expect(game.nav.issues).toEqual([]);
    expect(game.nav.has('walker')).toBe(true);
    game.step(2);
    // The patrol cart's NavObstacle stands in the tracked list.
    expect(game.nav.obstacles.size).toBe(1);
    const cart = game.sceneManager.getCurrentScene().entitiesById.get('cart');
    // Straight across the cart's own spot: refused while it stands there.
    const at = cart.position;
    expect(game.nav.findPath({ x: at.x - 1.6, y: 0, z: at.z }, { x: at.x + 1.6, y: 0, z: at.z }, { maxLength: 4 })).toBeNull();
    game.destroy();
  });

  it('a click across the divider walks the capsule around it', async () => {
    const game = await court();
    const walker = game.player;
    const walk = walker.getConstraint('walk');
    // From the west side of divider-a (x = 3) to just east of it.
    clickAt(game, 5.5, -9);
    game.step(2);
    expect(walk.moving).toBe(true);
    expect(walk.path.length).toBeGreaterThan(2);
    for (let i = 0; i < 60 * 30 && walk.moving; i++) {
      game.step(1);
      // Never inside the divider: on its line, only beyond its south end.
      if (Math.abs(walker.position.x - 3) < 0.4) expect(walker.position.z).toBeGreaterThan(0.6);
    }
    expect(walk.moving).toBe(false);
    expect(Math.hypot(walker.position.x - 5.5, walker.position.z - -9)).toBeLessThan(1);
    game.destroy();
  });

  it('a click on the pond does nothing: blocked ground is not walked to', async () => {
    const game = await court();
    const walker = game.player;
    const start = { ...walker.position };
    clickAt(game, -7, 4); // the pond's middle
    game.step(30);
    expect(walker.getConstraint('walk').moving).toBe(false);
    expect(Math.hypot(walker.position.x - start.x, walker.position.z - start.z)).toBeLessThan(0.1);
    game.destroy();
  });
});
