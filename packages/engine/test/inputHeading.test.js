import { describe, it, expect } from 'vitest';
import { InputSnapshot, headingOf } from '../src/core/input/inputManager.ts';
import { snapHeading } from '../src/core/input/snapshot.ts';
import { InputSchema, InputGate } from '../src/net/input.ts';

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

  it('is one number on both sides of the wire: sampled to a grid, wrapped into the turn', () => {
    const steps = 4096;
    expect(snapHeading(0)).toBe(0);
    expect(snapHeading(Math.PI * 2)).toBe(0);
    expect(snapHeading(Math.PI * 2 + 1)).toBeCloseTo(snapHeading(1), 12);
    expect(Math.abs(snapHeading(5))).toBeLessThanOrEqual(Math.PI);
    // Every sample lands on the grid, and the grid is fine enough to steer by.
    const sampled = headingOf({ forward: { x: 0.37, y: 0, z: 0.93 } });
    expect(Math.abs(sampled * steps / (Math.PI * 2) % 1)).toBeLessThan(1e-9);
    expect(Math.abs(sampled - Math.atan2(0.37, 0.93))).toBeLessThan(Math.PI * 2 / steps);
    // What the client predicts from and what the server simulates from is the same number.
    const schema = new InputSchema({ keys: ['KeyW'], heading: true });
    const message = schema.encode(1, InputSnapshot.from({ down: ['KeyW'], heading: sampled }));
    expect(message.heading).toBe(sampled);
    const gate = new InputGate(schema, { maxAhead: 4 });
    gate.submit(JSON.parse(JSON.stringify(message)));
    expect(gate.take(1).heading).toBe(sampled);
  });

  it('is 0 for a 2D camera, which has no forward, and for no camera at all', () => {
    expect(headingOf({ x: 10, y: 20, zoom: 1 })).toBe(0);
    expect(headingOf(null)).toBe(0);
  });

  it('rides a recording and comes back, and a fed snapshot may leave it out', () => {
    const onGrid = snapHeading(1.25);
    const taken = new InputSnapshot({ down: new Set(['KeyW']), pressed: new Set(), released: new Set(), pointer: InputSnapshot.empty().pointer, heading: onGrid });
    const replayed = InputSnapshot.from(JSON.parse(JSON.stringify(taken.toJSON())));
    expect(replayed.heading).toBe(onGrid);
    expect(replayed.isDown('KeyW')).toBe(true);
    expect(InputSnapshot.from({ down: ['KeyW'] }).heading).toBe(0);
    // Whatever a recording holds, a tick reads an angle on the grid.
    expect(InputSnapshot.from({ heading: 'north' }).heading).toBe(0);
    expect(InputSnapshot.from({ heading: 1.2345678 }).heading).toBe(snapHeading(1.2345678));
    expect(InputSnapshot.empty().heading).toBe(0);
  });
});
