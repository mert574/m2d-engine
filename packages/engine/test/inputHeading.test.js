import { describe, it, expect } from 'vitest';
import { InputSnapshot, headingOf } from '../src/core/input/inputManager.js';

/**
 * The tick's heading: which way the view faced when the tick was sampled,
 * handed to the simulation as input so a character steered relative to
 * the view never reads the camera.
 */
describe('the snapshot\'s heading', () => {
  it('is the 3D camera\'s yaw, so that sin and cos of it are forward again', () => {
    const facing = (x, z) => headingOf({ forward: { x, y: 0, z } });
    expect(facing(0, 1)).toBeCloseTo(0);
    expect(facing(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(facing(0, -1)).toBeCloseTo(Math.PI);
    const heading = facing(Math.SQRT1_2, Math.SQRT1_2);
    expect(Math.sin(heading)).toBeCloseTo(Math.SQRT1_2);
    expect(Math.cos(heading)).toBeCloseTo(Math.SQRT1_2);
  });

  it('is 0 for a 2D camera, which has no forward, and for no camera at all', () => {
    expect(headingOf({ x: 10, y: 20, zoom: 1 })).toBe(0);
    expect(headingOf(null)).toBe(0);
  });

  it('rides a recording and comes back, and a fed snapshot may leave it out', () => {
    const taken = new InputSnapshot({ down: new Set(['KeyW']), pressed: new Set(), released: new Set(), pointer: InputSnapshot.empty().pointer, heading: 1.25 });
    const replayed = InputSnapshot.from(JSON.parse(JSON.stringify(taken.toJSON())));
    expect(replayed.heading).toBe(1.25);
    expect(replayed.isDown('KeyW')).toBe(true);
    expect(InputSnapshot.from({ down: ['KeyW'] }).heading).toBe(0);
    expect(InputSnapshot.empty().heading).toBe(0);
  });
});
