import { describe, it, expect, beforeAll } from 'vitest';
import { createCanvasElement, installWindowStub } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { holdKeys } from './helpers/input.js';
import { M2D } from '../src/core/m2d.js';
import { Player } from '../src/actors/player.js';
import { Bee } from '../src/actors/bee.js';
import { Turret } from '../src/actors/turret.js';
import { Platform } from '../src/actors/platform.js';
import { MovingPlatform } from '../src/actors/movingPlatform.js';
import { Camera } from '../src/core/camera.js';

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

const SCENE = {
  version: 1, type: 'level', name: 'arena',
  world: { gravity: { x: 0, y: 900 } },
  prefabs: {
    floor: { actor: 'Platform', physics: { bodyType: 'static', friction: 0.6 } },
    player: { actor: 'Player', physics: { bodyType: 'dynamic', lockRotation: true, friction: 0.6 } },
    bee: { actor: 'Bee', physics: { bodyType: 'dynamic', frictionAir: 0.05 } },
    turret: { actor: 'Turret', physics: { bodyType: 'static' } },
    lift: { actor: 'MovingPlatform', physics: { bodyType: 'kinematic' } }
  },
  layers: [{ name: 'main', objects: [
    { prefab: 'floor', x: 640, y: 700, width: 1280, height: 40 },
    { prefab: 'player', x: 200, y: 640, width: 32, height: 48 },
    { prefab: 'bee', x: 420, y: 560, width: 32, height: 32 },
    { prefab: 'bee', x: 700, y: 500, width: 32, height: 32 },
    { prefab: 'turret', x: 1000, y: 660, width: 32, height: 32, properties: { fireRate: 0.4, detectionRange: 1200 } },
    { prefab: 'lift', x: 500, y: 620, width: 120, height: 16, properties: {
      path: { points: [{ x: 500, y: 620 }, { x: 650, y: 520 }], speed: 120, waitTime: 300 }
    } }
  ] }]
};

async function makeGame(seed = 7) {
  const game = new M2D(displayCanvas(1280, 720), {
    width: 1280, height: 720, worldWidth: 1280, worldHeight: 2000,
    renderer: new RecordingRenderer(), devConsole: false, performanceStats: false, seed
  });
  for (const actor of [Player, Bee, Turret, Platform, MovingPlatform]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('arena', { fetch: async () => SCENE });
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

/** Everything the simulation is made of, as plain numbers, in a stable order. */
function fingerprint(game) {
  const entities = [...game.entities].map((entity) => ({
    name: entity.name,
    x: entity.position.x, y: entity.position.y,
    vx: entity.velocity.x, vy: entity.velocity.y,
    angle: entity.body.angle,
    health: entity.getConstraint('health')?.currentHealth,
    wander: entity.getConstraint('chase')?.target,
    cooldown: entity.fireCooldown
  }));
  return {
    steps: game.time.steps,
    elapsed: game.time.elapsed,
    draws: game.rng.draws,
    entities
  };
}

describe('frame-rate independence', () => {
  beforeAll(() => {
    globalThis.document.addEventListener ??= () => {};
    globalThis.document.removeEventListener ??= () => {};
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    installWindowStub();
  });

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
