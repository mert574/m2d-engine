import { describe, it, expect } from 'vitest';
import { makeTestGame, makeBody } from 'm2d-engine/testing';
import { Entity, Camera } from 'm2d-engine';
import { ThrustControl } from '../src/controls/thrustControl.ts';

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
  /** Where a point a hundred units ahead of the target lands on screen. */
  function nose(camera, angle) {
    const at = camera.worldToScreen(Math.cos(angle) * 100, Math.sin(angle) * 100);
    const centre = camera.worldToScreen(0, 0);
    return { x: at.x - centre.x, y: at.y - centre.y };
  }

  it('turns the view until the target\'s nose points up the screen', () => {
    // The contract is where the ship is drawn, not what the angle reads:
    // a view that is a half-turn out satisfies any test of the number and
    // flies the ship down the screen (Salvage Run, until Nov 2026).
    for (const angle of [0, Math.PI / 2, Math.PI, -0.7]) {
      const camera = new Camera(800, 600, { followRotation: true, rotationLerp: 1, rotationMaxRate: Infinity });
      camera.follow({ body: { renderPosition: { x: 0, y: 0 }, renderAngle: angle } });
      camera.snap();
      const ahead = nose(camera, angle);
      expect(ahead.y, `nose at ${angle.toFixed(2)} rad`).toBeLessThan(-90);
      expect(Math.abs(ahead.x)).toBeLessThan(1);
    }
  });

  it('caps how fast the view may turn and ignores a wobble', () => {
    const camera = new Camera(800, 600, { followRotation: true, rotationLerp: 1, rotationMaxRate: 1, rotationDeadband: 0.05 });
    camera.follow({ body: { renderPosition: { x: 0, y: 0 }, renderAngle: Math.PI } });
    const wanted = Math.PI + camera.rotationOffset;
    camera.update(0.5);
    // Half a second at a radian a second, the short way round (the view
    // wants -π/2 here, not +3π/2).
    expect(camera.rotation).toBeCloseTo(-0.5);
    camera.rotation = wanted - 0.02;
    camera.update(0.5);
    expect(camera.rotation, 'a wobble is not followed').toBeCloseTo(wanted - 0.02);
  });
});
