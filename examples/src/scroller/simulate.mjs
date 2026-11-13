// Beeline's lane, headless, in plain Node:
//
//   node examples/src/scroller/simulate.mjs [ticks]
//
// What a server entry looks like before there is a server: the same
// game.js the browser plays, a headless engine and a client's input
// arriving as per-tick messages through the input gate. Here the client
// is a scripted autopilot. Prints the run's outcome as one JSON line.

import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { InputGate } from 'm2d-engine/net/input.js';
import { InputSnapshot } from 'm2d-engine/core/input/snapshot.js';
import { BEELINE_INPUT, register } from './game.js';

/** The lane as the editor and the page have it: the scene file, read as it is. */
const lane = JSON.parse(readFileSync(new URL('./scenes/lane.json', import.meta.url), 'utf8'));

/** A scripted client: weave up and down, push on, dash every second and a half. */
export function autopilot(tick) {
  const down = ['ArrowRight'];
  down.push(Math.floor(tick / 50) % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
  if (tick % 90 < 3) down.push('Space');
  return BEELINE_INPUT.encode(tick, InputSnapshot.from({ down }));
}

/**
 * Run the lane for `ticks` ticks, or until the bee reaches the hive or
 * runs out of hearts.
 * @returns {Promise<object>} The outcome.
 */
export async function simulate({ ticks = Infinity, seed = 1 } = {}) {
  await initPhysics();
  const game = new M2D(null, { headless: true, seed });
  register(game);
  game.sceneManager.addScene('lane', { fetch: async () => lane });
  await game.sceneManager.switchTo('lane');
  game.setupCollisionHandlers();
  const scene = game.sceneManager.getCurrentScene();
  const hive = [...game.entities].find((entity) => entity.prefab === 'hive');
  const totalPollen = scene.counters.get('total');
  let reachedAt = null;

  const gate = new InputGate(BEELINE_INPUT);
  game.input.setSnapshotSource(() => {
    const tick = game.time.steps;
    gate.submit(autopilot(tick));
    return gate.take(tick);
  });

  // The lane scrolls past in a little under four minutes; a run cannot outlast it.
  const limit = Math.min(ticks, 60 * 60 * 5);
  while (game.time.steps < limit && reachedAt === null && !game.isGameOver) {
    game.step(1);
    if (hive?.reached && reachedAt === null) reachedAt = game.time.steps;
  }

  const bee = game.player;
  const outcome = {
    ticks: game.time.steps,
    reachedAt,
    gameOver: game.isGameOver,
    bee: bee && { x: bee.position.x, y: bee.position.y, hearts: bee.hearts, pollen: bee.pollen, score: bee.score },
    totalPollen,
    rngDraws: game.rng.draws,
    gate: { missed: gate.missed, ...gate.counts }
  };
  game.destroy();
  return outcome;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticks = process.argv[2] ? Number(process.argv[2]) : Infinity;
  const outcome = await simulate({ ticks });
  process.stdout.write('\nRESULT ' + JSON.stringify(outcome) + '\n');
}
