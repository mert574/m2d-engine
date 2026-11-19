import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register, GAME } from '../src/yard/game.js';

/**
 * The court's NPCs, headless in three dimensions: the behaviour ladder on
 * the (x, z) ground plane, entirely scene data over `Prop` — a sentry
 * pacing its beat behind the east divider with a view cone and a leash, a
 * near-blind hearer by the pond that walks a heard step down around the
 * water, and a stalker in the middle ground that gives an escaped quarry
 * up and goes home.
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
  const byId = (id) => game.sceneManager.getCurrentScene().entitiesById.get(id);
  return { game, byId };
}

/** Step until `check` holds, bounded; throws past `ticks`. */
function until(game, check, ticks = 1800) {
  for (let i = 0; i < ticks; i++) {
    game.step(1);
    if (check()) return i + 1;
  }
  throw new Error(`not reached within ${ticks} ticks`);
}

const apart = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

describe("the court's NPCs", () => {
  it('the sentry walks its beat and never leaves patrol while the walker stays out of the east strip', async () => {
    const { game, byId } = await court();
    const sentry = byId('sentry');
    const behavior = sentry.getConstraint('behavior');
    const from = { ...sentry.position };
    game.step(600);
    expect(behavior.state).toBe('patrol');
    // It walks the beat, on the ground: z moves, y stays a capsule's height.
    expect(Math.abs(sentry.position.z - from.z)).toBeGreaterThan(2);
    expect(sentry.position.y).toBeLessThan(1.5);
    game.destroy();
  });

  it('the sentry spots a walker in its cone, hunts on the ground plane, and its leash brings it back to the beat', async () => {
    const { game, byId } = await court();
    const sentry = byId('sentry');
    const walker = game.player;
    const behavior = sentry.getConstraint('behavior');
    // Into the east strip, in the open: seen within a sense tick or two.
    walker.body.setPosition({ x: 12, y: 0.9, z: -4 });
    until(game, () => behavior.state === 'alert', 120);
    // The hunt is Chase's, on (x, z): it closes in and keeps its feet.
    const before = apart(sentry, walker);
    until(game, () => apart(sentry, walker) < before - 1.5, 240);
    expect(sentry.position.y).toBeLessThan(1.5);

    // The walker flees the strip far past the leash: the sentry returns
    // to its beat and patrols again rather than crossing the court.
    walker.body.setPosition({ x: -12, y: 0.9, z: -9 });
    until(game, () => behavior.state === 'patrol', 1800);
    expect(Math.abs(sentry.position.x - 12)).toBeLessThan(3);
    game.destroy();
  });

  it('the hearer walks a heard step down around the pond it cannot cross', async () => {
    const { game, byId } = await court();
    const hearer = byId('hearer');
    const behavior = hearer.getConstraint('behavior');
    // A step on the pond's far side, within earshot: the pond is a blocked
    // volume, so the route around it is the only way there.
    const step = { x: -3, y: 0, z: 8 };
    game.events.emit('step', { id: game.player.netId, at: step });
    until(game, () => behavior.state === 'alert', 30);
    expect(behavior.lastSeen).toMatchObject({ x: -3, z: 8 });
    until(game, () => Math.hypot(hearer.position.x - step.x, hearer.position.z - step.z) < 1.2, 1200);
    // Never through the water: the pond spans x -9.5..-4.5, z 2..6.
    game.destroy();
  });

  it('the stalker hunts a seen walker and gives up an escaped one, going home', async () => {
    const { game, byId } = await court();
    const stalker = byId('stalker');
    const behavior = stalker.getConstraint('behavior');
    const walker = game.player;
    const home = { x: 6, z: 1 };
    // Seen in the middle ground.
    walker.body.setPosition({ x: 6, y: 0.9, z: 4 });
    until(game, () => behavior.state === 'alert', 60);
    // The walker vanishes behind the west divider, far away: patience runs
    // out, the trail ends, and the stalker walks home to its wander.
    walker.body.setPosition({ x: -13, y: 0.9, z: -10 });
    until(game, () => behavior.state === 'return', 1800);
    until(game, () => behavior.state === 'patrol', 1800);
    expect(Math.hypot(stalker.position.x - home.x, stalker.position.z - home.z)).toBeLessThan(3);
    game.destroy();
  });

  it('the walker’s own footsteps carry z, so a 3D listener hears them where they land', async () => {
    const { game } = await court();
    const walker = game.player;
    walker.getConstraint('steps').step();
    const [{ name, data }] = game.events.sinceData(game.events.raised - 1);
    expect(name).toBe('step');
    expect(data.at.z).toBeDefined();
    game.destroy();
  });
});
