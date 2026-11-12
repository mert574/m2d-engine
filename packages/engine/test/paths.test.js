import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { Path } from '../src/core/path.js';

beforeAll(async () => {
  await initPhysics();
});

const near = (a, b, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

describe('Path', () => {
  it('measures a straight path by its segments', () => {
    const path = new Path({ points: [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 0 }] });
    expect(path.length).toBeCloseTo(90);
    expect(path.stops).toEqual([0, 50, 90]);
    near(path.pointAt(25), { x: 15, y: 20 });
    near(path.pointAt(70), { x: 30, y: 20 });
  });

  it('clamps an open path and wraps a closed one', () => {
    const open = new Path({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    near(open.pointAt(-5), { x: 0, y: 0 });
    near(open.pointAt(15), { x: 10, y: 0 });
    const square = new Path({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], closed: true });
    expect(square.length).toBeCloseTo(40);
    expect(square.stops).toEqual([0, 10, 20, 30]);
    near(square.pointAt(35), { x: 0, y: 5 });
    near(square.pointAt(45), { x: 5, y: 0 });
    near(square.pointAt(-5), { x: 0, y: 5 });
  });

  it('curves through every control point when smooth', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 160 }];
    const path = new Path({ points, smooth: true });
    path.stops.forEach((stop, i) => near(path.pointAt(stop), points[i], 4));
    expect(path.length).toBeGreaterThan(100 + 100 + Math.hypot(100, 60));
    const middle = path.pointAt((path.stops[1] + path.stops[2]) / 2);
    expect(Math.abs(middle.x - 100)).toBeGreaterThan(1);
  });

  it('finds the arc length nearest a point', () => {
    const path = new Path({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
    expect(path.nearest({ x: 40, y: -20 })).toBeCloseTo(40);
    expect(path.nearest({ x: 130, y: 70 })).toBeCloseTo(170);
  });

  it('keeps z when the points carry it', () => {
    const path = new Path({ points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 8 }] });
    expect(path.length).toBeCloseTo(8);
    expect(path.pointAt(2)).toEqual({ x: 0, y: 0, z: 2 });
  });
});

const level = (extra = {}) => ({
  version: SCENE_VERSION, type: 'level', name: 'level',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: { platform: { actor: 'MovingPlatform', physics: { bodyType: 'kinematic' } } },
  paths: { lift: { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] } },
  layers: [{ name: 'main', objects: [{ id: 'cart', prefab: 'platform', x: 0, y: 0, width: 40, height: 10, properties: { path: { path: 'lift', speed: 100, waitTime: 500 } } }] }],
  ...extra
});

const headless = () => new M2D(null, { headless: true, worldWidth: 640, worldHeight: 480, seed: 1 });

describe('paths in a scene', () => {
  it('validates a PathFollow reference against the scene\'s paths', () => {
    const loader = new SceneLoader(headless());
    expect(() => loader.load(level())).not.toThrow();
    const typo = level();
    typo.layers[0].objects[0].properties.path.path = 'lfit';
    expect(() => loader.load(typo)).toThrow(/no path named 'lfit' \(declared: lift\)/);
  });

  it('refuses a z in a 2D level, a path of one point and a name with a slash', () => {
    const loader = new SceneLoader(headless());
    expect(() => loader.load(level({ paths: { lift: { points: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0 }] } } })))
      .toThrow(/paths\.lift\.points\[0\]\.z.*this level is 2D/s);
    expect(() => loader.load(level({ paths: { lift: { points: [{ x: 0, y: 0 }] } } }))).toThrow(/paths\.lift\.points/);
    const slashed = level({ paths: { 'a/b': { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } } });
    slashed.layers[0].objects[0].properties.path.path = 'a/b';
    expect(() => loader.load(slashed)).toThrow(/not a valid path name/);
  });

  it('composes an instanced scene\'s paths under its prefix, placed and turned', () => {
    const game = headless();
    const room = level({ name: 'room' });
    game.sceneManager.addScene('room', { fetch: async () => room });
    const outer = level({ paths: undefined, layers: [{ name: 'main', objects: [], scenes: [{ id: 'r1', scene: 'room', x: 100, y: 50, angle: Math.PI / 2 }] }] });
    delete outer.paths;
    const loaded = new SceneLoader(game).load(outer, 'level', { scenes: { room } });
    expect(Object.keys(loaded.paths)).toEqual(['r1/lift']);
    near(loaded.paths['r1/lift'].points[1], { x: 100, y: 250 });
  });
});

/** A headless game on `scene`, the cart's position after each stretch of ticks. */
async function play(scene) {
  const game = headless();
  game.sceneManager.addScene('level', { fetch: async () => scene });
  await game.sceneManager.switchTo('level');
  const cart = game.sceneManager.getCurrentScene().entitiesById.get('cart');
  const at = (ticks) => {
    for (let left = ticks; left > 0;) left -= game.step(left);
    return { ...cart.body.position };
  };
  return { game, cart, at };
}

describe('PathFollow along a named path', () => {
  it('starts where it was placed, runs to the end, pauses, and comes back', async () => {
    const scene = level();
    scene.layers[0].objects[0].x = 60;
    const { game, at } = await play(scene);
    expect(at(1).x).toBeGreaterThanOrEqual(60);
    const end = at(110);
    near(end, { x: 200, y: 0 }, 3);
    near(at(20), end, 3);
    expect(at(60).x).toBeLessThan(200);
    near(at(110), { x: 0, y: 0 }, 3);
    game.destroy();
  });

  it('loops a closed smooth path without stopping, on the line', async () => {
    const points = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    const scene = level({ paths: { lift: { points, closed: true, smooth: true } } });
    Object.assign(scene.layers[0].objects[0].properties.path, { stopAtPoints: false, speed: 150 });
    const { game, cart, at } = await play(scene);
    const route = new Path({ points, closed: true, smooth: true });
    let last = at(30);
    for (let i = 0; i < 20; i++) {
      const now = at(30);
      expect(Math.hypot(now.x - last.x, now.y - last.y)).toBeGreaterThan(10);
      near(route.pointAt(route.nearest(now)), now, 1);
      last = now;
    }
    expect(cart.getConstraint('path').currentSpeed).toBeCloseTo(150);
    game.destroy();
  });

  it('takes a retuned waitTime in milliseconds, as the constructor does', async () => {
    const { game, cart } = await play(level());
    cart.getConstraint('path').configure({ waitTime: 250 });
    expect(cart.getConstraint('path').waitTime).toBe(0.25);
    game.destroy();
  });

  it('restores from a snapshot to the same ticks after', async () => {
    const { game, at } = await play(level());
    at(50);
    const snapshot = game.snapshot();
    const first = [at(40), at(90), at(130)];
    game.restore(snapshot);
    expect([at(40), at(90), at(130)]).toEqual(first);
    game.destroy();
  });
});
