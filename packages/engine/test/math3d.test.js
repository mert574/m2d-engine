import { describe, it, expect } from 'vitest';
import { Vec3, Quat } from '../src/core/math.js';

/**
 * The three-dimensional half of the math module.
 *
 * `Vec2` and `Angle` are unchanged and stay the 2D engine's; these sit
 * beside them for the 3D one. A quaternion is the form Rapier reads and
 * writes, so nothing converts at the boundary.
 */

const near = (a, b, digits = 10) => {
  for (const axis of Object.keys(b)) expect(a[axis], axis).toBeCloseTo(b[axis], digits);
};

describe('Vec3', () => {
  it('measures length and distance across three axes', () => {
    expect(Vec3.length({ x: 2, y: 3, z: 6 })).toBe(7);
    expect(Vec3.distance({ x: 1, y: 1, z: 1 }, { x: 3, y: 4, z: 7 })).toBe(7);
  });

  it('normalizes, and answers zero for a zero vector', () => {
    near(Vec3.normalize({ x: 0, y: 0, z: -4 }), { x: 0, y: 0, z: -1 });
    expect(Vec3.normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('adds, subtracts, scales and takes directions', () => {
    expect(Vec3.add({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 });
    expect(Vec3.subtract({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 1, z: 2 });
    expect(Vec3.scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
    expect(Vec3.direction({ x: 1, y: 1, z: 1 }, { x: 1, y: 2, z: 4 })).toEqual({ x: 0, y: 1, z: 3 });
  });

  it('takes a dot product, which is how a ground normal is told from a wall', () => {
    const up = { x: 0, y: -1, z: 0 };
    expect(Vec3.dot(up, { x: 0, y: -1, z: 0 })).toBe(1);
    expect(Vec3.dot(up, { x: 1, y: 0, z: 0 })).toBe(0);
  });

  it('crosses right-handed', () => {
    near(Vec3.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
    // Perpendicular to both inputs, whatever they are.
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: -4, y: 5, z: 6 };
    const c = Vec3.cross(a, b);
    expect(Vec3.dot(c, a)).toBeCloseTo(0, 10);
    expect(Vec3.dot(c, b)).toBeCloseTo(0, 10);
  });
});

describe('Quat', () => {
  const quarterZ = Quat.fromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);

  it('starts at identity, which turns nothing', () => {
    near(Quat.rotate(Quat.identity(), { x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it('turns a vector about an axis', () => {
    near(Quat.rotate(quarterZ, { x: 1, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
  });

  it('normalizes the axis it is given', () => {
    const scaled = Quat.fromAxisAngle({ x: 0, y: 0, z: 9 }, Math.PI / 2);
    near(scaled, quarterZ);
  });

  it('composes in order: a then b', () => {
    const half = Quat.multiply(quarterZ, quarterZ);
    near(Quat.rotate(half, { x: 1, y: 0, z: 0 }), { x: -1, y: 0, z: 0 });
  });

  it('undoes itself through its conjugate', () => {
    const v = { x: 3, y: -1, z: 2 };
    const there = Quat.rotate(quarterZ, v);
    near(Quat.rotate(Quat.conjugate(quarterZ), there), v);
  });

  it('keeps rotations unit-length', () => {
    const drifted = { x: 0.1, y: 0.2, z: 0.3, w: 0.4 };
    const q = Quat.normalize(drifted);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
    expect(Quat.normalize({ x: 0, y: 0, z: 0, w: 0 })).toEqual(Quat.identity());
  });

  describe('slerp', () => {
    it('lands on its endpoints', () => {
      near(Quat.slerp(Quat.identity(), quarterZ, 0), Quat.identity());
      near(Quat.slerp(Quat.identity(), quarterZ, 1), quarterZ);
    });

    it('is halfway at a half', () => {
      const mid = Quat.slerp(Quat.identity(), quarterZ, 0.5);
      near(mid, Quat.fromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 4));
    });

    it('takes the shorter arc, as shortestTurn does in two dimensions', () => {
      // A rotation has two unit quaternions. Blending toward the far one
      // would send a model the long way round for one frame; it must not.
      const far = { x: -quarterZ.x, y: -quarterZ.y, z: -quarterZ.z, w: -quarterZ.w };
      const viaFar = Quat.slerp(Quat.identity(), far, 0.5);
      const viaNear = Quat.slerp(Quat.identity(), quarterZ, 0.5);
      near(Quat.rotate(viaFar, { x: 1, y: 0, z: 0 }), Quat.rotate(viaNear, { x: 1, y: 0, z: 0 }));
    });

    it('blends straight through a near-parallel pair', () => {
      // Below the arc where the division is worth its precision.
      const almost = Quat.fromAxisAngle({ x: 0, y: 0, z: 1 }, 1e-5);
      const mid = Quat.slerp(Quat.identity(), almost, 0.5);
      near(mid, Quat.fromAxisAngle({ x: 0, y: 0, z: 1 }, 5e-6), 9);
      expect(Math.hypot(mid.x, mid.y, mid.z, mid.w)).toBeCloseTo(1, 12);
    });
  });
});
