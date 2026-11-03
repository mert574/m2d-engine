import { describe, it, expect, vi } from 'vitest';

import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { CarControl } from '../src/constraints/carControl.js';
import { holdKeys, releaseKeys } from './helpers/input.js';

/**
 * The arcade car model: drive and brakes on the forward axis, grip as the
 * death rate of the lateral axis, the handbrake as a grip cut. Everything
 * runs on the fixed tick with the sampled input, so the headline property
 * is the last test: identical inputs give an identical trajectory.
 */

const FIXED = 1 / 60;

function makeCar(options = {}) {
  const game = makeTestGame();
  game.physics.setGravity({ x: 0, y: 0 });
  const body = makeBody(game, 0, 0, 64, 36, { friction: 0, frictionAir: 0 });
  game.physics.add(body);
  const entity = new Entity(body, null, game);
  const drive = new CarControl(entity, options);
  entity.addConstraint('drive', drive);
  return { game, body, entity, drive };
}

/** One engine-shaped tick: sample input, fixedUpdate, physics step. */
function tick(game, entity) {
  game.input.sample();
  entity.fixedUpdate(FIXED);
  game.physics.step(FIXED);
}

function run(game, entity, seconds) {
  for (let i = 0; i < Math.round(seconds / FIXED); i++) tick(game, entity);
}

describe('CarControl', () => {
  it('accelerates along its heading up to the speed cap', () => {
    const { game, body, entity, drive } = makeCar({ acceleration: 400, maxSpeed: 300 });
    holdKeys(game, 'ArrowUp');

    run(game, entity, 3);

    expect(body.position.x).toBeGreaterThan(400);
    expect(Math.abs(body.position.y)).toBeLessThan(1);
    expect(drive.forwardSpeed).toBeCloseTo(300, 0);

    releaseKeys(game);
  });

  it('coasts to a stop and brakes much faster', () => {
    const coast = makeCar();
    holdKeys(coast.game, 'ArrowUp');
    run(coast.game, coast.entity, 2);
    releaseKeys(coast.game);
    run(coast.game, coast.entity, 1);
    const coastSpeed = coast.drive.forwardSpeed;

    const braked = makeCar();
    holdKeys(braked.game, 'ArrowUp');
    run(braked.game, braked.entity, 2);
    releaseKeys(braked.game);
    holdKeys(braked.game, 'ArrowDown');
    run(braked.game, braked.entity, 1);

    expect(coastSpeed).toBeGreaterThan(100);        // coasting barely slows
    // Braking stopped the car long ago; held past the stop it reverses,
    // capped at maxReverse — the one-pedal arcade reading.
    expect(braked.drive.forwardSpeed).toBeLessThanOrEqual(0);
    expect(braked.drive.forwardSpeed).toBeGreaterThanOrEqual(-braked.drive.maxReverse - 1);
    releaseKeys(braked.game);
  });

  it('reverses when braking from a standstill', () => {
    const { game, body, entity } = makeCar();
    holdKeys(game, 'ArrowDown');
    run(game, entity, 1.5);
    expect(body.position.x).toBeLessThan(-20);
    releaseKeys(game);
  });

  it('cannot steer standing still, and turns with speed', () => {
    const still = makeCar();
    holdKeys(still.game, 'ArrowRight');
    run(still.game, still.entity, 1);
    expect(Math.abs(still.body.angle)).toBeLessThan(0.01);
    releaseKeys(still.game);

    const moving = makeCar();
    holdKeys(moving.game, 'ArrowUp', 'ArrowRight');
    run(moving.game, moving.entity, 1);
    expect(moving.body.angle).toBeGreaterThan(0.5);
    releaseKeys(moving.game);
  });

  it('grips through a turn, and slides through it on the handbrake', () => {
    // Same manoeuvre twice: full speed, hard right. With grip the velocity
    // follows the nose; with the handbrake the car keeps travelling the way
    // it was going while the nose turns — the lateral speed is the drift.
    const grippy = makeCar();
    holdKeys(grippy.game, 'ArrowUp');
    run(grippy.game, grippy.entity, 2);
    holdKeys(grippy.game, 'ArrowRight');
    run(grippy.game, grippy.entity, 0.5);
    const grippedLateral = Math.abs(grippy.drive.lateralSpeed);
    releaseKeys(grippy.game);

    const drifty = makeCar();
    holdKeys(drifty.game, 'ArrowUp');
    run(drifty.game, drifty.entity, 2);
    holdKeys(drifty.game, 'ArrowRight', 'Space');
    run(drifty.game, drifty.entity, 0.5);
    const driftLateral = Math.abs(drifty.drive.lateralSpeed);

    expect(grippedLateral).toBeLessThan(grippy.drive.driftThreshold);
    expect(driftLateral).toBeGreaterThan(grippedLateral * 2);
    expect(drifty.drive.drifting).toBe(true);
    releaseKeys(drifty.game);
  });

  it('reports the drift through the callback, both edges', () => {
    const onDrift = vi.fn();
    const { game, entity } = makeCar({ onDrift });
    holdKeys(game, 'ArrowUp');
    run(game, entity, 2);
    holdKeys(game, 'ArrowRight', 'Space');
    run(game, entity, 0.6);
    expect(onDrift).toHaveBeenCalledWith(true);

    releaseKeys(game);
    holdKeys(game, 'ArrowUp');
    run(game, entity, 1.5);
    expect(onDrift).toHaveBeenCalledWith(false);
    releaseKeys(game);
  });

  it('slides on a low-grip surface without any handbrake', () => {
    const { game, entity, drive } = makeCar();
    holdKeys(game, 'ArrowUp');
    run(game, entity, 2);
    drive.surfaceGrip = 0.15;                       // the oil slick
    holdKeys(game, 'ArrowRight');
    run(game, entity, 0.5);

    expect(Math.abs(drive.lateralSpeed)).toBeGreaterThan(drive.driftThreshold);
    releaseKeys(game);
  });

  it('burns nitro for its duration and waits out the cooldown', () => {
    const { game, entity, drive } = makeCar({
      maxSpeed: 300, nitroBoost: 1.5, nitroDuration: 0.5, nitroCooldown: 2
    });
    holdKeys(game, 'ArrowUp');
    run(game, entity, 3);
    expect(drive.forwardSpeed).toBeCloseTo(300, 0);

    expect(drive.igniteNitro()).toBe(true);
    run(game, entity, 0.4);
    expect(drive.forwardSpeed).toBeGreaterThan(330);  // past the normal cap
    expect(drive.igniteNitro()).toBe(false);          // still cooling down

    run(game, entity, 2);
    expect(drive.forwardSpeed).toBeCloseTo(300, 0);   // cap is back
    expect(drive.nitroReady).toBe(true);
    releaseKeys(game);
  });

  it('applyBoost only ever adds speed', () => {
    const { game, body, entity, drive } = makeCar();
    drive.applyBoost(400);
    expect(body.velocity.x).toBeCloseTo(400, 3);

    drive.applyBoost(200);                            // slower pad: no effect
    expect(body.velocity.x).toBeCloseTo(400, 3);
  });

  it('drives from setControls when manual', () => {
    const { game, body, entity } = makeCar({ manual: true });
    const drive = entity.getConstraint('drive');
    holdKeys(game, 'ArrowUp');                        // keyboard must be ignored
    drive.setControls({ throttle: 1, steer: 0 });
    run(game, entity, 1);
    releaseKeys(game);

    expect(body.position.x).toBeGreaterThan(100);
    drive.setControls({ throttle: 0, brake: 1 });
    run(game, entity, 2);
    expect(drive.forwardSpeed).toBeLessThanOrEqual(0);
  });

  it('drives the identical trajectory from identical inputs', () => {
    // The property the circuit demo's replays and ghosts stand on.
    const script = (t) => ({
      up: true,
      right: t > 0.8 && t < 1.6,
      space: t > 1.0 && t < 1.4,
      nitro: Math.abs(t - 2.0) < FIXED / 2
    });

    const states = [];
    for (let i = 0; i < 2; i++) {
      const { game, body, entity } = makeCar();
      for (let n = 0; n < Math.round(2.5 / FIXED); n++) {
        releaseKeys(game);
        const want = script(n * FIXED);
        const keys = [];
        if (want.up) keys.push('ArrowUp');
        if (want.right) keys.push('ArrowRight');
        if (want.space) keys.push('Space');
        if (want.nitro) keys.push('KeyX');
        if (keys.length) holdKeys(game, ...keys);
        tick(game, entity);
      }
      states.push({ ...body.position, angle: body.angle, velocity: body.velocity });
      releaseKeys(game);
    }

    expect(states[1]).toEqual(states[0]);
    expect(Math.abs(states[0].angle)).toBeGreaterThan(0.1); // it actually turned
  });
});
