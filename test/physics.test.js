import { describe, it, expect, beforeEach } from 'vitest';

import { createPhysicsWorld, initPhysics } from '../src/core/physics/index.js';

/**
 * Characterization tests for the physics boundary (src/core/physics/), run
 * against every backend.
 *
 * These assert the *contract*, never a solver's internals, and check
 * positions and velocities with tolerances rather than exact equality:
 * different solvers do not reproduce each other's numbers digit for digit,
 * and should not have to. A backend is correct when this file passes with its
 * name in the suite title; a failure names the behaviour that diverged.
 */

const FIXED = 1 / 60;

/** Run `seconds` of simulation as whole fixed steps. */
function simulate(world, seconds) {
  const steps = Math.round(seconds / world.fixedTimestep);
  for (let i = 0; i < steps; i++) world.step(world.fixedTimestep);
  return steps;
}

// Load the Rapier backend (WASM) once; Matter needs no initialization.
await initPhysics('rapier');

describe.each(['matter', 'rapier'])('physics world [%s]', (backendName) => {
  /** A world on the backend under test. */
  const createWorld = (options = {}) => createPhysicsWorld({ backend: backendName, ...options });

  describe('fixed-step advance', () => {
    let world;
    let stepped;

    beforeEach(() => {
      world = createWorld({ fixedTimestep: FIXED, maxSubSteps: 6 });
      stepped = [];
      world.step = (dt) => stepped.push(dt);
    });

    it('runs whole steps of exactly the fixed timestep', () => {
      world.advance(FIXED * 3);

      expect(stepped).toHaveLength(3);
      for (const dt of stepped) expect(dt).toBe(FIXED);
    });

    it('takes no step when less than one timestep has elapsed', () => {
      expect(world.advance(FIXED / 3)).toBe(0);
      expect(stepped).toHaveLength(0);
    });

    it('carries leftover time into later frames rather than dropping it', () => {
      // Three frames of two-thirds of a step is two steps' worth of time.
      world.advance(FIXED * (2 / 3));
      world.advance(FIXED * (2 / 3));
      world.advance(FIXED * (2 / 3));

      expect(stepped).toHaveLength(2);
    });

    it('simulates real time at 1x however unevenly frames are paced', () => {
      // Uneven but ordinary frames, none exceeding the engine's 0.1s clamp.
      const frames = [0.004, 0.1, 0.0167, 0.033, 0.009, 0.05, 0.021, 0.0167];
      for (const frame of frames) world.advance(frame);

      const real = frames.reduce((total, frame) => total + frame, 0);
      const simulated = stepped.reduce((total, dt) => total + dt, 0);

      // Never ahead of real time, and never more than one step behind it:
      // the shortfall is the unspent remainder sitting in the accumulator.
      expect(simulated).toBeLessThanOrEqual(real + 1e-9);
      expect(real - simulated).toBeLessThan(FIXED);
    });

    it('caps catch-up work at maxSubSteps after a long stall', () => {
      world.advance(10);

      expect(stepped).toHaveLength(6);
    });

    it('drops the backlog after a stall instead of accumulating debt', () => {
      world.advance(10);
      stepped.length = 0;

      // The next ordinary frame runs one step, not a queue of leftovers.
      world.advance(FIXED);
      expect(stepped).toHaveLength(1);
    });

    it('scales simulated time by timeScale', () => {
      const scaled = createWorld({ fixedTimestep: FIXED, timeScale: 2 });
      const scaledSteps = [];
      scaled.step = (dt) => scaledSteps.push(dt);

      scaled.advance(FIXED * 2);

      expect(scaledSteps).toHaveLength(4);
    });
  });

  describe('gravity and resting contact', () => {
    let world;

    beforeEach(() => {
      world = createWorld({ gravity: { x: 0, y: 1000 } });
    });

    it('accelerates a dynamic body downward', () => {
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(body);

      simulate(world, 0.5);

      expect(body.position.y).toBeGreaterThan(0);
      expect(body.velocity.y).toBeGreaterThan(0);
    });

    it('leaves a body still when gravity is zero', () => {
      const zeroG = createWorld({ gravity: { x: 0, y: 0 } });
      const body = zeroG.createBox({ x: 0, y: 0, width: 10, height: 10 });
      zeroG.add(body);

      simulate(zeroG, 0.5);

      expect(body.position.y).toBeCloseTo(0, 3);
    });

    it('comes to rest on a static floor at the contact position', () => {
      const floor = world.createBox({ x: 0, y: 200, width: 400, height: 20, isStatic: true });
      const box = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      world.add(floor);
      world.add(box);

      simulate(world, 3);

      // Floor top is y=190, so a 20-tall box rests centred at y=180.
      expect(box.position.y).toBeCloseTo(180, 0);
      expect(Math.abs(box.velocity.y)).toBeLessThan(0.1);
    });

    it('holds a resting body still instead of letting it drift or jitter', () => {
      const floor = world.createBox({ x: 0, y: 200, width: 400, height: 20, isStatic: true });
      const box = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      world.add(floor);
      world.add(box);
      simulate(world, 3);

      const settled = { x: box.position.x, y: box.position.y };
      simulate(world, 2);

      expect(box.position.y).toBeCloseTo(settled.y, 1);
      expect(box.position.x).toBeCloseTo(settled.x, 1);
    });
  });

  describe('bodies', () => {
    let world;

    beforeEach(() => {
      world = createWorld({ gravity: { x: 0, y: 0 } });
    });

    it('reports the size it was created with', () => {
      const box = world.createBox({ x: 5, y: 5, width: 40, height: 20 });
      const circle = world.createCircle({ x: 0, y: 0, radius: 8 });

      expect(box.size).toEqual({ x: 40, y: 20 });
      expect(circle.size).toEqual({ x: 16, y: 16 });
    });

    it('reports tight bounds, not a box swept along the velocity', () => {
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(body);
      body.setVelocity({ x: 360, y: 0 });
      world.step(FIXED);

      // A broadphase box would be ~16 wide here. Anything drawn from bounds,
      // or any half-width derived from them, depends on this being the shape.
      expect(body.bounds.max.x - body.bounds.min.x).toBeCloseTo(10, 6);
      expect(body.bounds.max.y - body.bounds.min.y).toBeCloseTo(10, 6);
      expect((body.bounds.min.x + body.bounds.max.x) / 2).toBeCloseTo(body.position.x, 6);
    });

    it('grows bounds to contain a rotated body', () => {
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10 });
      body.setAngle(Math.PI / 4);

      // A square on its corner spans its diagonal.
      expect(body.bounds.max.x - body.bounds.min.x).toBeCloseTo(10 * Math.SQRT2, 4);
    });

    it('moves at the velocity it was given', () => {
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(body);

      body.setVelocity({ x: 120, y: 0 });
      simulate(world, 1);

      // Velocity is px/second, so one second covers exactly the number set.
      expect(body.position.x).toBeCloseTo(120, 0);
    });

    it('teleports without inheriting velocity from the move', () => {
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10 });
      world.add(body);

      body.setPosition({ x: 500, y: 300 });

      expect(body.position.x).toBeCloseTo(500, 5);
      expect(body.position.y).toBeCloseTo(300, 5);
      expect(body.velocity.x).toBeCloseTo(0, 5);
      expect(body.velocity.y).toBeCloseTo(0, 5);
    });

    it('translates by a delta', () => {
      const body = world.createBox({ x: 100, y: 100, width: 10, height: 10 });
      world.add(body);

      body.translate({ x: 5, y: -3 });

      expect(body.position.x).toBeCloseTo(105, 5);
      expect(body.position.y).toBeCloseTo(97, 5);
    });

    it('rotates to a set angle', () => {
      const body = world.createBox({ x: 0, y: 0, width: 40, height: 10 });
      body.setAngle(0.75);

      expect(body.angle).toBeCloseTo(0.75, 5);
    });

    it('is not simulated until added to the world', () => {
      const gravityWorld = createWorld({ gravity: { x: 0, y: 1000 } });
      const orphan = gravityWorld.createBox({ x: 0, y: 0, width: 10, height: 10 });

      simulate(gravityWorld, 1);

      expect(orphan.position.y).toBeCloseTo(0, 5);
      expect(gravityWorld.bodies).toHaveLength(0);
    });

    it('stops being simulated once removed', () => {
      const gravityWorld = createWorld({ gravity: { x: 0, y: 1000 } });
      const body = gravityWorld.createBox({ x: 0, y: 0, width: 10, height: 10 });
      gravityWorld.add(body);
      simulate(gravityWorld, 0.5);

      const droppedTo = body.position.y;
      gravityWorld.remove(body);
      simulate(gravityWorld, 0.5);

      expect(body.position.y).toBeCloseTo(droppedTo, 5);
    });

    it('keeps static bodies immovable under collision', () => {
      // Regression guard: setting the flag alone leaves a finite inverse
      // mass, so a "static" body can still be shoved by what hits it.
      const platform = world.createBox({ x: 0, y: 0, width: 100, height: 20 });
      platform.isStatic = true;
      const bullet = world.createBox({ x: -60, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(platform);
      world.add(bullet);

      bullet.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(platform.position.x).toBeCloseTo(0, 5);
      expect(platform.position.y).toBeCloseTo(0, 5);
    });
  });

  describe('units', () => {
    // The contract is px and seconds. These pin the semantics down so a
    // backend with different native units (steps, meters) must convert
    // rather than quietly redefining what every tuning constant means.

    it('velocity round-trips in px/s', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(body);

      body.setVelocity({ x: 120, y: -30 });

      expect(body.velocity.x).toBeCloseTo(120, 5);
      expect(body.velocity.y).toBeCloseTo(-30, 5);
    });

    it('gravity is an acceleration in px/s²', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(body);

      simulate(world, 1);

      // v = a*t and s = a*t²/2, within discretization slack.
      expect(body.velocity.y).toBeCloseTo(1000, -2);
      expect(body.position.y).toBeGreaterThan(450);
      expect(body.position.y).toBeLessThan(550);
    });

    it('reports gravity back in the units it was set in', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      expect(world.gravity).toEqual({ x: 0, y: 1000 });

      world.setGravity({ x: 50, y: 0 });
      expect(world.gravity).toEqual({ x: 50, y: 0 });
    });

    it('applyImpulse changes velocity by exactly the kick, in px/s', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 32, height: 32, frictionAir: 0 });
      world.add(body);
      body.setVelocity({ x: 100, y: 0 });

      body.applyImpulse({ x: 50, y: -300 });

      expect(body.velocity.x).toBeCloseTo(150, 3);
      expect(body.velocity.y).toBeCloseTo(-300, 3);
    });

    it('applyImpulse is inert on static bodies', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const wall = world.createBox({ x: 0, y: 0, width: 10, height: 10, isStatic: true });
      world.add(wall);

      wall.applyImpulse({ x: 9999, y: 0 });
      simulate(world, 0.5);

      expect(wall.position.x).toBeCloseTo(0, 5);
    });

    it('collisionFilter reads are snapshots, not live backend state', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, category: 0x0002 });

      body.collisionFilter.category = 0x0004;

      expect(body.collisionFilter.category).toBe(0x0002);
    });
  });

  describe('collision events', () => {
    let world;
    let started;
    let ended;

    beforeEach(() => {
      world = createWorld({ gravity: { x: 0, y: 0 } });
      started = [];
      ended = [];
      world.setCollisionHandlers({
        onStart: (a, b) => started.push([a, b]),
        onEnd: (a, b) => ended.push([a, b])
      });
    });

    it('reports a start when two bodies meet, with both wrappers', () => {
      const a = world.createBox({ x: 0, y: 0, width: 20, height: 20, frictionAir: 0 });
      const b = world.createBox({ x: 100, y: 0, width: 20, height: 20, isStatic: true });
      world.add(a);
      world.add(b);

      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(started).toHaveLength(1);
      expect(new Set(started[0])).toEqual(new Set([a, b]));
    });

    it('hands back the wrappers, not raw backend bodies', () => {
      const a = world.createBox({ x: 0, y: 0, width: 20, height: 20, frictionAir: 0 });
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, isStatic: true });
      a.entity = { name: 'Player' };
      b.entity = { name: 'Platform' };
      world.add(a);
      world.add(b);

      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      const names = started[0].map((body) => body.entity.name);
      expect(names.sort()).toEqual(['Platform', 'Player']);
    });

    it('reports an end when they separate', () => {
      const a = world.createBox({ x: 0, y: 0, width: 20, height: 20, frictionAir: 0, isSensor: true });
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, isStatic: true, isSensor: true });
      world.add(a);
      world.add(b);

      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 2);

      expect(started.length).toBeGreaterThan(0);
      expect(ended.length).toBeGreaterThan(0);
    });

    it('replaces handlers rather than stacking them', () => {
      world.setCollisionHandlers({ onStart: (a, b) => started.push([a, b]) });
      world.setCollisionHandlers({ onStart: (a, b) => started.push([a, b]) });

      const a = world.createBox({ x: 0, y: 0, width: 20, height: 20, frictionAir: 0 });
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, isStatic: true });
      world.add(a);
      world.add(b);

      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(started).toHaveLength(1);
    });

    it('lets sensors report contact without resolving it', () => {
      const sensor = world.createBox({
        x: 0, y: 0, width: 40, height: 40, isStatic: true, isSensor: true
      });
      const mover = world.createBox({ x: -100, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(sensor);
      world.add(mover);

      mover.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(started.length).toBeGreaterThan(0);
      // Passed through rather than bounced off.
      expect(mover.position.x).toBeGreaterThan(0);
    });
  });

  describe('queries', () => {
    let world;

    beforeEach(() => {
      world = createWorld({ gravity: { x: 0, y: 0 } });
    });

    it('finds overlapping bodies, excluding the query body itself', () => {
      const probe = world.createCircle({ x: 0, y: 0, radius: 30 });
      const near = world.createBox({ x: 10, y: 0, width: 20, height: 20 });
      const far = world.createBox({ x: 500, y: 0, width: 20, height: 20 });
      world.add(probe);
      world.add(near);
      world.add(far);

      const contacts = world.contactsWith(probe);

      expect(contacts).toContain(near);
      expect(contacts).not.toContain(far);
      expect(contacts).not.toContain(probe);
    });

    it('narrows candidates by the filter before testing overlap', () => {
      const probe = world.createCircle({ x: 0, y: 0, radius: 30 });
      const wanted = world.createBox({ x: 10, y: 0, width: 20, height: 20 });
      const ignored = world.createBox({ x: -10, y: 0, width: 20, height: 20 });
      wanted.entity = { name: 'Enemy' };
      ignored.entity = { name: 'Scenery' };
      world.add(probe);
      world.add(wanted);
      world.add(ignored);

      const contacts = world.contactsWith(probe, (body) => body.entity?.name === 'Enemy');

      expect(contacts).toEqual([wanted]);
    });

    it('reports nothing for a body touching nothing', () => {
      const lonely = world.createBox({ x: 0, y: 0, width: 10, height: 10 });
      world.add(lonely);

      expect(world.contactsWith(lonely)).toEqual([]);
    });

    it('raycast finds a body blocking the segment', () => {
      const wall = world.createBox({ x: 50, y: 0, width: 10, height: 100, isStatic: true });
      world.add(wall);

      const hits = world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 });

      expect(hits).toContain(wall);
    });

    it('raycast reports a clear line when nothing is in the way', () => {
      const wall = world.createBox({ x: 50, y: 500, width: 10, height: 100, isStatic: true });
      world.add(wall);

      expect(world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual([]);
    });

    it('raycast honours its filter', () => {
      const wall = world.createBox({ x: 50, y: 0, width: 10, height: 100, isStatic: true });
      wall.entity = { name: 'Platform' };
      world.add(wall);

      expect(world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 },
        (body) => body.entity?.name === 'Glass')).toEqual([]);
      expect(world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 },
        (body) => body.entity?.name === 'Platform')).toEqual([wall]);
    });
  });

  describe('world lifecycle', () => {
    it('clear() empties the world but keeps it usable', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      world.add(world.createBox({ x: 0, y: 0, width: 10, height: 10 }));
      expect(world.bodies).toHaveLength(1);

      world.clear();
      expect(world.bodies).toHaveLength(0);

      world.add(world.createBox({ x: 0, y: 0, width: 10, height: 10 }));
      expect(world.bodies).toHaveLength(1);
    });

    it('reset() empties the world and keeps collision handlers bound', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const started = [];
      world.setCollisionHandlers({ onStart: (a, b) => started.push([a, b]) });
      world.add(world.createBox({ x: 0, y: 0, width: 10, height: 10 }));

      world.reset();
      expect(world.bodies).toHaveLength(0);

      const a = world.createBox({ x: 0, y: 0, width: 20, height: 20, frictionAir: 0 });
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, isStatic: true });
      world.add(a);
      world.add(b);
      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(started).toHaveLength(1);
    });

    it('reset() preserves gravity', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      world.reset();

      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10 });
      world.add(body);
      simulate(world, 0.5);

      expect(body.position.y).toBeGreaterThan(0);
    });

    it('setGravity() takes effect on the next step', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10 });
      world.add(body);
      simulate(world, 0.5);
      expect(body.position.y).toBeCloseTo(0, 3);

      world.setGravity({ x: 0, y: 1 });
      simulate(world, 0.5);

      expect(body.position.y).toBeGreaterThan(0);
    });

    it('clearContacts() drops stale pairs without removing bodies', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      world.add(world.createBox({ x: 0, y: 0, width: 10, height: 10 }));

      world.clearContacts();

      expect(world.bodies).toHaveLength(1);
    });
  });

  describe('render interpolation', () => {
    /** A body moving right at a constant speed, with nothing acting on it. */
    function movingWorld(options = {}) {
      const world = createWorld({ gravity: { x: 0, y: 0 }, ...options });
      const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(body);
      body.setVelocity({ x: 360, y: 0 });
      return { world, body };
    }

    it('reports alpha as the fraction of a step the frame sits at', () => {
      const { world } = movingWorld();

      world.advance(FIXED);
      expect(world.interpolation).toBeCloseTo(0, 6);

      world.advance(FIXED / 4);
      expect(world.interpolation).toBeCloseTo(0.25, 6);

      world.advance(FIXED / 4);
      expect(world.interpolation).toBeCloseTo(0.5, 6);
    });

    it('draws between the last two steps rather than snapping to one', () => {
      const { world, body } = movingWorld();

      world.advance(FIXED);
      const afterStep = body.position.x;
      // Half a step later, no new step has run...
      world.advance(FIXED / 2);
      expect(body.position.x).toBe(afterStep);
      // ...but the drawn position has moved on.
      expect(body.renderPosition.x).toBeGreaterThan(0);
      expect(body.renderPosition.x).toBeLessThan(afterStep);
    });

    it('advances the drawn position on every frame of a fast display', () => {
      const { world, body } = movingWorld();
      const frame = 1 / 360;
      // One step first: a body that has never been simulated has no pair of
      // transforms to blend, and correctly draws where it is.
      world.advance(FIXED);

      const drawn = [];
      for (let i = 0; i < 12; i++) {
        world.advance(frame);
        drawn.push(body.renderPosition.x);
      }

      // Twelve 360Hz frames span two 60Hz steps. Without interpolation this
      // would be two distinct values repeated six times each.
      for (let i = 1; i < drawn.length; i++) {
        expect(drawn[i]).toBeGreaterThan(drawn[i - 1]);
      }
    });

    it('does not interpolate across a teleport', () => {
      const { world, body } = movingWorld();
      world.advance(FIXED);
      world.advance(FIXED / 2);

      body.setPosition({ x: 900, y: 0 });

      expect(body.renderPosition.x).toBeCloseTo(900, 6);
      expect(body.renderPosition.y).toBeCloseTo(0, 6);
    });

    it('does not interpolate across a direct angle change', () => {
      const { world, body } = movingWorld();
      world.advance(FIXED);
      world.advance(FIXED / 2);

      body.setAngle(1.25);

      expect(body.renderAngle).toBeCloseTo(1.25, 6);
    });

    it('does not interpolate across a translate', () => {
      const { world, body } = movingWorld();
      world.advance(FIXED);
      const before = body.position.x;
      world.advance(FIXED / 2);

      body.translate({ x: 40, y: 0 });

      expect(body.renderPosition.x).toBeCloseTo(before + 40, 6);
    });

    it('draws the exact current position when interpolation is off', () => {
      const { world, body } = movingWorld({ interpolate: false });

      world.advance(FIXED);
      world.advance(FIXED / 2);

      expect(world.interpolation).toBe(1);
      expect(body.renderPosition.x).toBe(body.position.x);
      expect(body.renderAngle).toBe(body.angle);
    });

    it('shifts bounds to the drawn position so annotations track the sprite', () => {
      const { world, body } = movingWorld();
      world.advance(FIXED);
      world.advance(FIXED / 2);

      const drawn = body.renderPosition;
      const bounds = body.renderBounds;

      // Still the body's own size, just moved to where it is drawn.
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(
        body.bounds.max.x - body.bounds.min.x, 6);
      expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(drawn.x, 6);
      expect(bounds.min.x).toBeLessThan(body.bounds.min.x);
    });

    it('never draws ahead of the simulation', () => {
      const { world, body } = movingWorld();

      for (let i = 0; i < 40; i++) {
        world.advance(1 / 360);
        expect(body.renderPosition.x).toBeLessThanOrEqual(body.position.x + 1e-9);
      }
    });
  });

  describe('continuous collision detection', () => {
    // 24000 px/s is 400 px per step — two orders past a 4px wall. Whether it
    // gets through is a backend capability, so the expectation is per-backend
    // rather than part of the shared contract.
    function fireAtThinWall() {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const wall = world.createBox({ x: 100, y: 0, width: 4, height: 200, isStatic: true });
      const slug = world.createBox({ x: 0, y: 0, width: 4, height: 4, frictionAir: 0 });
      slug.bullet = true;
      world.add(wall);
      world.add(slug);

      slug.setVelocity({ x: 24000, y: 0 });
      world.step(FIXED);
      world.step(FIXED);
      return slug.position.x;
    }

    it.runIf(backendName === 'matter')('documents: no CCD, bullet bodies still tunnel', () => {
      expect(fireAtThinWall()).toBeGreaterThan(100);
    });

    it.runIf(backendName === 'rapier')('a bullet body is stopped by a thin wall', () => {
      expect(fireAtThinWall()).toBeLessThan(100);
    });
  });
});
