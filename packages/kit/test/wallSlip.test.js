import { describe, it, expect } from 'vitest';
import { makeTestGame, makeBody } from 'm2d-engine/test/helpers/testGame.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { WallSlip } from '../src/controls/wallSlip.ts';

/** A platformer's wall slide, against a real physics world. */

const FIXED = 1 / 60;

/** One simulation tick, the way the engine runs it: sample, fixedUpdate, step. */
function tick(game, entity) {
  game.input.sample();
  entity.fixedUpdate(FIXED);
  game.physics.step(FIXED);
}

/** Run `seconds` of game time in ticks. */
function play(game, entity, seconds) {
  const ticks = Math.round(seconds / FIXED);
  for (let i = 0; i < ticks; i++) tick(game, entity);
}

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
      entity.fixedUpdate(FIXED);
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

    entity.fixedUpdate(FIXED);                  // airborne: slippery
    expect(body.friction).toBe(0);

    play(game, entity, 2);                      // land and settle
    expect(entity.isOnGround()).toBe(true);
    expect(body.friction).toBe(5);
  });
});
