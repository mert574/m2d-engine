import { describe, it, expect } from 'vitest';
import { applyOps, inspectNode } from '../src/index.ts';
import {
  addEntry, renameEntry, removeEntry, addPrefab, duplicatePrefab, objectToPrefab, attachConstraint,
  addLayer, removeLayer, moveLayer, moveObject, removeObjects, insertObjects, objectsOfPrefab, arrangeObjects, blankScene, uniqueKey
} from '../src/structure.ts';

/**
 * Structural edits as ops. Each is applied to a document and the result
 * checked, so what the GUI and an agent get is the same.
 */

function doc(): Record<string, unknown> {
  return {
    version: 2, type: 'level', name: 'room',
    world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
    assets: { spritesheets: { hero: { url: 'hero.png', frameWidth: 32, frameHeight: 32 } }, models: { crate: { url: 'crate.glb' } } },
    prefabs: {
      wall: { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { color: '#fff' } },
      crate: { actor: 'Crate', physics: { bodyType: 'dynamic' }, mesh: { model: 'crate' }, constraints: { hp: { type: 'Health' } } },
      guy: { actor: 'Hero', spritesheet: 'hero' }
    },
    layers: [
      { name: 'main', objects: [
        { id: 'floor', prefab: 'wall', x: 0, y: 0, z: 0, width: 10, height: 1, depth: 10 },
        { id: 'crate-1', prefab: 'crate', x: 1, y: 1, z: 0, overrides: { mesh: { color: '#f00' } } },
        { id: 'crate-2', prefab: 'crate', x: 4, y: 1, z: 2 }
      ], props: [{ id: 'grass', prefab: 'wall', instances: [[0, 0, 0, 0, 1]] }] },
      { name: 'back', objects: [{ id: 'far', prefab: 'wall', x: 9, y: 0, z: 0 }] }
    ]
  };
}
const run = (d: Record<string, unknown>, ops: ReturnType<typeof addEntry>) => { applyOps(d, ops); return d; };
const objects = (d: Record<string, unknown>, layer = 0) => ((d.layers as Array<{ objects: Array<Record<string, unknown>> }>)[layer]!.objects);

describe('records', () => {
  it('adds, refuses a duplicate, removes', () => {
    const d = doc();
    run(d, addEntry(d, ['prefabs'], 'lamp', { actor: 'Ground' }));
    expect((d.prefabs as Record<string, unknown>).lamp).toEqual({ actor: 'Ground' });
    expect(() => addEntry(d, ['prefabs'], 'lamp', {})).toThrow(/already/);
    run(d, removeEntry(d, ['prefabs'], 'lamp'));
    expect('lamp' in (d.prefabs as object)).toBe(false);
    // Into a record that is not there yet: the container is made.
    run(d, addEntry(d, ['assets', 'environments'], 'sky', { url: 'sky.hdr' }));
    expect((d.assets as { environments: object }).environments).toEqual({ sky: { url: 'sky.hdr' } });
  });

  it('renames a prefab and every object and prop that used it', () => {
    const d = run(doc(), renameEntry(doc(), ['prefabs'], 'wall', 'slab'));
    const prefabs = d.prefabs as Record<string, unknown>;
    expect(prefabs.slab).toBeTruthy();
    expect(prefabs.wall).toBeUndefined();
    expect(objects(d)[0]!.prefab).toBe('slab');
    expect(objects(d, 1)[0]!.prefab).toBe('slab');
    expect(((d.layers as Array<{ props: Array<{ prefab: string }> }>)[0]!.props)[0]!.prefab).toBe('slab');
    expect(objects(d)[1]!.prefab).toBe('crate');
  });

  it('renames a sprite sheet and a model where they are used', () => {
    const d = run(doc(), renameEntry(doc(), ['assets', 'spritesheets'], 'hero', 'knight'));
    expect((d.prefabs as { guy: { spritesheet: string } }).guy.spritesheet).toBe('knight');
    const e = run(doc(), renameEntry(doc(), ['assets', 'models'], 'crate', 'box'));
    expect((e.prefabs as { crate: { mesh: { model: string } } }).crate.mesh.model).toBe('box');
    expect(() => renameEntry(doc(), ['prefabs'], 'wall', 'crate')).toThrow(/already/);
  });

  it('picks free keys', () => {
    expect(uniqueKey(doc(), ['prefabs'], 'wall')).toBe('wall-2');
    expect(uniqueKey(doc(), ['prefabs'], 'wall-9')).toBe('wall-9');
    expect(uniqueKey({ prefabs: { 'wall-9': {} } }, ['prefabs'], 'wall-9')).toBe('wall');
    expect(uniqueKey(doc(), ['prefabs'], 'tree')).toBe('tree');
  });
});

describe('prefabs', () => {
  it('adds one fitting the dimension, duplicates one, and makes one from an object\'s overrides', () => {
    const d = doc();
    const made = addPrefab(d, 'lamp', 'Ground', 3);
    run(d, made.ops);
    expect((d.prefabs as Record<string, { actor: string; mesh?: unknown }>)[made.name]).toMatchObject({ actor: 'Ground', mesh: expect.anything() });
    expect(addPrefab(d, 'thing', 'Prop', 2).ops[0]).toMatchObject({ value: { actor: 'Prop', physics: { bodyType: 'static' } } });

    const copy = duplicatePrefab(d, 'crate');
    run(d, copy.ops);
    expect(copy.name).toBe('crate-2');
    expect((d.prefabs as Record<string, unknown>)['crate-2']).toEqual((d.prefabs as Record<string, unknown>).crate);

    const own = objectToPrefab(d, ['layers', 0, 'objects', 1]);
    run(d, own.ops);
    expect(own.name).toBe('crate-1');
    const prefab = (d.prefabs as Record<string, { mesh: unknown; physics: unknown; constraints: unknown }>)['crate-1']!;
    expect(prefab.mesh).toEqual({ model: 'crate', color: '#f00' });     // base under the override
    expect(prefab.physics).toEqual({ bodyType: 'dynamic' });
    expect(prefab.constraints).toEqual({ hp: { type: 'Health' } });
    expect(objects(d)[1]).toEqual({ id: 'crate-1', prefab: 'crate-1', x: 1, y: 1, z: 0 });
  });

  it('attaches a constraint under a free slot', () => {
    const d = doc();
    const a = attachConstraint(d, ['prefabs', 'crate'], 'Health', { maxHealth: 5 });
    run(d, a.ops);
    expect(a.slot).toBe('health');
    const b = attachConstraint(d, ['prefabs', 'crate'], 'Health');
    run(d, b.ops);
    expect(b.slot).toBe('health-2');
    expect((d.prefabs as { crate: { constraints: Record<string, unknown> } }).crate.constraints).toEqual({
      hp: { type: 'Health' }, health: { type: 'Health', params: { maxHealth: 5 } }, 'health-2': { type: 'Health' }
    });
    // Onto an object with no constraints block: the block is made.
    const c = attachConstraint(d, ['layers', 0, 'objects', 0], 'Chase');
    run(d, c.ops);
    expect(objects(d)[0]!.constraints).toEqual({ chase: { type: 'Chase' } });
  });
});

describe('layers and objects', () => {
  it('adds, moves and removes layers', () => {
    const d = run(doc(), addLayer(doc(), 'fx'));
    expect((d.layers as Array<{ name: string }>).map((l) => l.name)).toEqual(['main', 'back', 'fx']);
    run(d, moveLayer(d, 2, 0));
    expect((d.layers as Array<{ name: string }>).map((l) => l.name)).toEqual(['fx', 'main', 'back']);
    expect(moveLayer(d, 1, 1)).toEqual([]);
    run(d, removeLayer(d, 0));
    expect((d.layers as Array<{ name: string }>).map((l) => l.name)).toEqual(['main', 'back']);
    expect(() => removeLayer(d, 7)).toThrow();
  });

  it('moves an object between layers and within one', () => {
    const d = run(doc(), moveObject(doc(), ['layers', 0, 'objects', 1], 1));
    expect(objects(d).map((o) => o.id)).toEqual(['floor', 'crate-2']);
    expect(objects(d, 1).map((o) => o.id)).toEqual(['far', 'crate-1']);
    run(d, moveObject(d, ['layers', 1, 'objects', 1], 1, 0));
    expect(objects(d, 1).map((o) => o.id)).toEqual(['crate-1', 'far']);
    run(d, moveObject(d, ['layers', 0, 'objects', 0], 0, 1));
    expect(objects(d).map((o) => o.id)).toEqual(['crate-2', 'floor']);
  });

  it('removes several objects by id and inserts copies with unique ids', () => {
    const d = run(doc(), removeObjects(doc(), ['floor', 'crate-2', 'far']));
    expect(objects(d).map((o) => o.id)).toEqual(['crate-1']);
    expect(objects(d, 1)).toEqual([]);
    const pasted = insertObjects(d, [{ id: 'crate-1', prefab: 'crate', x: 1, y: 1 }, { id: 'crate-1', prefab: 'crate', x: 2, y: 1 }], 0, { x: 10 });
    run(d, pasted.ops);
    expect(pasted.ids).toEqual(['crate-2', 'crate-3']);
    expect(objects(d).map((o) => [o.id, o.x])).toEqual([['crate-1', 1], ['crate-2', 11], ['crate-3', 12]]);
  });

  it('finds a prefab\'s objects and arranges objects on an axis', () => {
    expect(objectsOfPrefab(doc(), 'wall')).toEqual(['floor', 'far']);
    const d = run(doc(), arrangeObjects(doc(), ['floor', 'crate-1', 'crate-2'], 'x', 'max'));
    expect(objects(d).map((o) => o.x)).toEqual([4, 4, 4]);
    const e = run(doc(), arrangeObjects(doc(), ['floor', 'crate-1', 'crate-2'], 'z', 'distribute'));
    expect(objects(e).map((o) => o.z)).toEqual([0, 1, 2]);
    const f = run(doc(), arrangeObjects(doc(), ['floor', 'crate-2'], 'x', 'center'));
    expect(objects(f).map((o) => o.x)).toEqual([2, 1, 2]);
    expect(arrangeObjects(doc(), ['floor'], 'x', 'min')).toEqual([]);
  });
});

describe('scenes', () => {
  it('makes a blank level or UI scene', () => {
    expect(blankScene('new', 'level', 2, 3)).toMatchObject({ version: 2, type: 'level', world: { dimensions: 3 }, layers: [{ name: 'main', objects: [] }] });
    expect(blankScene('menu', 'ui', 2)).toEqual({ version: 2, name: 'menu', type: 'ui', elements: [] });
  });
});

describe('inspector rows', () => {
  it('offer the shapes of a union and a tagged union, and name tuple cells', () => {
    const level = { ...doc(), world: { projection: 'isometric' } };
    const rows = inspectNode(level, ['world']);
    const projection = rows.find((row) => row.key === 'projection')!;
    expect(projection.alternatives?.map((a) => a.label)).toEqual(expect.arrayContaining(['isometric', '{ type, ratio }']));
    expect(projection.alternatives?.find((a) => a.label === '{ type, ratio }')?.value).toEqual({ type: expect.any(String) });

    const ui = { version: 2, type: 'ui', elements: [{ type: 'rect', id: 'bg', fill: true }] };
    const [element] = inspectNode(ui, ['elements']);
    expect(element!.alternatives?.map((a) => a.label)).toEqual(['button', 'text', 'image', 'rect']);
    expect(element!.alternatives?.find((a) => a.label === 'button')?.value).toMatchObject({ type: 'button' });

    const sheet = { ...doc(), assets: { spritesheets: { hero: { url: 'h.png', frameWidth: 8, frameHeight: 8, animations: { run: { frames: [[0, 0], [1, 0]] } } } } } };
    const frames = inspectNode(sheet, ['assets', 'spritesheets', 'hero', 'animations', 'run', 'frames']);
    expect(frames[0]!.tuple?.map((t) => t.kind)).toEqual(['number', 'number']);
  });
});
