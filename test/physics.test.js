import { describe, it, expect, beforeEach } from 'vitest';

import { createPhysicsWorld, initPhysics } from '../src/core/physics/index.js';

/**
 * Characterization tests for the physics boundary (src/core/physics/).
 *
 * These assert the *contract* — what game code is promised — never the
 * solver's internals, and check positions and velocities with tolerances
 * rather than exact equality: a solver's exact numbers are its own business
 * and shift between versions, while the behaviour described here must not.
 * A failure names the behaviour that changed.
 */

const FIXED = 1 / 60;

/** Run `seconds` of simulation as whole fixed steps. */
function simulate(world, seconds) {
  const steps = Math.round(seconds / world.fixedTimestep);
  for (let i = 0; i < steps; i++) world.step(world.fixedTimestep);
  return steps;
}

// Compile Rapier's WASM module once for the whole suite.
await initPhysics();

describe('physics world', () => {
  const createWorld = (options = {}) => createPhysicsWorld(options);

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
      const floor = world.createBox({ x: 0, y: 200, width: 400, height: 20, bodyType: 'static' });
      const box = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      world.add(floor);
      world.add(box);

      simulate(world, 3);

      // Floor top is y=190, so a 20-tall box rests centred at y=180.
      expect(box.position.y).toBeCloseTo(180, 0);
      expect(Math.abs(box.velocity.y)).toBeLessThan(0.1);
    });

    it('holds a resting body still instead of letting it drift or jitter', () => {
      const floor = world.createBox({ x: 0, y: 200, width: 400, height: 20, bodyType: 'static' });
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
      platform.bodyType = 'static';
      const bullet = world.createBox({ x: -60, y: 0, width: 10, height: 10, frictionAir: 0 });
      world.add(platform);
      world.add(bullet);

      bullet.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(platform.position.x).toBeCloseTo(0, 5);
      expect(platform.position.y).toBeCloseTo(0, 5);
    });
  });

  describe('kinematic bodies', () => {
    /** A kinematic platform with a dynamic box resting on top of it. */
    function platformWithRider() {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const platform = world.createBox({
        x: 0, y: 100, width: 200, height: 20, bodyType: 'kinematic', friction: 1
      });
      const rider = world.createBox({
        x: 0, y: 70, width: 20, height: 20, friction: 1, frictionAir: 0
      });
      world.add(platform);
      world.add(rider);
      simulate(world, 1);
      return { world, platform, rider };
    }

    it('is driven by game code, not by gravity', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const body = world.createBox({
        x: 0, y: 0, width: 20, height: 20, bodyType: 'kinematic'
      });
      world.add(body);

      simulate(world, 1);

      expect(body.position.y).toBeCloseTo(0, 3);
    });

    it('carries a rider along instead of sliding out from under it', () => {
      // The whole point of a kinematic body over a teleported static one:
      // the solver derives a velocity from the move, so contact friction
      // takes the rider with it without any bookkeeping in game code.
      const { world, platform, rider } = platformWithRider();
      const startX = rider.position.x;

      for (let i = 0; i < 60; i++) {
        platform.setNextPosition({ x: platform.position.x + 2, y: platform.position.y });
        world.step(FIXED);
      }

      expect(platform.position.x).toBeCloseTo(120, 0);
      expect(rider.position.x - startX).toBeGreaterThan(100);
    });

    it('is not shoved by what it carries', () => {
      const { world, platform } = platformWithRider();

      simulate(world, 1);

      expect(platform.position.y).toBeCloseTo(100, 3);
    });

    it('a body can be created at an angle', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const ramp = world.createBox({
        x: 0, y: 0, width: 100, height: 10, bodyType: 'static', angle: Math.PI / 4
      });
      world.add(ramp);

      expect(ramp.angle).toBeCloseTo(Math.PI / 4, 5);
      expect(ramp.renderAngle).toBeCloseTo(Math.PI / 4, 5);
      // The AABB of the rotated box, not the unrotated one.
      const extent = (100 / 2 + 10 / 2) * Math.SQRT1_2;
      expect(ramp.bounds.max.x).toBeCloseTo(extent, 3);
    });

    it('moves at a commanded velocity, one step at a time', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({
        x: 0, y: 0, width: 20, height: 20, bodyType: 'kinematic'
      });
      world.add(body);

      body.setVelocity({ x: 120, y: 0 });
      world.step(FIXED);

      expect(body.position.x).toBeCloseTo(2, 5);
      expect(body.velocity).toEqual({ x: 120, y: 0 });
    });

    it('travels the same distance however the frames fall', () => {
      // A position target is consumed once per step, so driving one from
      // frame time lurches whenever a frame runs two steps or none. A
      // velocity is integrated per step and cannot.
      const run = (frameSeconds) => {
        const world = createWorld({ gravity: { x: 0, y: 0 } });
        const body = world.createBox({
          x: 0, y: 0, width: 20, height: 20, bodyType: 'kinematic'
        });
        world.add(body);
        body.setVelocity({ x: 120, y: 0 });
        for (const dt of frameSeconds) world.advance(dt);
        return body.position.x;
      };

      const steady = run(Array(60).fill(FIXED));
      const jittery = run(Array(120).fill(FIXED / 2));
      const lumpy = run(Array(30).fill(FIXED * 2));

      expect(jittery).toBeCloseTo(steady, 5);
      expect(lumpy).toBeCloseTo(steady, 5);
    });

    it('wakes a sleeping rider when it moves out from under it', () => {
      // Sleeping is broken by contact force, and a platform pulling away
      // applies none — the rider would hang in the air.
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const platform = world.createBox({
        x: 0, y: 200, width: 200, height: 20, bodyType: 'kinematic', friction: 1
      });
      const rider = world.createBox({
        x: 0, y: 160, width: 20, height: 20, friction: 1, frictionAir: 0
      });
      world.add(platform);
      world.add(rider);
      simulate(world, 10);
      // The precondition is the whole point of the test, so assert it.
      expect(rider.rigidBody.isSleeping()).toBe(true);

      // Descend gently enough that gravity alone would keep contact.
      platform.setVelocity({ x: 0, y: 200 });
      simulate(world, 1);

      const gap = (platform.position.y - 10) - (rider.position.y + 10);
      expect(gap).toBeLessThan(2);
    });

    it('ignores setNextPosition on a non-kinematic body', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      world.add(body);

      body.setNextPosition({ x: 500, y: 0 });
      simulate(world, 0.5);

      expect(body.position.x).toBeCloseTo(0, 3);
    });

    it('reports and changes bodyType', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const body = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      expect(body.bodyType).toBe('dynamic');

      world.add(body);
      body.bodyType = 'kinematic';
      simulate(world, 0.5);

      expect(body.bodyType).toBe('kinematic');
      expect(body.position.y).toBeCloseTo(0, 3);
    });
  });

  describe('character bodies', () => {
    /** A character standing on a long static floor (top edge at y=190). */
    function groundedHero() {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      world.add(world.createBox({
        x: 0, y: 200, width: 4000, height: 20, bodyType: 'static'
      }));
      const hero = world.createCapsule({
        x: 0, y: 100, width: 32, height: 48, bodyType: 'character', frictionAir: 0.001
      });
      world.add(hero);
      simulate(world, 2);
      return { world, hero };
    }

    it('falls, lands, and reports grounded', () => {
      const { hero } = groundedHero();

      // Centre comes to rest half a height above the floor top, within the
      // sub-pixel gap the controller keeps (its offset plus normal nudge).
      expect(Math.abs(hero.position.y - (190 - 24))).toBeLessThan(1);
      expect(hero.grounded).toBe(true);
      expect(Math.abs(hero.velocity.y)).toBeLessThan(1);
    });

    it('grounded is null on every other body type', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      for (const bodyType of ['static', 'dynamic', 'kinematic']) {
        const body = world.createBox({ x: 0, y: 0, width: 10, height: 10, bodyType });
        expect(body.grounded).toBeNull();
      }
    });

    it('keeps velocity semantics: setVelocity moves it, walls zero it', () => {
      const { world, hero } = groundedHero();
      world.add(world.createBox({
        x: 200, y: 150, width: 40, height: 200, bodyType: 'static'
      }));

      for (let i = 0; i < 120; i++) {
        hero.setVelocity({ x: 240, y: hero.velocity.y });
        world.step(FIXED);
      }

      // Stopped at the wall face (x=180) less half-width, within the
      // controller's sub-pixel gap, reading back ~zero horizontal velocity —
      // and never rotated.
      expect(Math.abs(hero.position.x - (180 - 16))).toBeLessThan(1);
      expect(Math.abs(hero.velocity.x)).toBeLessThan(1);
      expect(hero.angle).toBe(0);
    });

    it('jumps against gravity and lands back', () => {
      const { world, hero } = groundedHero();
      const restY = hero.position.y;

      hero.setVelocity({ x: 0, y: -720 });
      let apex = Infinity;
      for (let i = 0; i < 20; i++) {
        world.step(FIXED);
        apex = Math.min(apex, hero.position.y);
      }
      expect(hero.grounded).toBe(false);
      expect(apex).toBeLessThan(restY - 50);

      simulate(world, 2);
      expect(hero.grounded).toBe(true);
      expect(hero.position.y).toBeCloseTo(restY, 0);
    });

    it('rides a kinematic platform without any carrying code', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const platform = world.createBox({
        x: 0, y: 200, width: 160, height: 20, bodyType: 'kinematic'
      });
      const hero = world.createCapsule({
        x: 0, y: 150, width: 32, height: 48, bodyType: 'character', frictionAir: 0.001
      });
      world.add(platform);
      world.add(hero);
      simulate(world, 1);
      const startX = hero.position.x;

      const cursor = { x: 0, y: 200 };
      for (let i = 0; i < 120; i++) {
        cursor.x += 90 * FIXED;
        platform.setNextPosition(cursor);
        // Idle input rewrites vx every frame, which is exactly what used to
        // defeat the friction-based carry.
        hero.setVelocity({ x: 0, y: hero.velocity.y });
        world.step(FIXED);
      }

      expect(hero.position.x - startX).toBeGreaterThan(120);
      expect(hero.grounded).toBe(true);
      // The ride is the platform's motion, not the character's intent.
      expect(Math.abs(hero.velocity.x)).toBeLessThan(30);
    });

    it('is not launched when a rising platform stops', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const platform = world.createBox({
        x: 0, y: 300, width: 160, height: 20, bodyType: 'kinematic'
      });
      const hero = world.createCapsule({
        x: 0, y: 250, width: 32, height: 48, bodyType: 'character', frictionAir: 0.001
      });
      world.add(platform);
      world.add(hero);
      simulate(world, 1);

      const cursor = { x: 0, y: 300 };
      for (let i = 0; i < 120; i++) {
        cursor.y -= 120 * FIXED;
        platform.setNextPosition(cursor);
        world.step(FIXED);
      }
      // Platform has stopped; the character must settle on it, not fly on.
      let highest = Infinity;
      for (let i = 0; i < 60; i++) {
        world.step(FIXED);
        highest = Math.min(highest, hero.position.y);
      }

      // A launch is tens to hundreds of px; the hard stop is allowed its
      // momentary few-px blip (half-height + controller offset + snap).
      const platformTop = platform.position.y - 10;
      expect(platformTop - highest).toBeLessThan(24 + 8);
      expect(hero.grounded).toBe(true);
      expect(hero.position.y).toBeCloseTo(platformTop - 24, 0);
    });

    it('passes through sensors and still triggers their events', () => {
      const { world, hero } = groundedHero();
      const events = [];
      world.setCollisionHandlers({ onStart: (a, b) => events.push([a, b]) });
      const coin = world.createBox({
        x: 120, y: 160, width: 16, height: 16, bodyType: 'static', isSensor: true
      });
      world.add(coin);

      for (let i = 0; i < 120; i++) {
        hero.setVelocity({ x: 150, y: hero.velocity.y });
        world.step(FIXED);
      }

      expect(hero.position.x).toBeGreaterThan(160);
      expect(events.some(([a, b]) =>
        (a === coin && b === hero) || (a === hero && b === coin))).toBe(true);
    });

    it('responds to applyImpulse by impulse / mass', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const hero = world.createBox({
        x: 0, y: 0, width: 32, height: 32, bodyType: 'character', frictionAir: 0
      });
      world.add(hero);

      hero.applyImpulse({ x: 100, y: 0 });

      expect(hero.velocity.x).toBeCloseTo(100 / hero.mass, 3);
    });
  });

  describe('render interpolation of rotation', () => {
    it('blends the short way round when rotation crosses the ±π seam', () => {
      // Angles come back wrapped, so a body spinning past π reports a ~2π
      // jump. Interpolating that raw sends the drawn sprite the long way
      // round: it snaps flat for one frame every revolution.
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 32, height: 32, frictionAir: 0 });
      world.add(body);
      body.rigidBody.setAngvel(12, true);

      let previous = body.renderAngle;
      let worstTurn = 0;
      for (let i = 0; i < 300; i++) {
        world.advance(FIXED / 3);
        const drawn = body.renderAngle;
        let turn = Math.abs(drawn - previous);
        if (turn > Math.PI) turn = Math.abs(turn - Math.PI * 2);
        worstTurn = Math.max(worstTurn, turn);
        previous = drawn;
      }

      // A third of a step at 12 rad/s is ~0.067 rad; a seam glitch is >1.
      expect(worstTurn).toBeLessThan(0.2);
    });
  });

  describe('rotation locking', () => {
    it('a lockRotation body is pushed but never spun', () => {
      // For velocity-driven actors whose sprites do not rotate: an
      // off-centre hit must still shove them, without the collider picking
      // up spin the drawn sprite will never show.
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const locked = world.createBox({
        x: 0, y: 0, width: 32, height: 32, lockRotation: true, frictionAir: 0
      });
      const shover = world.createBox({ x: -60, y: -12, width: 32, height: 32, frictionAir: 0 });
      world.add(locked);
      world.add(shover);

      shover.setVelocity({ x: 400, y: 0 });
      simulate(world, 1);

      expect(locked.position.x).toBeGreaterThan(10);
      expect(locked.angle).toBe(0);
    });

    it('an unlocked box picks up rotation from the same hit', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const free = world.createBox({ x: 0, y: 0, width: 32, height: 32, frictionAir: 0 });
      const shover = world.createBox({ x: -60, y: -12, width: 32, height: 32, frictionAir: 0 });
      world.add(free);
      world.add(shover);

      shover.setVelocity({ x: 400, y: 0 });
      simulate(world, 1);

      expect(Math.abs(free.angle)).toBeGreaterThan(0.01);
    });
  });

  describe('capsule bodies', () => {
    it('falls and rests like any other shape', () => {
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const floor = world.createBox({
        x: 0, y: 200, width: 400, height: 20, bodyType: 'static'
      });
      const capsule = world.createCapsule({ x: 0, y: 0, width: 20, height: 40 });
      world.add(floor);
      world.add(capsule);

      simulate(world, 3);

      // Floor top is y=190, and the capsule is 40 tall whatever its caps.
      expect(capsule.position.y).toBeCloseTo(170, 0);
      expect(world.contactsWith(capsule)).toContain(floor);
    });

    it('reports the bounds of the box it fits inside', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const capsule = world.createCapsule({ x: 0, y: 0, width: 20, height: 40 });
      world.add(capsule);

      expect(capsule.bounds).toEqual({
        min: { x: -10, y: -20 }, max: { x: 10, y: 20 }
      });
      expect(capsule.size).toEqual({ x: 20, y: 40 });
    });
  });

  describe('units', () => {
    // The contract is px and seconds. These pin the semantics down so a
    // solver with different native units (steps, meters) has to convert at
    // the boundary rather than quietly redefining every tuning constant.

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

    it('applyImpulse changes velocity by impulse / mass', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const body = world.createBox({ x: 0, y: 0, width: 32, height: 32, frictionAir: 0 });
      world.add(body);
      body.setVelocity({ x: 100, y: 0 });
      const m = body.mass;

      body.applyImpulse({ x: 50, y: -300 });

      expect(body.velocity.x).toBeCloseTo(100 + 50 / m, 3);
      expect(body.velocity.y).toBeCloseTo(-300 / m, 3);
    });

    it('the same impulse moves a heavy body less than a light one', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const light = world.createBox({ x: 0, y: 0, width: 32, height: 32, frictionAir: 0 });
      // Kept far apart: overlapping bodies would trade momentum and hide
      // the very difference under test.
      const heavy = world.createBox({ x: 1000, y: 0, width: 64, height: 64, frictionAir: 0 });
      world.add(light);
      world.add(heavy);

      light.applyImpulse({ x: 100, y: 0 });
      heavy.applyImpulse({ x: 100, y: 0 });

      expect(heavy.mass).toBeCloseTo(light.mass * 4, 3);
      expect(heavy.velocity.x).toBeCloseTo(light.velocity.x / 4, 3);
    });

    it('applyImpulse is inert on static bodies', () => {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const wall = world.createBox({ x: 0, y: 0, width: 10, height: 10, bodyType: 'static' });
      world.add(wall);

      wall.applyImpulse({ x: 9999, y: 0 });
      simulate(world, 0.5);

      expect(wall.position.x).toBeCloseTo(0, 5);
    });

    it('collisionFilter reads are snapshots, not live solver state', () => {
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
      const b = world.createBox({ x: 100, y: 0, width: 20, height: 20, bodyType: 'static' });
      world.add(a);
      world.add(b);

      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(started).toHaveLength(1);
      expect(new Set(started[0])).toEqual(new Set([a, b]));
    });

    it('hands back the wrappers, not raw solver bodies', () => {
      const a = world.createBox({ x: 0, y: 0, width: 20, height: 20, frictionAir: 0 });
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, bodyType: 'static' });
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
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, bodyType: 'static', isSensor: true });
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
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, bodyType: 'static' });
      world.add(a);
      world.add(b);

      a.setVelocity({ x: 300, y: 0 });
      simulate(world, 1);

      expect(started).toHaveLength(1);
    });

    it('lets sensors report contact without resolving it', () => {
      const sensor = world.createBox({
        x: 0, y: 0, width: 40, height: 40, bodyType: 'static', isSensor: true
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
      const wall = world.createBox({ x: 50, y: 0, width: 10, height: 100, bodyType: 'static' });
      world.add(wall);

      const hits = world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 });

      expect(hits.map((hit) => hit.body)).toEqual([wall]);
    });

    it('raycast reports a clear line when nothing is in the way', () => {
      const wall = world.createBox({ x: 50, y: 500, width: 10, height: 100, bodyType: 'static' });
      world.add(wall);

      expect(world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual([]);
    });

    it('raycast honours its filter', () => {
      const wall = world.createBox({ x: 50, y: 0, width: 10, height: 100, bodyType: 'static' });
      wall.entity = { name: 'Platform' };
      world.add(wall);

      expect(world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 },
        (body) => body.entity?.name === 'Glass')).toEqual([]);
      expect(world.raycast({ x: 0, y: 0 }, { x: 100, y: 0 },
        (body) => body.entity?.name === 'Platform')
        .map((hit) => hit.body)).toEqual([wall]);
    });

    it('raycast orders hits nearest first, with point and normal', () => {
      const near = world.createBox({ x: 50, y: 0, width: 10, height: 100, bodyType: 'static' });
      const far = world.createBox({ x: 150, y: 0, width: 10, height: 100, bodyType: 'static' });
      world.add(far);
      world.add(near);

      const hits = world.raycast({ x: 0, y: 0 }, { x: 300, y: 0 });

      expect(hits.map((hit) => hit.body)).toEqual([near, far]);
      // Faces are at x=45 and x=145, and both normals point back at the ray.
      expect(hits[0].distance).toBeCloseTo(45, 3);
      expect(hits[0].point.x).toBeCloseTo(45, 3);
      expect(hits[1].distance).toBeCloseTo(145, 3);
      expect(hits[0].normal.x).toBeCloseTo(-1, 3);
    });

    it('surfacesWith reports which way each contact faces', () => {
      // Normals point from the queried body towards what it touches, so the
      // floor underneath reads +y and the wall to the right reads +x.
      const me = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      const floor = world.createBox({
        x: 0, y: 20, width: 100, height: 20, bodyType: 'static'
      });
      const wall = world.createBox({
        x: 20, y: 0, width: 20, height: 100, bodyType: 'static'
      });
      world.add(me);
      world.add(floor);
      world.add(wall);

      const surfaces = world.surfacesWith(me);
      const normalOf = (body) => surfaces.find((s) => s.body === body).normal;

      expect(surfaces).toHaveLength(2);
      expect(normalOf(floor).y).toBeCloseTo(1, 3);
      expect(normalOf(wall).x).toBeCloseTo(1, 3);
    });

    it('overlaps tests a shape that is not a body in the world', () => {
      const inside = world.createBox({ x: 10, y: 0, width: 10, height: 10 });
      const outside = world.createBox({ x: 400, y: 0, width: 10, height: 10 });
      world.add(inside);
      world.add(outside);

      expect(world.overlaps({ x: 0, y: 0, radius: 30 })).toEqual([inside]);
      expect(world.overlaps({ x: 0, y: 0, width: 60, height: 60 })).toEqual([inside]);
      expect(world.bodies).toHaveLength(2);
    });

    it('queries see a body that was added but not yet stepped', () => {
      // The solver's acceleration structure only learns about a body on the
      // next step; the contract promises queries do not wait for one.
      const probe = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      world.add(probe);
      simulate(world, 0.5);
      const latecomer = world.createBox({ x: 5, y: 0, width: 20, height: 20 });
      world.add(latecomer);

      expect(world.contactsWith(probe)).toContain(latecomer);
      expect(world.overlaps({ x: 5, y: 0, radius: 5 })).toContain(latecomer);
      expect(world.raycast({ x: -100, y: 0 }, { x: 100, y: 0 })
        .map((hit) => hit.body)).toContain(latecomer);
    });

    it('queries see a body at where it was just teleported', () => {
      const probe = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      const other = world.createBox({ x: 500, y: 0, width: 20, height: 20 });
      world.add(probe);
      world.add(other);
      simulate(world, 0.5);
      expect(world.contactsWith(probe)).toEqual([]);

      other.setPosition({ x: 5, y: 0 });

      expect(world.contactsWith(probe)).toEqual([other]);
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
      const b = world.createBox({ x: 60, y: 0, width: 20, height: 20, bodyType: 'static' });
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

    it('wakes settled bodies when gravity changes', () => {
      // Sleeping is on, and the solver only integrates awake bodies — a
      // stack that had gone to sleep would otherwise hang in mid-air.
      const world = createWorld({ gravity: { x: 0, y: 1000 } });
      const floor = world.createBox({
        x: 0, y: 100, width: 400, height: 20, bodyType: 'static'
      });
      const box = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
      world.add(floor);
      world.add(box);
      simulate(world, 5);
      const settled = box.position.y;

      world.setGravity({ x: 0, y: -1000 });
      simulate(world, 1);

      expect(box.position.y).toBeLessThan(settled - 10);
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
    // 24000 px/s is 400 px per step — two orders past a 4px wall, so without
    // CCD the slug would be clean through before a contact is ever tested.
    function fireAtThinWall() {
      const world = createWorld({ gravity: { x: 0, y: 0 } });
      const wall = world.createBox({ x: 100, y: 0, width: 4, height: 200, bodyType: 'static' });
      const slug = world.createBox({ x: 0, y: 0, width: 4, height: 4, frictionAir: 0 });
      slug.bullet = true;
      world.add(wall);
      world.add(slug);

      slug.setVelocity({ x: 24000, y: 0 });
      world.step(FIXED);
      world.step(FIXED);
      return slug.position.x;
    }

    it('a bullet body is stopped by a thin wall', () => {
      expect(fireAtThinWall()).toBeLessThan(100);
    });
  });
});
