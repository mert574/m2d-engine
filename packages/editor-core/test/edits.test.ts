import { describe, it, expect } from 'vitest';
import { SceneDocument, applyOps, uniqueId, formatPath, parsePath, EditError, type Op } from '../src/index.ts';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';

/**
 * Edits as data: every op applies, inverts to ops that restore the
 * document exactly, and fails whole. The document's history and its
 * dirty flag ride on top.
 */

const level = () => ({
  version: SCENE_VERSION, type: 'level', name: 'room',
  prefabs: { wall: { actor: 'Block', physics: { bodyType: 'static' } } },
  layers: [{
    name: 'main',
    objects: [
      { id: 'floor', prefab: 'wall', x: 0, y: 0 },
      { id: 'crate-1', prefab: 'wall', x: 10, y: 20, properties: { label: 'a' } }
    ]
  }]
});

const OBJ = ['layers', 0, 'objects'] as const;

describe('applyOps', () => {
  it('sets, adds and deletes fields, and inverts each exactly', () => {
    const data = level();
    const before = JSON.parse(JSON.stringify(data)) as typeof data;
    const inverse = applyOps(data, [
      { op: 'set', path: [...OBJ, 1, 'x'], value: 99 },
      { op: 'set', path: [...OBJ, 1, 'angle'], value: 0.5 },
      { op: 'set', path: [...OBJ, 1, 'properties'] }
    ]);
    expect(data.layers[0]!.objects[1]).toEqual({ id: 'crate-1', prefab: 'wall', x: 99, y: 20, angle: 0.5 });
    applyOps(data, inverse);
    expect(data).toEqual(before);
    // Absence is restored as absence, not as `undefined`.
    expect(Object.hasOwn(data.layers[0]!.objects[1]!, 'angle')).toBe(false);
  });

  it('inserts and removes array entries, and inverts them', () => {
    const data = level();
    const before = JSON.parse(JSON.stringify(data)) as typeof data;
    const crate = { id: 'crate-2', prefab: 'wall', x: 5, y: 5 };
    const inverse = applyOps(data, [
      { op: 'insert', path: [...OBJ], index: 1, value: crate },
      { op: 'remove', path: [...OBJ], index: 0 }
    ]);
    expect(data.layers[0]!.objects.map((o) => o.id)).toEqual(['crate-2', 'crate-1']);
    // The document owns its copy: mutating the caller's object changes nothing.
    crate.x = 1000;
    expect(data.layers[0]!.objects[0]!.x).toBe(5);
    applyOps(data, inverse);
    expect(data).toEqual(before);
  });

  it('applies all or nothing, and says where it failed', () => {
    const data = level();
    const before = JSON.parse(JSON.stringify(data)) as typeof data;
    const ops: Op[] = [
      { op: 'set', path: [...OBJ, 0, 'x'], value: 1 },
      { op: 'set', path: ['layers', 3, 'objects', 0, 'x'], value: 2 }
    ];
    expect(() => applyOps(data, ops)).toThrow(EditError);
    expect(() => applyOps(data, ops)).toThrow(/layers\[3\]/);
    expect(data).toEqual(before);
  });

  it('refuses what JSON cannot carry and what an array cannot do', () => {
    const data = level();
    expect(() => applyOps(data, [{ op: 'set', path: [...OBJ, 0, 'x'], value: Number.NaN }])).toThrow(/JSON/);
    expect(() => applyOps(data, [{ op: 'set', path: [...OBJ, 0] }])).toThrow(/remove/);
    expect(() => applyOps(data, [{ op: 'remove', path: [...OBJ], index: 7 }])).toThrow(/cannot remove/);
    expect(() => applyOps(data, [{ op: 'set', path: [], value: {} }])).toThrow(/document itself/);
  });

  it('survives a round trip through JSON, which is how it travels', () => {
    const data = level();
    const ops = JSON.parse(JSON.stringify([{ op: 'set', path: [...OBJ, 1, 'properties'], value: undefined }])) as Op[];
    applyOps(data, ops);
    expect(data.layers[0]!.objects[1]).not.toHaveProperty('properties');
  });
});

describe('SceneDocument.apply', () => {
  it('is one step of history, undone and redone by ops', () => {
    const doc = new SceneDocument(level());
    const command = doc.apply({ label: 'Move crate-1', ops: [{ op: 'set', path: [...OBJ, 1, 'x'], value: 40 }] });
    expect(command.lastOps).toEqual(command.ops);
    expect(doc.commands.history).toEqual(['Move crate-1']);

    doc.commands.undo();
    expect((doc.data.layers as never[])[0]!['objects'][1]['x']).toBe(10);
    expect(command.lastOps).toEqual([{ op: 'set', path: [...OBJ, 1, 'x'], value: 10 }]);

    doc.commands.redo();
    expect((doc.data.layers as never[])[0]!['objects'][1]['x']).toBe(40);
    expect(command.lastOps).toEqual(command.ops);
  });

  it('knows whether it is dirty without writing the scene', () => {
    const doc = new SceneDocument(level());
    expect(doc.dirty).toBe(false);
    doc.apply({ label: 'a', ops: [{ op: 'set', path: ['title'], value: 'A' }] });
    expect(doc.dirty).toBe(true);
    doc.markSaved();
    doc.apply({ label: 'b', ops: [{ op: 'set', path: ['title'], value: 'B' }] });
    doc.commands.undo();
    expect(doc.dirty).toBe(false);
    doc.commands.undo();
    expect(doc.dirty).toBe(true);          // undone past the save
    doc.apply({ label: 'c', ops: [{ op: 'set', path: ['title'], value: 'A' }] });
    expect(doc.dirty).toBe(true);          // a new branch, even with the saved text
  });
});

describe('uniqueId and formatPath', () => {
  it('numbers from the base, skipping what is taken', () => {
    const data = level();
    expect(uniqueId(data, 'lamp')).toBe('lamp');
    expect(uniqueId(data, 'floor')).toBe('floor-2');
    expect(uniqueId(data, 'crate-1')).toBe('crate-2');
  });

  it('writes a path the way the loader reports one', () => {
    expect(formatPath(['layers', 0, 'objects', 3, 'x'])).toBe('layers[0].objects[3].x');
    expect(formatPath([])).toBe('');
    expect(parsePath('layers[0].objects[3].x')).toEqual(['layers', 0, 'objects', 3, 'x']);
    expect(parsePath('')).toEqual([]);
    expect(parsePath(formatPath(['prefabs', 'wall-a', 'physics']))).toEqual(['prefabs', 'wall-a', 'physics']);
  });
});
