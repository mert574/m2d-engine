import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register } from '../src/circuit/game.js';
import { RaceCar, CAR, IceStretch } from '../src/circuit/actors.js';
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

async function circuit({ ice = false } = {}) {
  const scene = structuredClone(SCENE);
  for (const layer of scene.layers) layer.objects = layer.objects.filter((object) => object.prefab === 'road');
  if (ice) {
    // A sheet over the stretch the tests drive on.
    scene.prefabs.ice = { actor: 'IceStretch', physics: { bodyType: 'static', isSensor: true } };
    scene.layers[0].objects.push({ id: 'ice-1', prefab: 'ice', x: 0, y: 0, width: 16, height: 16, properties: { path: 'road', from: 0.08, to: 0.2 } });
  }
  const game = new M2D(null, { headless: true, seed: 1 });
  register(game);
  game.sceneManager.addScene('c', { fetch: async () => scene });
  await game.sceneManager.switchTo('c');
  game.input.setSnapshotSource(() => ({ down: ['ArrowUp'] }));
  const current = game.sceneManager.getCurrentScene();
  const track = trackFor(current);
  const stretches = [...game.entities].filter((entity) => entity instanceof IceStretch);
  const body = game.physics.createBox({ x: 0, y: 0, width: CAR.bodyLength, height: CAR.bodyWidth, friction: 0.1, frictionAir: 0, restitution: 0.25, density: 0.004 });
  const car = new RaceCar(body, null, game, {
    track, marks: null, control: { autoThrottle: true },
    surfaceAt: stretches.length ? (x, y) => (stretches.some((stretch) => stretch.covers(track, x, y)) ? 'ice' : null) : null
  });
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

  it('drives itself: full throttle with no key held, lifting only to brake', async () => {
    const { game, car, track } = await circuit();
    game.input.setSnapshotSource(() => null);
    aim(car, track, 0, 0);
    game.step(90);
    expect(speedOf(car)).toBeGreaterThan(300);
    game.input.setSnapshotSource(() => ({ down: ['ArrowDown'] }));
    game.step(45);
    expect(speedOf(car)).toBeLessThan(60);
    game.destroy();
  });

  it('slides on ice where it would have gripped on asphalt', async () => {
    const onIce = await circuit({ ice: true });
    const dry = await circuit();
    for (const { game, car, track } of [onIce, dry]) {
      game.input.setSnapshotSource(() => ({ down: ['ArrowRight'] }));
      aim(car, track, 0, 450);
      game.step(30);
    }
    expect(onIce.car.surface).toBe('ice');
    expect(dry.car.surface).toBe('road');
    expect(Math.abs(onIce.car.drive.lateralSpeed)).toBeGreaterThan(Math.abs(dry.car.drive.lateralSpeed) * 2);
    onIce.game.destroy();
    dry.game.destroy();
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
    // Just past the green light, before the car has driven itself anywhere.
    game.step(183);
    const director = [...game.entities].find((entity) => entity.name === 'RaceDirector');
    expect(director.mode).toBe('live');
    director.car.drive.autoThrottle = false;
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

  it('draws the personal-best ghost from the director, over the road', async () => {
    const { game, director } = await round();
    const drawn = [];
    Object.defineProperty(game, 'renderer', { value: { drawSprite: (sprite) => drawn.push(sprite) } });
    director.ghost.image = { width: 32, height: 64 };
    director.ghost.start([100, 200, 0.5, 110, 205, 0.6]);
    director.ghost.tick();
    director.draw();
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ x: 110, y: 205, globalAlpha: 0.45 });
    expect(director.visible).toBe(true);
    expect(director.zIndex).toBeGreaterThan(0);
    game.destroy();
  });

  it('tags a replay quietly instead of announcing it', async () => {
    const { game, director } = await round();
    lap(game, director);
    lap(game, director);
    director.startReplay();
    game.step(183);
    expect(director.mode).toBe('replay');
    expect(director.tag).toMatch(/replay/);
    expect(director.announcement).not.toMatch(/REPLAY/);
    game.step(60 * 4);                        // a recording a few ticks long has played out, and the next round is counting down
    expect(director.lastVerdict).toMatch(/replay (matched|diverged|finished)/);
    expect(director.announcement).not.toMatch(/replay/i);
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
