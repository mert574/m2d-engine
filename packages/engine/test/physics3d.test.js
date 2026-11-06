import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initPhysics, createPhysicsWorld } from '../src/core/physics/index.js';
import { Quat } from '../src/core/math.js';

/**
 * The 3D physics backend, against the same contract the 2D one keeps.
 *
 * The two are separate worlds on separate solvers, so this is a sibling of
 * `physics.test.js` rather than a rewrite of it: the same promises, asked
 * with a third axis. Where the answer differs — a quaternion instead of a
 * scalar angle, a volume instead of an area — the test says so.
 *
 * Up is +y and a unit is a metre, as in every other 3D engine and every
 * piece of 3D content, and unlike the 2D world. See rapier3dBackend.js.
 */

const STEP = 1 / 60;

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

let world = null;
afterEach(() => {
  world?.destroy();
  world = null;
});

/** A world with a floor at y = 0, spanning the origin. */
function makeWorld(options = {}) {
  world = createPhysicsWorld({ dimensions: 3, interpolate: false, ...options });
  return world;
}

/** A 10 m square slab, 0.2 m thick, whose top face is y = 0.1. */
const floor = (w, options = {}) => w.add(w.createBox({
  x: 0, y: 0, z: 0, width: 10, height: 0.2, depth: 10, bodyType: 'static', ...options
}));

const steps = (w, n, dt = STEP) => { for (let i = 0; i < n; i++) w.step(dt); };

describe('initialization', () => {
  it('refuses a dimension it does not have', async () => {
    await expect(initPhysics({ dimensions: 4 })).rejects.toThrow(/must be 2 or 3/);
  });

  it('refuses to build a world whose solver was never loaded', () => {
    // 2D is loaded by the other suites, not necessarily by this one, so the
    // check is on the error's shape rather than on which one is missing.
    expect(() => createPhysicsWorld({ dimensions: 4 }))
      .toThrow(/4D physics is not initialized/);
  });
});

describe('a 3D world', () => {
  it('says which way is up: +y', () => {
    expect(makeWorld().up).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('falls along -y under Earth gravity by default', () => {
    const w = makeWorld();
    const box = w.add(w.createBox({ x: 0, y: 2, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    steps(w, 30);
    expect(box.position.y).toBeLessThan(2);
    // Half a second of free fall is about 1.2 m; the stepped integrator
    // lands within a tenth of the closed form.
    expect(2 - box.position.y).toBeGreaterThan(1.0);
    expect(2 - box.position.y).toBeLessThan(1.3);
    // And nowhere else.
    expect(box.position.x).toBeCloseTo(0, 6);
    expect(box.position.z).toBeCloseTo(0, 6);
  });

  it('rests a body on a floor instead of through it', () => {
    const w = makeWorld();
    floor(w);
    const box = w.add(w.createBox({ x: 0, y: 3, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    steps(w, 180);
    // Floor top is y = 0.1, the box's half-height is 0.1.
    expect(box.position.y).toBeCloseTo(0.2, 2);
  });

  it('keeps a third axis under gravity on another', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 4 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    steps(w, 30);
    expect(box.position.z).toBeGreaterThan(0);
    expect(box.position.y).toBeCloseTo(0, 6);
  });

  it('reports gravity back, and takes a new one', () => {
    const w = makeWorld();
    expect(w.gravity).toEqual({ x: 0, y: -9.81, z: 0 });
    w.setGravity({ x: 1, y: 2, z: 3 });
    expect(w.gravity).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('bodies', () => {
  it('exists before it is added, and is not simulated until it is', () => {
    const w = makeWorld();
    const box = w.createBox({ x: 5, y: 6, z: 7, width: 0.2, height: 0.2, depth: 0.2 });
    expect(box.position).toEqual({ x: 5, y: 6, z: 7 });
    steps(w, 10);
    expect(box.position).toEqual({ x: 5, y: 6, z: 7 });

    w.add(box);
    steps(w, 10);
    expect(box.position.y).toBeLessThan(6);
  });

  it('carries buffered settings into the world', () => {
    const w = makeWorld();
    const box = w.createBox({ x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 });
    box.friction = 0.42;
    box.restitution = 0.25;
    box.isSensor = true;
    w.add(box);
    expect(box.friction).toBeCloseTo(0.42, 6);
    expect(box.restitution).toBeCloseTo(0.25, 6);
    expect(box.isSensor).toBe(true);
  });

  it('gives every shape a size and a mass from its volume', () => {
    const w = makeWorld();
    const box = w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.2, depth: 0.3 });
    const sphere = w.createSphere({ x: 0, y: 0, z: 0, radius: 0.05 });
    const capsule = w.createCapsule({ x: 0, y: 0, z: 0, radius: 0.05, height: 0.3 });

    expect(box.size).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    expect(sphere.size).toEqual({ x: 0.1, y: 0.1, z: 0.1 });
    expect(capsule.size).toEqual({ x: 0.1, y: 0.3, z: 0.1 });
    // Volume at the density of water, in kg; not an area.
    expect(box.mass).toBeCloseTo(0.1 * 0.2 * 0.3 * 1000, 6);
    expect(sphere.mass).toBeCloseTo((4 / 3) * Math.PI * 0.05 ** 3 * 1000, 6);
  });

  it('takes an explicit mass over the density-derived one', () => {
    const w = makeWorld();
    const box = w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 });
    box.setMass(3);
    expect(box.mass).toBeCloseTo(3, 6);
  });

  it('moves under an impulse, in proportion to its mass', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const light = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    const heavy = w.add(w.createBox({ x: 1, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    light.applyImpulse({ x: light.mass * 0.5, y: 0, z: 0 });
    heavy.applyImpulse({ x: heavy.mass * 0.5, y: 0, z: 0 });
    // Scaled by mass, both should end up at the same speed.
    expect(light.velocity.x).toBeCloseTo(0.5, 4);
    expect(heavy.velocity.x).toBeCloseTo(0.5, 4);
  });

  it('teleports with setPosition and reads back immediately', () => {
    const w = makeWorld();
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    // Values a float32 holds exactly, since that is what the solver stores.
    box.setPosition({ x: 0.5, y: 0.25, z: 0.75 });
    expect(box.position).toEqual({ x: 0.5, y: 0.25, z: 0.75 });
  });

  it('translates relative to where it is', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 1, y: 2, z: 3, width: 0.4, height: 0.4, depth: 0.4 }));
    box.translate({ x: 10, y: 20, z: 30 });
    expect(box.position).toEqual({ x: 11, y: 22, z: 33 });
  });
});

describe('rotation', () => {
  it('starts at identity and takes a quaternion', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    expect(box.rotation).toEqual(Quat.identity());

    const turn = Quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    box.setRotation(turn);
    for (const axis of ['x', 'y', 'z', 'w']) {
      expect(box.rotation[axis]).toBeCloseTo(turn[axis], 5);
    }
  });

  it('spins under angular velocity, about the axis it was given', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    box.setAngularVelocity({ x: 0, y: 2, z: 0 });
    steps(w, 10);
    expect(Math.abs(box.rotation.y)).toBeGreaterThan(0.1);
    expect(box.angularVelocity.y).toBeCloseTo(2, 2);
  });

  it('blends the drawn rotation between steps', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 }, interpolate: true });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    box.setAngularVelocity({ x: 0, y: 4, z: 0 });
    w.step(STEP);
    w.accumulator = STEP / 2;

    const drawn = box.renderRotation;
    const half = Quat.slerp(box.previous.rotation, box.rotation, 0.5);
    for (const axis of ['x', 'y', 'z', 'w']) {
      expect(drawn[axis]).toBeCloseTo(half[axis], 9);
    }
  });

  it('reports a rotation-aware AABB', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 1, height: 0.1, depth: 0.1 }));
    const flat = box.bounds;
    expect(flat.max.x - flat.min.x).toBeCloseTo(1, 2);

    box.setRotation(Quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2));
    const turned = box.bounds;
    // The long axis now runs along z.
    expect(turned.max.x - turned.min.x).toBeCloseTo(0.1, 2);
    expect(turned.max.z - turned.min.z).toBeCloseTo(1, 2);
  });
});

describe('queries', () => {
  it('finds what a body is touching, with the normal', () => {
    const w = makeWorld();
    const ground = floor(w);
    const box = w.add(w.createBox({ x: 0, y: 3, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    steps(w, 180);

    expect(w.contactsWith(box)).toContain(ground);
    const surface = w.surfacesWith(box).find(({ body }) => body === ground);
    expect(surface).toBeTruthy();
    // Pointing from the box toward the floor: down is -y.
    expect(surface.normal.y).toBeLessThan(-0.5);
  });

  it('answers a shape overlap for something that is not a body', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    expect(w.overlaps({ x: 0, y: 0, z: 0, radius: 0.05 })).toContain(box);
    expect(w.overlaps({ x: 5, y: 0, z: 0, radius: 0.05 })).not.toContain(box);
  });

  it('finds what is under a point, exactly', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    expect(w.queryPoint({ x: 0, y: 0, z: 0 })).toContain(box);
    // Just outside: no contact slack here, unlike the contact queries.
    expect(w.queryPoint({ x: 0, y: 0, z: 0.105 })).not.toContain(box);
  });

  it('sees a body added since the last step', () => {
    // The broad phase has not indexed it yet; the contract promises the
    // query sees it anyway.
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    expect(w.overlaps({ x: 0, y: 0, z: 0, radius: 0.05 })).toContain(box);
  });

  it('raycasts, nearest first, with the hit point', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const near = w.add(w.createBox({ x: 1, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    const far = w.add(w.createBox({ x: 3, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    steps(w, 1);

    const hits = w.raycast({ x: -1, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    expect(hits.map(h => h.body)).toEqual([near, far]);
    expect(hits[0].point.x).toBeCloseTo(0.9, 3);
    expect(hits[0].distance).toBeCloseTo(1.9, 3);
  });
});

describe('body types', () => {
  it('leaves a static body where it is', () => {
    const w = makeWorld();
    const wall = w.add(w.createBox({
      x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2, bodyType: 'static'
    }));
    steps(w, 60);
    expect(wall.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('drives a kinematic body at its commanded velocity', () => {
    const w = makeWorld();
    const lift = w.add(w.createBox({
      x: 0, y: 0, z: 0, width: 0.4, height: 0.1, depth: 0.4, bodyType: 'kinematic'
    }));
    lift.setVelocity({ x: 0.6, y: 0, z: 0 });
    steps(w, 60);
    expect(lift.position.x).toBeCloseTo(0.6, 2);
    // A kinematic body reads back what was asked for, not a derived value.
    expect(lift.velocity).toEqual({ x: 0.6, y: 0, z: 0 });
  });

  it('places a kinematic body exactly with setNextPosition', () => {
    const w = makeWorld();
    const lift = w.add(w.createBox({
      x: 0, y: 0, z: 0, width: 0.4, height: 0.1, depth: 0.4, bodyType: 'kinematic'
    }));
    lift.setNextPosition({ x: 0.1, y: 0.5, z: 0.2 });
    steps(w, 1);
    expect(lift.position.x).toBeCloseTo(0.1, 6);
    expect(lift.position.z).toBeCloseTo(0.2, 6);
  });
});

describe('a character', () => {
  /** A person-sized capsule, dropped a metre above the floor. */
  const makeCharacter = (w, spec = {}) => w.add(w.createCapsule({
    x: 0, y: 1, z: 0, radius: 0.3, height: 1.8, bodyType: 'character', ...spec
  }));

  it('stands on the floor and reports grounded', () => {
    const w = makeWorld();
    floor(w);
    const hero = makeCharacter(w);
    steps(w, 120);

    expect(hero.grounded).toBe(true);
    // Floor top is 0.1; the capsule's half-height is 0.9. The controller
    // holds it a hair above that.
    expect(hero.position.y).toBeCloseTo(1, 1);
    expect(hero.position.y).toBeGreaterThanOrEqual(1);
  });

  it('reports the body it is standing on', () => {
    const w = makeWorld();
    const ground = floor(w);
    const hero = makeCharacter(w);
    steps(w, 120);
    expect(hero.groundBody).toBe(ground);
  });

  it('is not grounded in the air', () => {
    const w = makeWorld();
    floor(w);
    const hero = makeCharacter(w, { y: 4 });
    steps(w, 2);
    expect(hero.grounded).toBe(false);
  });

  it('walks along the ground at its commanded speed', () => {
    const w = makeWorld();
    floor(w);
    // No drag, so a second at 1.2 m/s is 1.2 m and nothing else can
    // explain a shortfall. See the drag test below.
    const hero = makeCharacter(w, { frictionAir: 0 });
    steps(w, 60);
    const from = hero.position.x;
    hero.setVelocity({ x: 1.2, y: 0, z: 0 });
    steps(w, 60);
    expect(hero.position.x - from).toBeCloseTo(1.2, 2);
  });

  it('walks on the third axis too', () => {
    const w = makeWorld();
    floor(w);
    const hero = makeCharacter(w, { frictionAir: 0 });
    steps(w, 60);
    const from = hero.position.z;
    hero.setVelocity({ x: 0, y: 0, z: 1.2 });
    steps(w, 60);
    expect(hero.position.z - from).toBeCloseTo(1.2, 2);
  });

  it('bleeds speed to frictionAir, as a dynamic body does', () => {
    // The drag knob applies to a character's intent too, which is what
    // makes `frictionAir` mean one thing across body types.
    const w = makeWorld();
    floor(w);
    const hero = makeCharacter(w, { frictionAir: 0.01 });
    steps(w, 60);
    hero.setVelocity({ x: 1.2, y: 0, z: 0 });
    steps(w, 60);
    expect(hero.velocity.x).toBeLessThan(1.2);
    expect(hero.velocity.x).toBeGreaterThan(0.5);
  });

  it('slides along a wall rather than catching on it', () => {
    const w = makeWorld();
    floor(w);
    w.add(w.createBox({
      x: 1, y: 1, z: 0, width: 0.2, height: 2, depth: 4, bodyType: 'static'
    }));
    const hero = makeCharacter(w);
    steps(w, 60);
    const fromZ = hero.position.z;
    // Into the wall and along it at once: the wall stops x, z continues.
    hero.setVelocity({ x: 2, y: 0, z: 1.2 });
    steps(w, 60);

    expect(hero.position.x).toBeLessThan(1);
    expect(hero.position.z - fromZ).toBeGreaterThan(0.8);
  });

  it('jumps: an upward velocity is not swallowed by the ground', () => {
    const w = makeWorld();
    floor(w);
    const hero = makeCharacter(w, { frictionAir: 0 });
    steps(w, 120);
    const standing = hero.position.y;
    hero.setVelocity({ x: 0, y: 4, z: 0 });
    steps(w, 10);
    expect(hero.position.y).toBeGreaterThan(standing + 0.3);
    expect(hero.grounded).toBe(false);
  });

  it('reports no grounded answer for anything that is not a character', () => {
    const w = makeWorld();
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    expect(box.grounded).toBe(null);
  });
});

describe('lifecycle', () => {
  it('removes a body from the simulation and the queries', () => {
    const w = makeWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const box = w.add(w.createBox({ x: 0, y: 0, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    w.remove(box);
    expect(w.bodies).not.toContain(box);
    expect(w.overlaps({ x: 0, y: 0, z: 0, radius: 0.05 })).not.toContain(box);
    // Its buffered state survives, so it can be added again.
    expect(box.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('clears every body', () => {
    const w = makeWorld();
    floor(w);
    w.add(w.createBox({ x: 0, y: 1, z: 0, width: 0.1, height: 0.1, depth: 0.1 }));
    w.clear();
    expect(w.bodies).toEqual([]);
  });

  it('reports collisions to the handlers', () => {
    const w = makeWorld();
    const started = [];
    w.setCollisionHandlers({ onStart: (a, b) => started.push([a, b]) });
    const ground = floor(w);
    const box = w.add(w.createBox({ x: 0, y: 1, z: 0, width: 0.2, height: 0.2, depth: 0.2 }));
    steps(w, 120);

    expect(started.some(pair => pair.includes(box) && pair.includes(ground))).toBe(true);
  });
});
