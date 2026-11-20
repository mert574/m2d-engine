import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/physics';
import { M2D } from 'm2d-engine';
import { register } from '../src/scroller/game.js';
import { simulate } from '../src/scroller/simulate.mjs';

const LANE = JSON.parse(readFileSync(new URL('../src/scroller/scenes/lane.json', import.meta.url), 'utf8'));

/** The simulation's scroll front after `seconds` of a lane whose camera scrolls at `speed` and whose world is `width` long. */
async function frontAfter(seconds, { speed, width }) {
  await initPhysics();
  const lane = structuredClone(LANE);
  lane.world.camera.scrollVelocity.x = speed;
  lane.world.width = width;
  const game = new M2D(null, { headless: true, seed: 1 });
  register(game);
  game.sceneManager.addScene('lane', { fetch: async () => lane });
  await game.sceneManager.switchTo('lane');
  game.step(Math.round(seconds / game.time.fixedTimestep));
  const front = [...game.entities].find((entity) => entity.prefab === 'front');
  const centre = front.centre;
  game.destroy();
  return centre;
}

/**
 * Beeline's game.js is what a server would run. It has to load in plain
 * Node, with no DOM and none of Vite's import extensions, and the lane it
 * simulates must be a function of its input.
 */
describe('Beeline headless', () => {
  it('flies the lane from a client input stream, the same every time', async () => {
    const first = await simulate({ ticks: 600 });
    const second = await simulate({ ticks: 600 });
    expect(second).toEqual(first);
    expect(first.ticks).toBe(600);
    expect(first.bee.x).toBeGreaterThan(1000);
    expect(first.bee.pollen).toBeGreaterThan(0);
    expect(first.gate.missed).toBe(0);
  });

  it('runs as a plain node process, and agrees with this one', async () => {
    const script = fileURLToPath(new URL('../src/scroller/simulate.mjs', import.meta.url));
    const stdout = execFileSync(process.execPath, [script, '600'], { encoding: 'utf8', timeout: 60000 });
    const line = stdout.split('\n').find((l) => l.startsWith('RESULT '));
    expect(JSON.parse(line.slice('RESULT '.length))).toEqual(await simulate({ ticks: 600 }));
  });

  it('keeps the window at the pace and to the length the scene gives, retuned or not', async () => {
    // The camera scrolls at the scene's scrollVelocity; the simulation's
    // window has to keep with it, or the bee is pushed by a front the
    // screen does not show.
    expect(await frontAfter(1, { speed: 200, width: LANE.world.width })).toBeCloseTo(480 + 200, 0);
    expect(await frontAfter(1, { speed: LANE.world.camera.scrollVelocity.x, width: LANE.world.width }))
      .toBeCloseTo(480 + LANE.world.camera.scrollVelocity.x, 0);
    // A shorter lane parks the window at its own end.
    expect(await frontAfter(10, { speed: 400, width: 2000 })).toBeCloseTo(2000 - 480, 0);
  });
});
