import { describe, it, expect } from 'vitest';
import { applyOps, stage, structure, type Rest } from '../src/index.ts';

const level = (): Record<string, unknown> => ({
  version: 4, type: 'level', name: 'yard',
  world: { gravity: { x: 0, y: 900 }, player: 'hero', camera: { bounds: 'world', zoom: 2 }, rules: [{ when: 'start', do: [] }] },
  prefabs: {
    hero: { actor: 'Player', physics: { bodyType: 'dynamic' } },
    crate: { actor: 'Crate', physics: { bodyType: 'dynamic' } },
    wall: { actor: 'Platform', physics: { bodyType: 'static' } }
  },
  paths: { beat: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } },
  hud: [{ type: 'text', id: 'score', x: 0, y: 0 }],
  layers: [{
    name: 'main',
    objects: [
      { id: 'hero', prefab: 'hero', x: 10, y: 20 },
      { id: 'crate-1', prefab: 'crate', x: 100, y: 50 },
      { id: 'crate-2', prefab: 'crate', x: 200, y: 50, angle: 0.5 },
      { id: 'floor', prefab: 'wall', x: 0, y: 300 }
    ]
  }]
});

const rest = (id: string, fields: Partial<Rest> = {}): Rest => ({ id, bodyType: 'dynamic', x: 0, y: 0, moved: 10, ...fields });

describe('the player', () => {
  it('is world.player, or the first object whose actor is Player', () => {
    expect(stage.playerObjectId(level())).toBe('hero');
    const unnamed = level();
    delete (unnamed.world as Record<string, unknown>).player;
    expect(stage.playerObjectId(unnamed)).toBe('hero');
    delete (unnamed.prefabs as Record<string, unknown>).hero;
    (unnamed.layers as Array<{ objects: unknown[] }>)[0]!.objects.shift();
    expect(stage.playerObjectId(unnamed)).toBeNull();
  });

  it('starts somewhere else in a copy, the scene untouched', () => {
    const data = level();
    const moved = stage.playFrom(data, { x: 400, y: 120 });
    expect(structure.valueAt(moved, ['layers', 0, 'objects', 0])).toMatchObject({ id: 'hero', x: 400, y: 120 });
    expect(structure.valueAt(data, ['layers', 0, 'objects', 0, 'x'])).toBe(10);
    (data.world as Record<string, unknown>).player = 'ghost';
    expect(() => stage.playFrom(data, { x: 0, y: 0 })).toThrow(/no placed object has that id/);
  });
});

describe('a prefab stage', () => {
  it('holds the prefab above a floor in the scene\'s world, without its objects, rules, HUD or player', () => {
    const staged = stage.prefabStage(level(), 'crate');
    const objects = structure.valueAt(staged, ['layers', 0, 'objects']) as Array<{ id: string; prefab: string }>;
    expect(objects.map((o) => [o.id, o.prefab])).toEqual([['stage-floor', 'stage-floor'], ['stage', 'crate']]);
    expect(staged.world).toEqual({ gravity: { x: 0, y: 900 }, camera: { zoom: 2, follow: 'stage' } });
    expect(staged.hud).toBeUndefined();
    expect(staged.paths).toEqual(level().paths);
    expect(Object.keys(staged.prefabs as object)).toEqual(['hero', 'crate', 'wall', 'stage-floor']);
    expect(() => stage.prefabStage(level(), 'nope')).toThrow(/no prefab 'nope'/);
  });

  it('takes the first placed instance\'s size and properties, resting just above the floor', () => {
    const data = level();
    Object.assign(structure.valueAt(data, ['layers', 0, 'objects', 1]) as object, { width: 40, height: 40, properties: { label: 'A' } });
    const staged = structure.valueAt(stage.prefabStage(data, 'crate'), ['layers', 0, 'objects', 1]) as Record<string, number>;
    expect(staged).toEqual({ id: 'stage', prefab: 'crate', x: 0, y: 120, width: 40, height: 40, properties: { label: 'A' } });
    const floorTop = 160 - 24 / 2;
    expect(staged.y! + staged.height! / 2).toBeLessThan(floorTop);
  });

  it('is one variant or the other, never both', () => {
    expect(stage.variantOf(level(), {})).toEqual(level());
    expect(() => stage.variantOf(level(), { prefab: 'crate', from: { x: 0, y: 0 } })).toThrow(/not both/);
  });
});

describe('settling', () => {
  it('writes the dynamic bodies that moved, not the player, the static or the still', () => {
    const data = level();
    const { ops, moved } = stage.settleOps(data, [
      rest('hero', { y: 280 }),
      rest('crate-1', { x: 100.456, y: 271.234, angle: 0.00001 }),
      rest('crate-2', { x: 200, y: 260, angle: 1.23456 }),
      rest('floor', { bodyType: 'static' }),
      rest('crate-x', { bodyType: 'dynamic', moved: 0.1 })
    ]);
    expect(moved).toEqual(['crate-1', 'crate-2']);
    applyOps(data, ops);
    expect(structure.valueAt(data, ['layers', 0, 'objects', 1])).toEqual({ id: 'crate-1', prefab: 'crate', x: 100.46, y: 271.23 });
    expect(structure.valueAt(data, ['layers', 0, 'objects', 2])).toMatchObject({ x: 200, y: 260, angle: 1.2346 });
  });

  it('takes the runtime body type, limits to ids, and skips what was composed', () => {
    const data = level();
    expect(stage.settleOps(data, [rest('crate-1', { bodyType: 'kinematic' })]).moved).toEqual([]);
    expect(stage.settleOps(data, [rest('crate-1'), rest('crate-2')], ['crate-2']).moved).toEqual(['crate-2']);
    expect(stage.settleOps(data, [rest('room-1/crate')]).moved).toEqual([]);
  });

  it('writes a 3D rest as position and a scene quaternion', () => {
    const data = level();
    (data.world as Record<string, unknown>).dimensions = 3;
    const { ops } = stage.settleOps(data, [rest('crate-1', { x: 1.23456, y: 0.5, z: -2, rotation: [0, 0.7071068, 0, 0.7071068] })]);
    applyOps(data, ops);
    expect(structure.valueAt(data, ['layers', 0, 'objects', 1])).toMatchObject({ x: 1.235, y: 0.5, z: -2, rotation: [0, 0.707107, 0, 0.707107] });
    const still = level();
    (still.world as Record<string, unknown>).dimensions = 3;
    applyOps(still, stage.settleOps(still, [rest('crate-1', { y: 0.7, z: -1, rotation: [-0.000001, 0.000001, 0, 1] })]).ops);
    expect(structure.valueAt(still, ['layers', 0, 'objects', 1, 'rotation'])).toBeUndefined();
  });
});
