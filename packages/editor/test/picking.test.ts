import { describe, it, expect } from 'vitest';
import { rayBox, raySphere, rayCylinder, rayShape, isBackdrop3D, bestHit, slopOffsets, type Hit } from '../src/picking.ts';

/**
 * The geometry and the ranking behind a pick. The viewport brings each
 * ray into the object's frame; what is proven here is that the shapes
 * answer right and that the ranking prefers what the eye sees.
 */

const down = { x: 0, y: -1, z: 0 };
const hit = (over: Partial<Hit>): Hit => ({ id: 'a', t: 1, tier: 0, backdrop: false, direct: true, ...over });

describe('ray tests', () => {
  it('hits a box from outside and misses beside it', () => {
    expect(rayBox({ x: 0, y: 5, z: 0 }, down, { x: 1, y: 1, z: 1 })).toBeCloseTo(4);
    expect(rayBox({ x: 2, y: 5, z: 0 }, down, { x: 1, y: 1, z: 1 })).toBeNull();
    // From inside, the box is not picked: a low eye in the ground slab.
    expect(rayBox({ x: 0, y: 0, z: 0 }, down, { x: 1, y: 1, z: 1 })).toBeNull();
  });

  it('hits a sphere only within its radius, not its box', () => {
    expect(raySphere({ x: 0, y: 5, z: 0 }, down, 1)).toBeCloseTo(4);
    // The box corner: inside the bounding box, outside the sphere.
    expect(raySphere({ x: 0.9, y: 5, z: 0.9 }, down, 1)).toBeNull();
    expect(rayBox({ x: 0.9, y: 5, z: 0.9 }, down, { x: 1, y: 1, z: 1 })).not.toBeNull();
  });

  it('hits a cylinder on its cap and its side, and misses its box corner', () => {
    expect(rayCylinder({ x: 0, y: 5, z: 0 }, down, 1, 1)).toBeCloseTo(4);
    expect(rayCylinder({ x: 0.9, y: 5, z: 0.9 }, down, 1, 1)).toBeNull();
    const side = rayCylinder({ x: 5, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, 1, 1);
    expect(side).toBeCloseTo(4);
    // Above the cap height from the side: nothing.
    expect(rayCylinder({ x: 5, y: 2, z: 0 }, { x: -1, y: 0, z: 0 }, 1, 1)).toBeNull();
  });

  it('dispatches by shape, a capsule as a cylinder', () => {
    const size = { x: 2, y: 4, z: 2 };
    expect(rayShape({ x: 0.9, y: 9, z: 0.9 }, down, 'box', size)).not.toBeNull();
    expect(rayShape({ x: 0.9, y: 9, z: 0.9 }, down, 'capsule', size)).toBeNull();
    expect(rayShape({ x: 0, y: 9, z: 0 }, down, 'capsule', size)).toBeCloseTo(7);
  });
});

describe('ranking', () => {
  it('calls a slab many times wider than the hit is far a backdrop', () => {
    expect(isBackdrop3D({ x: 450, y: 0.5, z: 450 }, 12)).toBe(true);
    expect(isBackdrop3D({ x: 16, y: 2.5, z: 0.6 }, 12)).toBe(false);
    // The same floor seen whole from far away is just a thing to click.
    expect(isBackdrop3D({ x: 450, y: 0.5, z: 450 }, 100)).toBe(false);
  });

  it('prefers the nearest among equals', () => {
    expect(bestHit([hit({ id: 'far', t: 9 }), hit({ id: 'near', t: 3 })])).toBe('near');
  });

  it('prefers anything over a backdrop, even a near miss further away', () => {
    expect(bestHit([
      hit({ id: 'floor', t: 2, backdrop: true }),
      hit({ id: 'crate', t: 8, direct: false })
    ])).toBe('crate');
    // Only the backdrop under the pointer: that is the pick.
    expect(bestHit([hit({ id: 'floor', t: 2, backdrop: true })])).toBe('floor');
  });

  it('prefers what is drawn over what is hidden, and a direct hit over a near one', () => {
    expect(bestHit([hit({ id: 'trigger', t: 1, tier: 1 }), hit({ id: 'lamp', t: 4 })])).toBe('lamp');
    expect(bestHit([hit({ id: 'beside', t: 1, direct: false }), hit({ id: 'under', t: 4 })])).toBe('under');
    expect(bestHit([])).toBeNull();
  });

  it('casts the pointer\'s own ray first, then a ring around it', () => {
    const offsets = slopOffsets(6);
    expect(offsets[0]).toEqual({ dx: 0, dy: 0, direct: true });
    expect(offsets).toHaveLength(9);
    for (const o of offsets.slice(1)) expect(Math.hypot(o.dx, o.dy)).toBeCloseTo(6);
  });
});
