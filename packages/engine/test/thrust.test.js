import { describe, it, expect } from 'vitest';
import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { Camera } from '../src/core/camera.js';
import { ThrustControl } from '../src/constraints/thrustControl.js';

describe('ThrustControl', () => {
  it('turns, thrusts along the nose, caps speed and coasts', () => {
    const game = makeTestGame();
    const entity = new Entity(makeBody(game, 0, 0, 40, 40, { bodyType: 'dynamic', frictionAir: 0 }), null, game);
    game.physics.add(entity.body);
    const control = new ThrustControl(entity, { thrust: 600, maxSpeed: 100, drag: 0 });
    game.input.snapshot.down.add('ArrowUp');
    for (let i = 0; i < 30; i++) control.fixedUpdate(1 / 60);
    const v = entity.body.velocity;
    expect(v.x).toBeCloseTo(100, 3);
    expect(Math.abs(v.y)).toBeLessThan(1e-6);
    expect(control.throttle).toBeGreaterThan(0);
    game.input.snapshot.down.clear();
    game.input.snapshot.down.add('ArrowRight');
    control.fixedUpdate(1 / 60);
    expect(entity.body.angularVelocity).toBeCloseTo(3.2, 3);
    expect(control.steer).toBe(1);
  });

  it('boosts once per cooldown', () => {
    const game = makeTestGame();
    const entity = new Entity(makeBody(game, 0, 0, 40, 40, { bodyType: 'dynamic' }), null, game);
    game.physics.add(entity.body);
    let ignitions = 0;
    const control = new ThrustControl(entity, { boostDuration: 0.5, boostCooldown: 2, onBoost: () => ignitions++ });
    game.input.snapshot.pressed.add('KeyC');
    control.fixedUpdate(1 / 60);
    control.fixedUpdate(1 / 60);
    expect(ignitions).toBe(1);
    expect(control.boosting).toBe(true);
  });
});

describe('camera followRotation', () => {
  it('eases the view toward the target heading, nose up', () => {
    const camera = new Camera(800, 600, { followRotation: true, rotationLerp: 1 });
    camera.follow({ body: { renderPosition: { x: 0, y: 0 }, renderAngle: Math.PI / 2 } });
    camera.update(1 / 60);
    // A nose pointing +y (down the screen unrotated) ends up pointing up.
    expect(camera.rotation).toBeCloseTo(0);
    camera.target.body.renderAngle = 0;
    camera.rotationMaxRate = Infinity;
    camera.update(1 / 60);
    expect(camera.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('caps how fast the view may turn and ignores a wobble', () => {
    const camera = new Camera(800, 600, { followRotation: true, rotationLerp: 1, rotationMaxRate: 1, rotationDeadband: 0.05 });
    camera.follow({ body: { renderPosition: { x: 0, y: 0 }, renderAngle: Math.PI } });
    camera.update(0.5);
    expect(camera.rotation).toBeCloseTo(0.5);
    camera.rotation = Math.PI / 2 - 0.02;
    camera.update(0.5);
    expect(camera.rotation).toBeCloseTo(Math.PI / 2 - 0.02);
  });
});
