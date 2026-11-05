// Run by test/headless.test.js in a fresh `node` process: no test runner,
// no stubs, nothing installed on globalThis. Prints what the simulation
// captured, so the test can compare it with an in-process run.
import { initPhysics } from '../../src/core/physics/index.js';
import { M2D } from '../../src/core/m2d.js';
import { CAPTURE_AT, prepareCoverage } from '../helpers/scenarios.js';

const sceneName = process.argv[2] ?? 'grove';
await initPhysics();
const game = new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 2000, seed: 5 });
const capture = await prepareCoverage(game, sceneName);
const ticks = game.step(CAPTURE_AT);
game.destroy();

// The engine logs scene setup through console.debug, which Node prints to
// stdout; the result is the line that starts with RESULT.
process.stdout.write('\nRESULT ' + JSON.stringify({
  globals: { window: typeof window, document: typeof document, requestAnimationFrame: typeof requestAnimationFrame },
  ticks,
  capture: capture()
}) + '\n');
