import { describe, it, expect, beforeAll } from 'vitest';

import { initPhysics, createPhysicsWorld } from '../../src/core/physics/index.js';

/**
 * Rapier ships as WASM, and Node loading it proves nothing about the path
 * games actually take: fetched by the browser, compiled by its WASM engine.
 * This is the "does the real runtime run it at all" check; the contract
 * itself is characterized in test/physics.test.js.
 */
describe('physics in the browser', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('initializes, simulates and reports through the contract', () => {
    const world = createPhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const floor = world.createBox({ x: 0, y: 200, width: 400, height: 20, bodyType: 'static' });
    const box = world.createBox({ x: 0, y: 0, width: 20, height: 20 });
    world.add(floor);
    world.add(box);

    for (let i = 0; i < 180; i++) world.step(1 / 60);

    // Floor top is y=190; a 20-tall box rests centred at 180.
    expect(box.position.y).toBeCloseTo(180, 0);
    expect(world.contactsWith(box)).toContain(floor);
    world.destroy();
  });

  it('stops a bullet body at a thin wall (CCD)', () => {
    const world = createPhysicsWorld({ gravity: { x: 0, y: 0 } });
    const wall = world.createBox({ x: 100, y: 0, width: 4, height: 200, bodyType: 'static' });
    const slug = world.createBox({ x: 0, y: 0, width: 4, height: 4, frictionAir: 0 });
    slug.bullet = true;
    world.add(wall);
    world.add(slug);

    slug.setVelocity({ x: 24000, y: 0 });
    world.step(1 / 60);
    world.step(1 / 60);

    expect(slug.position.x).toBeLessThan(100);
    world.destroy();
  });
});
