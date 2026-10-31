import { describe, it, expect } from 'vitest';

import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { PathFollow } from '../src/constraints/pathFollow.js';
import { Hover } from '../src/constraints/hover.js';
import { WallSlip } from '../src/constraints/wallSlip.js';
import { KeyboardControl } from '../src/constraints/keyboardControl.js';
import { KEY_RIGHT, KEY_DOWN } from '../src/core/keyCodes.js';

/**
 * The reusable entity behaviours (src/constraints/) that drive physics or
 * rendering state, run against a real physics world. Game-specific
 * constraints (attack, health) are configuration over the same machinery
 * and are exercised by their games.
 */

const FIXED = 1 / 60;

/** Run `seconds` of game time: entity updates, then physics, per frame. */
function play(game, entity, seconds) {
  const frames = Math.round(seconds / FIXED);
  for (let i = 0; i < frames; i++) {
    entity.update(FIXED);
    game.physics.step(FIXED);
  }
}

describe('PathFollow', () => {
  function patroller(options) {
    const game = makeTestGame();
    const body = makeBody(game, 0, 0, 40, 10, { bodyType: 'kinematic' });
    game.physics.add(body);
    const entity = new Entity(body, null, game);
    entity.addConstraint('path', new PathFollow(entity, {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      speed: 100,
      waitTime: 500,
      ...options
    }));
    return { game, body, entity };
  }

  it('starts at the first point and travels to the next', () => {
    // Timeline: it "arrives" at its own starting point immediately, so the
    // first waitTime (0.5s) passes before departure; the 100px leg then
    // takes ~1.5s of ramp-cruise-brake.
    const { game, body, entity } = patroller();

    expect(body.position).toEqual({ x: 0, y: 0 });
    play(game, entity, 2.2);

    expect(body.position.x).toBeCloseTo(100, 0);
    expect(body.position.y).toBeCloseTo(0, 3);
  });

  it('never exceeds its cruise speed, and stops to wait at each point', () => {
    const { game, body, entity } = patroller();
    let maxSpeed = 0;
    for (let i = 0; i < Math.round(2 / FIXED); i++) {
      entity.update(FIXED);
      game.physics.step(FIXED);
      maxSpeed = Math.max(maxSpeed, Math.abs(body.velocity.x));
    }

    expect(maxSpeed).toBeLessThanOrEqual(100 + 1e-6);
    // Arrived and waiting: parked, not creeping.
    expect(body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('turns around after the wait and patrols back', () => {
    const { game, body, entity } = patroller();
    play(game, entity, 2.2);          // initial pause + outbound leg
    expect(body.position.x).toBeCloseTo(100, 0);

    play(game, entity, 1);            // finish the pause, into the return leg
    expect(body.velocity.x).toBeLessThan(0);

    play(game, entity, 1);            // home again, waiting
    expect(body.position.x).toBeCloseTo(0, 0);
    expect(body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('stays put with fewer than two points', () => {
    const { game, body, entity } = patroller({ points: [{ x: 10, y: 20 }] });
    play(game, entity, 1);

    expect(body.position).toEqual({ x: 10, y: 20 });
  });
});

describe('Hover', () => {
  it('moves what is drawn, never the body', () => {
    const game = makeTestGame();
    const body = makeBody(game, 50, 80, 16, 16, { bodyType: 'static', isSensor: true });
    game.physics.add(body);
    const entity = new Entity(body, null, game);
    entity.addConstraint('hover', new Hover(entity, {
      amplitude: 10, frequency: Math.PI, spin: 1
    }));

    // Half a second puts the sine phase at π/2: the full amplitude.
    for (let i = 0; i < 30; i++) entity.update(FIXED);

    expect(entity.renderPosition.y).toBeCloseTo(80 + 10, 3);
    expect(entity.renderAngle).toBeCloseTo(0.5, 3);
    // The body itself is untouched — queries and the solver see it parked.
    expect(body.position).toEqual({ x: 50, y: 80 });
    expect(body.angle).toBe(0);
  });
});

describe('WallSlip', () => {
  function fallAgainstWall(withSlip) {
    const game = makeTestGame();
    game.physics.setGravity({ x: 0, y: 1000 });
    game.physics.add(makeBody(game, 100, 0, 40, 4000, { bodyType: 'static', friction: 1 }));
    const body = makeBody(game, 60, -1800, 32, 32, { friction: 5, frictionAir: 0.001 });
    game.physics.add(body);
    const entity = new Entity(body, null, game);
    if (withSlip) entity.addConstraint('wallSlip', new WallSlip(entity));

    for (let i = 0; i < 60; i++) {
      entity.update(FIXED);
      body.setVelocity({ x: 180, y: body.velocity.y });  // hold towards the wall
      game.physics.step(FIXED);
    }
    return { fell: body.position.y - -1800, entity, body, game };
  }

  it('an airborne body slides down a wall instead of clinging to it', () => {
    // High ground friction turns to glue on a wall: pressing in makes a
    // normal force, and friction against it carries the body's weight.
    expect(fallAgainstWall(false).fell).toBeLessThan(50);
    expect(fallAgainstWall(true).fell).toBeGreaterThan(400);  // ~free fall
  });

  it('restores the configured friction on landing', () => {
    const game = makeTestGame();
    game.physics.setGravity({ x: 0, y: 1000 });
    game.physics.add(makeBody(game, 0, 100, 400, 20, { bodyType: 'static', friction: 1 }));
    const body = makeBody(game, 0, 0, 32, 32, { friction: 5, frictionAir: 0.001 });
    game.physics.add(body);
    const entity = new Entity(body, null, game);
    entity.addConstraint('wallSlip', new WallSlip(entity));

    entity.update(FIXED);                       // airborne: slippery
    expect(body.friction).toBe(0);

    play(game, entity, 2);                      // land and settle
    expect(entity.isOnGround()).toBe(true);
    expect(body.friction).toBe(5);
  });
});

describe('KeyboardControl against walls', () => {
  /** Travel along a wall below for 1s, with the given keys held. */
  function slideAlongWall(keys) {
    const game = makeTestGame();
    game.physics.setGravity({ x: 0, y: 0 });
    game.keys = { addKey() {}, pressedKeys: () => new Set(keys) };
    game.physics.add(makeBody(game, 0, 64, 4000, 32, { bodyType: 'static' }));
    const body = game.physics.createCircle({
      x: 0, y: 20, radius: 13, bodyType: 'character', frictionAir: 0
    });
    game.physics.add(body);
    const entity = new Entity(body, null, game);
    entity.addConstraint('control', new KeyboardControl(entity, {
      continuous: false, maxSpeed: 240, verticalMovement: true
    }));

    // Index the new bodies with a step, then settle onto the wall.
    game.physics.step(FIXED);
    for (let i = 0; i < 20; i++) { body.setVelocity({ x: 0, y: 240 }); game.physics.step(FIXED); }
    const x0 = body.position.x;
    play(game, entity, 1);
    return body.position.x - x0;
  }

  it('a diagonal into a wall is as fast as moving along it', () => {
    // The blocked axis must not tax the free one by √2: pressing into the
    // wall is spent force, so right+down against a floor travels exactly as
    // far as right alone — not 71% of it.
    const single = slideAlongWall([KEY_RIGHT]);
    const diagonal = slideAlongWall([KEY_RIGHT, KEY_DOWN]);

    expect(single).toBeGreaterThan(180);
    expect(diagonal).toBeGreaterThanOrEqual(single * 0.98);
  });
});

describe('Entity rendering hooks', () => {
  it('renderOffset and renderAngleOffset default to doing nothing', () => {
    const game = makeTestGame();
    const body = makeBody(game, 5, 6, 10, 10);
    const entity = new Entity(body, null, game);

    expect(entity.renderPosition).toEqual(body.renderPosition);
    expect(entity.renderAngle).toBe(body.renderAngle);
  });

  it('an invisible entity draws nothing', () => {
    const game = makeTestGame();
    const entity = new Entity(makeBody(game, 0, 0, 10, 10), null, game);

    entity.draw(FIXED);
    const drawn = game.renderer.calls.length;
    expect(drawn).toBeGreaterThan(0);       // placeholder rect for no sprite

    entity.visible = false;
    entity.draw(FIXED);
    expect(game.renderer.calls.length).toBe(drawn);
  });
});
