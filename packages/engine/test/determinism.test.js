import { describe, it, expect, beforeAll } from 'vitest';
import { createCanvasElement, installWindowStub } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { holdKeys, releaseKeys } from './helpers/input.js';
import { M2D } from '../src/core/m2d.js';
import { Camera } from '../src/core/camera.js';
import {
  SCENE, OTHER, ARENA_ACTORS, fingerprint, CAPTURE_AT, prepareCoverage, scriptedInput, gatedInput
} from './helpers/scenarios.js';

/**
 * The simulation is a function of its ticks, not of the frames that drive
 * them. Two games with the same seed and the same input, one drawn at 30
 * frames a second and one at 144, run the same ticks in the same order and
 * end in the same state, to the bit.
 *
 * The scene is chosen to touch every path a frame rate could leak through:
 * a player on KeyboardControl (input sampling, per-tick acceleration), a
 * Bee on Chase (seeded wander targets, contact damage, stun timers), a
 * Turret (cooldowns, raycasts, spawning rockets mid-run), a MovingPlatform
 * on PathFollow (kinematic velocity, waits) and a scene timer.
 */

function displayCanvas(cssWidth, cssHeight) {
  const canvas = createCanvasElement(cssWidth, cssHeight);
  Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight });
  return canvas;
}

async function makeGame(seed = 7, hooks = {}) {
  const game = new M2D(displayCanvas(1280, 720), {
    width: 1280, height: 720, worldWidth: 1280, worldHeight: 2000,
    renderer: new RecordingRenderer(), devConsole: false, performanceStats: false, seed
  });
  for (const actor of ARENA_ACTORS) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('arena', { fetch: async () => SCENE, ...hooks });
  game.sceneManager.addScene('other', { fetch: async () => OTHER });
  await game.sceneManager.switchTo('arena');
  game.setupCollisionHandlers();
  game.running = true;
  return game;
}

/**
 * Drive `game.update` with frames of `frameMs` until `seconds` of wall
 * time have passed. Frame boundaries never line up with tick boundaries
 * unless the rate divides 60, which is the point.
 */
function run(game, frameMs, seconds) {
  let now = 1000;
  game.update(now); // seed frame
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let i = 0; i < frames; i++) {
    now += frameMs;
    game.update(now);
  }
}

beforeAll(() => {
  globalThis.document.addEventListener ??= () => {};
  globalThis.document.removeEventListener ??= () => {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  installWindowStub();
});

describe('frame-rate independence', () => {

  it('ends in the identical state at 30, 60 and 144 frames per second', async () => {
    const results = [];
    for (const frameMs of [1000 / 30, 1000 / 60, 1000 / 144]) {
      const game = await makeGame();
      holdKeys(game, 'ArrowRight', 'Space');
      let fired = 0;
      game.time.every(0.25, () => { fired++; });
      run(game, frameMs, 3);
      results.push({ frameMs, fired, print: fingerprint(game) });
      game.destroy();
    }

    const [slow, normal, fast] = results;
    // Same number of ticks, so the same simulation time...
    expect(slow.print.steps).toBe(180);
    expect(normal.print.steps).toBe(180);
    expect(fast.print.steps).toBe(180);
    // ...the same timer firings...
    expect(slow.fired).toBe(12);
    expect(fast.fired).toBe(12);
    // ...and the same world, to the bit: positions, velocities, health,
    // wander targets, cooldowns and the number of rockets in flight.
    expect(normal.print).toEqual(slow.print);
    expect(fast.print).toEqual(slow.print);
    // The scenario actually exercised what it claims to.
    expect(normal.print.entities.some((e) => e.name === 'Rocket')).toBe(true);
    expect(normal.print.draws).toBeGreaterThan(0);
    expect(normal.print.entities.find((e) => e.name === 'Player').x).toBeGreaterThan(200);
  });

  it('replays identically from the same seed and diverges from a different one', async () => {
    const a = await makeGame(11);
    const b = await makeGame(11);
    const c = await makeGame(12);
    for (const game of [a, b, c]) run(game, 1000 / 60, 3);

    expect(fingerprint(b)).toEqual(fingerprint(a));
    // The bees' wander targets come from the seed.
    const wander = (game) => fingerprint(game).entities.filter((e) => e.name === 'Bee').map((e) => e.wander);
    expect(wander(c)).not.toEqual(wander(a));
    for (const game of [a, b, c]) game.destroy();
  });

  it('a level restarted through reset() plays the same again', async () => {
    const game = await makeGame(3);
    run(game, 1000 / 60, 2);
    const first = fingerprint(game);

    game.reset();
    const scene = game.sceneManager.getCurrentScene();
    await scene.load();
    run(game, 1000 / 60, 2);

    expect(fingerprint(game)).toEqual(first);
    game.destroy();
  });
});

/** Let pending loads settle: scene switches and reloads resolve over microtasks and an awaited fetch. */
async function settle(game) {
  for (let i = 0; i < 50 && game.sceneManager.loading; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(game.sceneManager.loading).toBe(false);
}

const sceneName = (game) => game.sceneManager.getCurrentScene().config.name;

describe('re-entering a scene', () => {
  it('plays the same as entering it the first time', async () => {
    const fresh = await makeGame(3);
    holdKeys(fresh, 'ArrowRight', 'Space');
    run(fresh, 1000 / 60, 2);
    const first = fingerprint(fresh);
    fresh.destroy();

    const game = await makeGame(3);
    run(game, 1000 / 60, 1);
    await game.sceneManager.switchTo('other');
    await game.sceneManager.switchTo('arena');
    game.time.reset();
    holdKeys(game, 'ArrowRight', 'Space');
    run(game, 1000 / 60, 2);
    expect(fingerprint(game)).toEqual(first);
    game.destroy();
  });
});

describe('scene transitions inside a tick', () => {
  it('a switch from a timer runs after the tick, and the old world never steps again', async () => {
    const game = await makeGame();
    run(game, 1000 / 60, 0.5);
    const steps = game.time.steps;
    const player = game.player;
    const before = { ...player.position };

    let first, second;
    game.time.after(0, () => {
      first = game.sceneManager.switchTo('other');
      second = game.sceneManager.switchTo('arena');
    });
    // A tenth of a second: six ticks' worth, if nothing stopped them.
    game.update(1000 + 500 + 100);

    // The timer's tick counted, its step did not run, and nothing after it.
    expect(game.time.steps).toBe(steps + 1);
    expect(player.position).toEqual(before);
    // The switch has not begun: the scene that asked is still current.
    expect(sceneName(game)).toBe('arena');
    expect(game.sceneManager.loading).toBe(true);
    // One transition per tick: the first request wins.
    expect(second).toBe(first);

    await first;
    expect(sceneName(game)).toBe('other');
    expect(game.entities.size).toBe(0);
    game.destroy();
  });

  it('a switch from onFixedUpdate lets that tick finish its physics step, then stops', async () => {
    let requested = null;
    const game = await makeGame(7, {
      onFixedUpdate() {
        if (requested === null && game.time.steps === 29) requested = game.sceneManager.switchTo('other');
      }
    });
    holdKeys(game, 'ArrowRight');
    run(game, 1000 / 20, 1);

    // 50 ms frames run three ticks each: 28, 29 and 30. The switch at 29
    // finishes that tick and cancels 30.
    expect(game.time.steps).toBe(29);
    expect(sceneName(game)).toBe('arena');
    await requested;
    expect(sceneName(game)).toBe('other');
    game.destroy();
  });

  it('the game-over restart ticks nothing until the level has reloaded, then plays the same', async () => {
    const game = await makeGame(3);
    run(game, 1000 / 60, 2);
    const first = fingerprint(game);

    game.gameOver();
    holdKeys(game, 'KeyR');
    game.update(10000);
    releaseKeys(game);
    expect(game.sceneManager.loading).toBe(true);
    // Frames that arrive while the level is still loading spend no ticks.
    game.update(10016);
    game.update(10100);
    expect(game.time.steps).toBe(0);

    await settle(game);
    run(game, 1000 / 60, 2);
    expect(fingerprint(game)).toEqual(first);
    game.destroy();
  });
});

async function makeCoverageGame(sceneName, { seed = 5, input } = {}) {
  const game = new M2D(displayCanvas(1280, 720), {
    width: 1280, height: 720, worldWidth: 1280, worldHeight: 2000,
    renderer: new RecordingRenderer(), devConsole: false, performanceStats: false, seed
  });
  const capture = await prepareCoverage(game, sceneName, { input });
  return { game, capture };
}

/** Frames of `frameMs` until the capture tick has run. */
function runUntilCaptured(game, capture, frameMs, { pauseAt, slowAt } = {}) {
  let now = 1000;
  game.update(now);
  for (let frame = 0; !capture() && frame < 10000; frame++) {
    if (pauseAt !== undefined) game.paused = frame >= pauseAt && frame < pauseAt + 20;
    if (slowAt !== undefined) game.time.scale = frame >= slowAt && frame < slowAt + 40 ? 0.5 : 1;
    now += frameMs;
    game.update(now);
  }
  return capture();
}

describe('input through the server gate', () => {
  it('an honest stream and a hostile delivery of it play the scripted run exactly', async () => {
    const prints = [];
    const gates = [];
    for (const input of [scriptedInput, gatedInput(), gatedInput({ chaos: true, gates })]) {
      const { game, capture } = await makeCoverageGame('grove', { input });
      prints.push(runUntilCaptured(game, capture, 1000 / 60));
      game.destroy();
    }
    expect(prints[1]).toEqual(prints[0]);
    expect(prints[2]).toEqual(prints[0]);

    const [chaotic] = gates;
    expect(chaotic.missed).toBe(0);
    for (const outcome of ['duplicate', 'conflict', 'late', 'early']) expect(chaotic.counts[outcome]).toBeGreaterThan(50);
    expect(chaotic.counts.tick + chaotic.counts.pointer).toBeGreaterThan(50);
  });
});

describe('frame-rate independence across the engine', () => {
  for (const sceneName of ['grove', 'keep']) {
    it(`'${sceneName}' captures the identical tick at 30, 60 and 144 fps, and through a pause and slow motion`, async () => {
      const prints = [];
      for (const [frameMs, options] of [[1000 / 30], [1000 / 60], [1000 / 144], [1000 / 60, { pauseAt: 30, slowAt: 90 }]]) {
        const { game, capture } = await makeCoverageGame(sceneName);
        prints.push(runUntilCaptured(game, capture, frameMs, options));
        game.destroy();
      }
      const [slow, ...others] = prints;
      expect(slow.steps).toBe(CAPTURE_AT);
      for (const print of others) expect(print).toEqual(slow);
    });
  }

  it('the scripted run exercises what it claims to', async () => {
    const grove = await makeCoverageGame('grove');
    const print = runUntilCaptured(grove.game, grove.capture, 1000 / 60);
    grove.game.destroy();
    const find = (name) => print.entities.find((e) => e.name === name);

    const player = find('Player');
    expect(player.wards).toBe(2); // tick 60 casts, 62 is cooling down, 190 casts
    expect(player.refused).toBe(1);
    expect(player.landings).toBe(2);
    expect(player.steps).toBeGreaterThan(3);
    expect(print.gates.length).toBeGreaterThan(0); // walked through the gate
    expect(print.entities.filter((e) => e.name === 'Coin')).toHaveLength(0); // both collected
    expect(find('Car').drifting === true || Math.abs(find('Car').lateral) > 0).toBe(true);
    expect(find('Ship').boosts).toBe(2); // 20 boosts, 40 is cooling down, 140 boosts
    expect(find('Walker').arrivals).toBeGreaterThan(0);
    expect(print.draws).toBeGreaterThan(0);

    const keep = await makeCoverageGame('keep');
    const kept = runUntilCaptured(keep.game, keep.capture, 1000 / 60);
    keep.game.destroy();
    const glider = kept.entities.find((e) => e.name === 'Glider');
    expect(glider.x !== 336 || glider.y !== 400).toBe(true);
    expect(kept.entities.find((e) => e.name === 'Walker').arrivals).toBeGreaterThan(0);
  });
});

describe('a headless game', () => {
  it('plays exactly the ticks a displayed game plays', async () => {
    for (const sceneName of ['grove', 'keep']) {
      const shown = await makeCoverageGame(sceneName);
      const displayed = runUntilCaptured(shown.game, shown.capture, 1000 / 60);
      shown.game.destroy();

      const game = new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 2000, seed: 5 });
      const capture = await prepareCoverage(game, sceneName);
      expect(game.step(CAPTURE_AT)).toBe(CAPTURE_AT);
      expect(capture()).toEqual(displayed);
      game.destroy();
    }
  });
});

describe('camera smoothing', () => {
  function follow(fps, seconds, lerp = 0.1) {
    const camera = new Camera(640, 360, { lerp });
    camera.follow({ body: { position: { x: 1000, y: 500 }, renderPosition: { x: 1000, y: 500 } } });
    const dt = 1 / fps;
    for (let i = 0; i < Math.round(seconds * fps); i++) camera.update(dt);
    return camera;
  }

  it('closes the same fraction of the distance per second at any frame rate', () => {
    const at30 = follow(30, 0.5);
    const at60 = follow(60, 0.5);
    const at144 = follow(144, 0.5);
    const at240 = follow(240, 0.5);

    expect(at30.x).toBeCloseTo(at60.x, 6);
    expect(at144.x).toBeCloseTo(at60.x, 6);
    expect(at240.y).toBeCloseTo(at60.y, 6);
    // And it is actually moving, not pinned.
    expect(at60.x).toBeGreaterThan(900);
    expect(at60.x).toBeLessThan(1000);
  });

  it('keeps the feel of lerp as a per-frame fraction at 60 frames per second', () => {
    // 0.1 per frame for 30 frames: 1 - 0.9^30 of the way.
    const camera = follow(60, 0.5);
    expect(camera.x).toBeCloseTo(1000 * (1 - Math.pow(0.9, 30)), 6);
  });

  it('update() without a delta assumes a 60 Hz frame', () => {
    const camera = new Camera(640, 360, { lerp: 0.1 });
    camera.follow({ body: { position: { x: 100, y: 0 }, renderPosition: { x: 100, y: 0 } } });
    camera.update();
    expect(camera.x).toBeCloseTo(10, 9);
  });

  it('a lerp of 1 snaps and a lerp of 0 never moves', () => {
    expect(Camera.smoothing(1, 1 / 144)).toBe(1);
    expect(Camera.smoothing(0, 1 / 30)).toBe(0);
  });
});
