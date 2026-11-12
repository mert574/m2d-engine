import { describe, it, expect } from 'vitest';
import { applyOps, sceneOutline, structure, paths } from '../src/index.ts';

const scene = (): Record<string, unknown> => ({
  version: 4, type: 'level', name: 'room',
  prefabs: {
    platform: { actor: 'MovingPlatform' },
    guard: { actor: 'Guard', constraints: { patrol: { type: 'PathFollow', params: { path: 'beat' } } } }
  },
  paths: {
    lift: { points: [{ x: 0, y: 0 }, { x: 0, y: -200 }] },
    beat: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true, smooth: true }
  },
  layers: [{
    name: 'main',
    objects: [
      { id: 'lift-1', prefab: 'platform', x: 0, y: 0, properties: { path: { path: 'lift', speed: 80 } } },
      { id: 'shuttle', prefab: 'platform', x: 0, y: 0, properties: { path: { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] } } },
      { id: 'guard-1', prefab: 'guard', x: 0, y: 0 }
    ]
  }]
});

describe('paths in the editor core', () => {
  it('lists them in the tree with their shape', () => {
    const group = sceneOutline(scene()).children!.find((node) => node.label === 'Paths')!;
    expect(group.children!.map((node) => [node.label, node.detail, node.kind])).toEqual([
      ['lift', '2 points', 'path'],
      ['beat', '3 points, smooth, closed', 'path']
    ]);
  });

  it('finds the point lists a selection shows', () => {
    const doc = scene();
    expect(paths.pointListsFor(doc, ['paths', 'beat'])).toEqual([{ points: ['paths', 'beat', 'points'], name: 'beat', closed: true, smooth: true }]);
    expect(paths.pointListsFor(doc, ['layers', 0, 'objects', 0]).map((list) => list.name)).toEqual(['lift']);
    expect(paths.pointListsFor(doc, ['layers', 0, 'objects', 1])).toEqual([
      { points: ['layers', 0, 'objects', 1, 'properties', 'path', 'points'], closed: false, smooth: false }
    ]);
    expect(paths.pointListsFor(doc, ['layers', 0, 'objects', 2]).map((list) => list.name)).toEqual(['beat']);
    expect(paths.pointListsFor(doc, ['prefabs', 'guard'])).toEqual([]);
  });

  it('carries every reference through a rename', () => {
    const doc = scene();
    applyOps(doc, structure.renameEntry(doc, ['paths'], 'beat', 'round'));
    applyOps(doc, structure.renameEntry(doc, ['paths'], 'lift', 'shaft'));
    expect(Object.keys(doc.paths as object).sort()).toEqual(['round', 'shaft']);
    expect(structure.valueAt(doc, ['prefabs', 'guard', 'constraints', 'patrol', 'params', 'path'])).toBe('round');
    expect(structure.valueAt(doc, ['layers', 0, 'objects', 0, 'properties', 'path', 'path'])).toBe('shaft');
    expect(paths.pathUsers(doc, 'round')).toBe(1);
  });

  it('adds a path under a free name and keeps at least two points', () => {
    const doc = scene();
    const added = structure.addPath(doc, 'lift', { x: 10, y: 20 }, 100);
    applyOps(doc, added.ops);
    expect(added.name).toBe('lift-2');
    expect(structure.valueAt(doc, ['paths', 'lift-2'])).toEqual({ points: [{ x: 10, y: 20 }, { x: 110, y: 20 }] });

    applyOps(doc, paths.insertPoint(['paths', 'lift-2', 'points'], 0, { x: 60, y: 0 }));
    expect(structure.valueAt(doc, ['paths', 'lift-2', 'points', 1])).toEqual({ x: 60, y: 0 });
    applyOps(doc, paths.removePoint(doc, ['paths', 'lift-2', 'points'], 1));
    expect(() => paths.removePoint(doc, ['paths', 'lift-2', 'points'], 0)).toThrow(/at least two points/);
  });
});
