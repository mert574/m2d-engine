import { describe, it, expect } from 'vitest';
import { rotation } from '../src/index.ts';
import { Quat } from 'm2d-engine/core/math.js';

/** The editor's quaternions must turn things exactly as the engine does. */
const deg = Math.PI / 180;
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits); expect(a.y).toBeCloseTo(b.y, digits); expect(a.z).toBeCloseTo(b.z, digits);
};

describe('rotation', () => {
  it('rotates vectors exactly as the engine does', () => {
    const q = rotation.fromEuler({ yaw: 30 * deg, pitch: -50 * deg, roll: 120 * deg });
    const v = { x: 0.3, y: -1.2, z: 2 };
    const [x, y, z, w] = q;
    close(rotation.rotate(q, v), (Quat as { rotate(q: object, v: object): { x: number; y: number; z: number } }).rotate({ x, y, z, w }, v));
  });

  it('poses yaw, pitch and roll in the documented order', () => {
    // Yaw 90° turns forward (-z) to face -x.
    close(rotation.rotate(rotation.fromEuler({ yaw: 90 * deg, pitch: 0, roll: 0 }), { x: 0, y: 0, z: -1 }), { x: -1, y: 0, z: 0 });
    // Pitch 90° tips forward up.
    close(rotation.rotate(rotation.fromEuler({ yaw: 0, pitch: 90 * deg, roll: 0 }), { x: 0, y: 0, z: -1 }), { x: 0, y: 1, z: 0 });
  });

  it('round-trips Euler angles away from the pole, and stays the same orientation at it', () => {
    for (const e of [{ yaw: 10, pitch: 20, roll: 30 }, { yaw: -170, pitch: 80, roll: -45 }, { yaw: 0, pitch: -30, roll: 179 }]) {
      const radians = { yaw: e.yaw * deg, pitch: e.pitch * deg, roll: e.roll * deg };
      const back = rotation.toEuler(rotation.fromEuler(radians));
      expect(back.yaw).toBeCloseTo(radians.yaw, 6);
      expect(back.pitch).toBeCloseTo(radians.pitch, 6);
      expect(back.roll).toBeCloseTo(radians.roll, 6);
    }
    const pole = rotation.fromEuler({ yaw: 40 * deg, pitch: 90 * deg, roll: 25 * deg });
    const again = rotation.fromEuler(rotation.toEuler(pole));
    const v = { x: 1, y: 2, z: 3 };
    close(rotation.rotate(again, v), rotation.rotate(pole, v), 6);   // asin loses digits at the pole
  });

  it('writes scene quaternions normalized, w ≥ 0, rounded', () => {
    expect(rotation.forScene([0, 0, 0, -2])).toEqual([0, 0, 0, 1]);
    const q = rotation.forScene(rotation.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2));
    expect(q).toEqual([0, 0.707107, 0, 0.707107]);
  });
});
