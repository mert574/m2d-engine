import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { RecordingRenderer } from 'm2d-engine/test/helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from 'm2d-engine/test/helpers/environment.js';
import { CarControl } from '../src/controls/carControl.js';
import { ThrustControl } from '../src/controls/thrustControl.js';
import { GlideControl } from '../src/controls/glideControl.js';

/**
 * The genre controllers are simulation: driven by a scripted input stream
 * they reach the identical tick at 30, 60 and 144 frames per second, and a
 * restored snapshot plays on as the original did. The engine's own suite
 * proves the loop with its capabilities; this proves the kit's controllers
 * keep to the same contract — frame-rate and rate-of-delivery independence.
 */

class Car extends Entity {
  name = 'Car';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('car', new CarControl(this, { keys: { throttle: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD', handbrake: 'ShiftLeft', nitro: 'KeyN' } }));
  }
}
class Ship extends Entity {
  name = 'Ship';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.boosts = 0;
    this.addConstraint('thrust', new ThrustControl(this, {
      keys: { thrust: 'KeyI', reverse: 'KeyK', left: 'KeyJ', right: 'KeyL', boost: 'KeyC', fire: 'KeyF' },
      boostCooldown: 1.5, onBoost: () => { this.boosts++; }
    }));
  }
}
class Glider extends Entity {
  name = 'Glider';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('glide', new GlideControl(this, { grid: 32, speed: 200 }));
  }
}
class Wall extends Entity {}

const SCENE = {
  version: SCENE_VERSION, type: 'level', name: 'track',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: {
    wall: { actor: 'Wall', physics: { bodyType: 'static' } },
    car: { actor: 'Car', physics: { bodyType: 'dynamic', frictionAir: 0 } },
    ship: { actor: 'Ship', physics: { bodyType: 'dynamic', frictionAir: 0 } },
    glider: { actor: 'Glider', physics: { bodyType: 'character' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'n', prefab: 'wall', x: 640, y: 10, width: 1280, height: 20 }, { id: 's', prefab: 'wall', x: 640, y: 950, width: 1280, height: 20 },
    { id: 'w', prefab: 'wall', x: 10, y: 480, width: 20, height: 960 }, { id: 'e', prefab: 'wall', x: 1270, y: 480, width: 20, height: 960 },
    { id: 'post', prefab: 'wall', x: 240, y: 240, width: 96, height: 32 },
    { id: 'car', prefab: 'car', x: 300, y: 800, width: 48, height: 24 },
    { id: 'ship', prefab: 'ship', x: 1000, y: 200, width: 36, height: 24 },
    { id: 'glider', prefab: 'glider', x: 336, y: 400, width: 28, height: 28 }
  ] }]
};

/** Held keys per tick: [first tick, last tick, ...codes]. */
const HELD = [
  [1, 160, 'KeyW'], [50, 100, 'KeyD'], [80, 92, 'ShiftLeft'], [30, 30, 'KeyN'], [170, 220, 'KeyS'],
  [1, 120, 'KeyI'], [20, 60, 'KeyJ'], [20, 20, 'KeyC'], [40, 40, 'KeyC'], [140, 140, 'KeyC'], [150, 210, 'KeyK'],
  [5, 5, 'ArrowRight'], [70, 70, 'ArrowDown'], [130, 130, 'ArrowLeft'], [180, 180, 'ArrowUp']
];
const heldAt = (tick) => {
  const down = new Set();
  for (const [from, to, ...codes] of HELD) if (tick >= from && tick <= to) for (const code of codes) down.add(code);
  return down;
};
/** The script as a snapshot source: a pure function of the tick, edges derived. */
function scriptedInput(game) {
  return () => {
    const tick = game.time.steps;
    const down = heldAt(tick);
    const previous = heldAt(tick - 1);
    return { down: [...down], pressed: [...down].filter((c) => !previous.has(c)), released: [...previous].filter((c) => !down.has(c)) };
  };
}

const CAPTURE_AT = 240;

function fingerprint(game) {
  return [...game.entities].map((entity) => {
    const c = (slot) => entity.getConstraint(slot);
    const print = { name: entity.name, x: entity.position.x, y: entity.position.y, vx: entity.velocity.x, vy: entity.velocity.y, angle: entity.body.angle };
    if (c('car')) Object.assign(print, { forward: c('car').forwardSpeed, lateral: c('car').lateralSpeed, drifting: c('car').drifting, nitro: c('car').nitroWait });
    if (c('thrust')) Object.assign(print, { boostLeft: c('thrust').boostLeft, boostWait: c('thrust').boostWait, boosts: entity.boosts });
    if (c('glide')) Object.assign(print, { dir: c('glide').dir, queued: c('glide').queued });
    return print;
  });
}

async function makeGame() {
  const game = new M2D(displayCanvas(1280, 960), {
    width: 1280, height: 960, worldWidth: 1280, worldHeight: 960,
    renderer: new RecordingRenderer(), devConsole: false, performanceStats: false, seed: 5
  });
  for (const actor of [Wall, Car, Ship, Glider]) game.registerActor(actor.name, actor);
  let captured = null;
  game.sceneManager.addScene('track', { fetch: async () => SCENE, onFixedUpdate() { if (game.time.steps === CAPTURE_AT) captured = fingerprint(game); } });
  await game.sceneManager.switchTo('track');
  game.setupCollisionHandlers();
  game.input.setSnapshotSource(scriptedInput(game));
  game.running = true;
  return { game, capture: () => captured };
}

/** Frames of `frameMs` until the capture tick has run. */
function runUntilCaptured(game, capture, frameMs) {
  let now = 1000;
  game.update(now);
  for (let i = 0; i < 20000 && !capture(); i++) {
    now += frameMs;
    game.update(now);
  }
  return capture();
}

beforeAll(() => {
  stubDocumentListeners();
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  installWindowStub();
});

describe('the controllers under a scripted drive', () => {
  it('reach the identical tick at 30, 60 and 144 frames per second, and did what the script asked', async () => {
    const prints = [];
    for (const frameMs of [1000 / 30, 1000 / 60, 1000 / 144]) {
      const { game, capture } = await makeGame();
      prints.push(runUntilCaptured(game, capture, frameMs));
      game.destroy();
    }
    const [slow, ...others] = prints;
    expect(slow).not.toBeNull();
    for (const print of others) expect(print).toEqual(slow);
    const find = (name) => slow.find((e) => e.name === name);
    expect(find('Car').drifting === true || Math.abs(find('Car').lateral) > 0).toBe(true);
    expect(find('Ship').boosts).toBe(2); // 20 boosts, 40 is cooling down, 140 boosts
    expect(find('Glider').x !== 336 || find('Glider').y !== 400).toBe(true);
  });

  it('play on from a restored snapshot exactly as they did the first time', async () => {
    const { game, capture } = await makeGame();
    let now = 1000;
    game.update(now);
    while (game.time.steps < 100) { now += 1000 / 60; game.update(now); }
    const snapshot = game.snapshot();
    runUntilCaptured(game, capture, 1000 / 60);
    const first = capture();
    game.restore(snapshot);
    const again = await (async () => {
      let captured = null;
      // The hook captures once per run; after a restore the tick comes round again.
      const scene = game.sceneManager.getCurrentScene();
      const original = scene.config.onFixedUpdate;
      scene.config.onFixedUpdate = () => { if (game.time.steps === CAPTURE_AT) captured = fingerprint(game); };
      let t = now;
      for (let i = 0; i < 20000 && !captured; i++) { t += 1000 / 60; game.update(t); }
      scene.config.onFixedUpdate = original;
      return captured;
    })();
    expect(again).toEqual(first);
    game.destroy();
  });
});
