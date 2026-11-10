import { describe, it, expect } from 'vitest';
import { applyOps } from 'm2d-editor-core';
import { resizeOps, scalesUniformly, currentSizes, effectiveMesh } from '../src/scaling.ts';

/**
 * Resizing as ops. A block's three sides are three fields; a model
 * object scales as one, and its mesh scale and offset go with it, so the
 * thing drawn grows with the box around it.
 */

function doc() {
  return {
    type: 'level',
    world: { dimensions: 3 },
    assets: { models: { lamp: { url: 'lamp.glb' } } },
    prefabs: {
      block: { actor: 'Ground', mesh: { color: '#fff' } },
      lamp: { actor: 'Prop', mesh: { model: 'lamp', scale: 0.5, offset: { x: 0, y: -0.25, z: 0 } } }
    },
    layers: [{
      name: 'main',
      objects: [
        { id: 'block-1', prefab: 'block', x: 0, y: 1, z: 0, width: 2, height: 2, depth: 4 },
        { id: 'lamp-1', prefab: 'lamp', x: 3, y: 0.5, z: 0, width: 0.5, height: 1 },
        { id: 'lamp-2', prefab: 'lamp', x: 5, y: 0.5, z: 0, width: 1, height: 1, depth: 1, overrides: { mesh: { scale: 2, color: '#f00' } } }
      ]
    }]
  } as Record<string, unknown>;
}

const BLOCK = ['layers', 0, 'objects', 0];
const LAMP = ['layers', 0, 'objects', 1];
const LAMP2 = ['layers', 0, 'objects', 2];

describe('resizing', () => {
  it('knows which objects draw a model', () => {
    const d = doc();
    expect(scalesUniformly(d, BLOCK, 3)).toBe(false);
    expect(scalesUniformly(d, LAMP, 3)).toBe(true);
    expect(scalesUniformly(d, LAMP, 2)).toBe(false);
    expect(effectiveMesh(d, LAMP2)).toEqual({ model: 'lamp', scale: 2, offset: { x: 0, y: -0.25, z: 0 }, color: '#f00' });
  });

  it('reads sizes with the loader\'s defaults: depth is width in 3D', () => {
    expect(currentSizes(doc(), LAMP, 3)).toEqual({ width: 0.5, height: 1, depth: 0.5 });
    expect(currentSizes(doc(), ['layers', 0, 'objects', 9], 2)).toEqual({ width: 32, height: 32, depth: 32 });
  });

  it('resizes a block side by side', () => {
    const d = doc();
    const ops = resizeOps(d, BLOCK, { width: 3, depth: 1 }, 3);
    expect(ops).toEqual([
      { op: 'set', path: [...BLOCK, 'width'], value: 3 },
      { op: 'set', path: [...BLOCK, 'depth'], value: 1 }
    ]);
    // Nothing touches the mesh.
    expect(ops.some((op) => op.path.includes('overrides'))).toBe(false);
  });

  it('scales a model object as one, mesh scale and offset with it', () => {
    const d = doc();
    const ops = resizeOps(d, LAMP, { height: 2 }, 3);
    applyOps(d, ops);
    const lamp = (d.layers as Array<{ objects: Array<Record<string, unknown>> }>)[0]!.objects[1]!;
    expect(lamp.width).toBeCloseTo(1);
    expect(lamp.height).toBeCloseTo(2);
    expect(lamp.depth).toBeCloseTo(1);
    expect(lamp.overrides).toEqual({ mesh: { scale: 1, offset: { x: 0, y: -0.5, z: 0 } } });
  });

  it('keeps the other overrides when the object already has a mesh block', () => {
    const d = doc();
    applyOps(d, resizeOps(d, LAMP2, { width: 0.5 }, 3));
    const lamp = (d.layers as Array<{ objects: Array<Record<string, unknown>> }>)[0]!.objects[2]!;
    expect(lamp.overrides).toEqual({ mesh: { scale: 1, color: '#f00', offset: { x: 0, y: -0.125, z: 0 } } });
    expect(lamp.height).toBeCloseTo(0.5);
  });

  it('ignores a size that is not a positive number', () => {
    expect(resizeOps(doc(), BLOCK, { width: -1 }, 3)).toEqual([]);
    expect(resizeOps(doc(), LAMP, { width: NaN }, 3)).toEqual([]);
  });
});
