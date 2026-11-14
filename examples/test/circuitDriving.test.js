import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register } from '../src/circuit/game.js';
import { RaceCar, CAR } from '../src/circuit/actors.js';
import { trackFor } from '../src/circuit/track.js';
import { saveBest, loadBest, raceSignature } from '../src/circuit/replay.js';

/**
 * How Night Circuit's car meets the circuit: a barrier touched at a
 * shallow angle is scraped along, not crashed into, and oil costs grip
 * and a little speed. A headless round of circuit 2, without the race
 * director, with one car placed by hand.
 */

const SCENE = JSON.parse(readFileSync(new URL('../src/circuit/scenes/circuit2.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function circuit() {
  const scene = structuredClone(SCENE);
  for (const layer of scene.layers) layer.objects = layer.objects.filter((object) => object.prefab === 'road');
  const game = new M2D(null, { headless: true, seed: 1 });
  register(game);
  game.sceneManager.addScene('c', { fetch: async () => scene });
  await game.sceneManager.switchTo('c');
  game.input.setSnapshotSource(() => ({ down: ['ArrowUp'] }));
  const track = trackFor(game.sceneManager.getCurrentScene());
  const body = game.physics.createBox({ x: 0, y: 0, width: CAR.bodyLength, height: CAR.bodyWidth, friction: 0.1, frictionAir: 0, restitution: 0.25, density: 0.004 });
  const car = new RaceCar(body, null, game, { track, marks: null });
  game.entities.add(car);
  game.physics.add(body);
  return { game, car, track };
}

/** The car aimed `degrees` off the road toward its right-hand barrier, at speed. */
function aim(car, track, degrees, speed = 500) {
  const sample = track.pose(0.12).sample;
  const heading = Math.atan2(sample.ty, sample.tx) + degrees * Math.PI / 180;
  car.body.setPosition({ x: sample.x + sample.nx * (sample.w - 40), y: sample.y + sample.ny * (sample.w - 40) });
  car.body.setAngle(heading);
  car.body.setVelocity({ x: Math.cos(heading) * speed, y: Math.sin(heading) * speed });
  return Math.atan2(sample.ty, sample.tx);
}

const speedOf = (car) => Math.hypot(car.body.velocity.x, car.body.velocity.y);

describe('Night Circuit\'s car', () => {
  it('scrapes along a barrier met at a shallow angle, keeping its speed and turning parallel', async () => {
    const { game, car, track } = await circuit();
    const along = aim(car, track, 12);
    let slowest = Infinity;
    for (let i = 0; i < 40; i++) {
      game.step(1);
      slowest = Math.min(slowest, speedOf(car));
    }
    expect(slowest).toBeGreaterThan(400);
    const gap = Math.atan2(Math.sin(car.body.angle - along), Math.cos(car.body.angle - along));
    expect(Math.abs(gap)).toBeLessThan(0.1);
    game.destroy();
  });

  it('loses a little speed on oil as well as its grip', async () => {
    const { game, car, track } = await circuit();
    aim(car, track, 0, 450);
    game.step(10);
    const before = speedOf(car);
    car.oilCount = 1;
    game.step(10);
    expect(car.surface).toBe('oil');
    const after = speedOf(car);
    expect(after).toBeLessThan(before * 0.95);
    expect(after).toBeGreaterThan(before * 0.6);
    game.destroy();
  });

});

describe('a lap\'s splits', () => {
  const stored = new Map();
  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key)
    });
  });

  async function round() {
    const game = new M2D(null, { headless: true, seed: 1 });
    Object.defineProperty(game, 'camera', { value: { follow() {}, x: 0, y: 0 } });
    game.input.on = () => () => {};
    register(game);
    game.sceneManager.addScene('circuit2', { fetch: async () => structuredClone(SCENE) });
    await game.sceneManager.switchTo('circuit2');
    game.setupCollisionHandlers();
    game.step(60 * 4);
    const director = [...game.entities].find((entity) => entity.name === 'RaceDirector');
    return { game, director };
  }

  /** Carry the car over each checkpoint in lap order, then over the line. */
  function lap(game, director) {
    const posts = [...game.entities].filter((entity) => entity.name === 'Checkpoint')
      .sort((a, b) => a.index - b.index || a.finish - b.finish);
    for (const post of [...posts.filter((p) => !p.finish), posts.find((p) => p.finish)]) {
      director.car.body.setPosition(post.body.position);
      game.step(5);
    }
  }

  it('times each checkpoint, keeps them with the best, and reads the next lap against them', async () => {
    stored.clear();
    const { game, director } = await round();
    lap(game, director);                      // arms the lap at the line
    expect(director.lapStartStep).not.toBeNull();
    lap(game, director);                      // the timed lap
    expect(director.best.splits).toHaveLength(director.checkpoints);
    expect(director.best.signature).toBe(director.signature);
    expect(director.lapSplits).toEqual([]);   // the flying start begins clean
    expect(director.split.index).toBeNull();  // the line's flash
    expect(director.split.delta).toBeNull();  // no earlier best to stand against

    lap(game, director);
    expect(typeof director.split.delta).toBe('number');
    game.destroy();
  });

  it('shows no delta against a best from before splits were kept', async () => {
    const { game, director } = await round();
    lap(game, director);
    lap(game, director);
    delete director.best.splits;              // a stored best from an older session
    const first = [...game.entities].find((entity) => entity.name === 'Checkpoint' && entity.index === 0 && !entity.finish);
    director.car.body.setPosition(first.body.position);
    game.step(5);
    expect(director.split.index).toBe(0);
    expect(director.split.delta).toBeNull();
    game.destroy();
  });
});

describe('stored bests', () => {
  const stored = new Map();
  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key)
    });
  });

  it('signs the rules and the map, blind to presentation', () => {
    const signature = raceSignature(SCENE);
    expect(raceSignature(structuredClone(SCENE))).toBe(signature);

    const relit = structuredClone(SCENE);
    relit.world.lighting = { ambient: '#ffffff' };
    relit.hud = [];
    expect(raceSignature(relit)).toBe(signature);

    const edited = structuredClone(SCENE);
    edited.layers[1].objects.find((object) => object.prefab === 'cone').x += 1;
    expect(raceSignature(edited)).not.toBe(signature);
  });

  it('drops and removes a best recorded against other rules or another map', () => {
    const signature = raceSignature(SCENE);
    const best = { signature, lapTicks: 600, lapStart: 0, lapEnd: 600, inputs: [], checks: [], splits: [120], spills: [], car: 'balanced', ghost: [] };
    saveBest('circuit2', best);
    expect(loadBest('circuit2', signature)).toMatchObject({ lapTicks: 600, splits: [120] });
    expect(loadBest('circuit2')).toMatchObject({ lapTicks: 600 });

    expect(loadBest('circuit2', 'other')).toBeNull();
    expect(loadBest('circuit2')).toBeNull();
  });
});
