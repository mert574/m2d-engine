import { describe, it, expect } from 'vitest';
import { applyOps, look, structure } from '../src/index.ts';

const level = (world: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: 4, type: 'level', name: 'yard', world, layers: []
});

const cycled = () => level({
  lighting: { sky: '#ffffff', exposure: 1 },
  cycle: { states: [
    { name: 'day', lighting: { sky: '#ffffff' } },
    { name: 'dusk', lighting: { sky: '#ff0000' } },
    { name: 'night', lighting: { sky: '#000000' } }
  ], phase: 2 }
});

describe('the look at a phase', () => {
  it('is the engine\'s blend over the resting look, wrapping from the last state', () => {
    expect(look.lookAt(cycled(), 0.5).lighting).toEqual({ sky: 'rgb(255, 128, 128)', exposure: 1 });
    expect(look.lookAt(cycled(), 2.5).lighting).toMatchObject({ sky: 'rgb(128, 128, 128)' });
    expect(look.lookAt(level({ lighting: { ambient: '#123456' } }), 1)).toEqual({ lighting: { ambient: '#123456' }, post: undefined });
    const noisy = level({ cycle: { states: [{ lighting: { exposure: 0.1 } }, { lighting: { exposure: 0.3 } }] } });
    expect(look.lookAt(noisy, 0.35).lighting).toEqual({ exposure: 0.17 });
  });

  it('samples the colours a strip shows', () => {
    const strip = look.cycleColours(cycled(), 7);
    expect(strip).toHaveLength(7);
    expect(strip[0]).toEqual({ phase: 0, colours: { sky: '#ffffff' } });
    expect(strip[3]!.phase).toBe(1.5);
    expect(look.cycleColours(level(), 5)).toEqual([]);
  });
});

describe('cycle states', () => {
  it('starts a cycle from the resting look', () => {
    const data = level({ lighting: { ambient: '#336699' } });
    applyOps(data, look.startCycle(data));
    expect(structure.valueAt(data, ['world', 'cycle'])).toEqual({
      states: [{ name: 'day', lighting: { ambient: '#336699' } }, { name: 'night', lighting: { ambient: '#336699' } }], phase: 0
    });
    expect(() => look.startCycle(data)).toThrow(/already has a cycle/);
    const bare: Record<string, unknown> = { version: 4, type: 'level', layers: [] };
    applyOps(bare, look.startCycle(bare));
    expect(structure.valueAt(bare, ['world', 'cycle', 'states'])).toHaveLength(2);
  });

  it('adds the look at a phase as a state after the one it blends from', () => {
    const data = cycled();
    applyOps(data, look.addStateAt(data, 0.5, 'noon'));
    const states = structure.valueAt(data, ['world', 'cycle', 'states']) as Array<{ name: string; lighting: { sky: string } }>;
    expect(states.map((state) => state.name)).toEqual(['day', 'noon', 'dusk', 'night']);
    expect(states[1]!.lighting.sky).toBe('rgb(255, 128, 128)');
  });

  it('keeps the start phase on the state it named when one is removed', () => {
    const before = cycled();
    applyOps(before, look.removeState(before, 0));
    expect(structure.valueAt(before, ['world', 'cycle', 'phase'])).toBe(1);
    expect(structure.valueAt(before, ['world', 'cycle', 'states', 1, 'name'])).toBe('night');

    const on = cycled();
    applyOps(on, look.removeState(on, 2));
    expect(structure.valueAt(on, ['world', 'cycle', 'phase'])).toBe(1);

    const after = cycled();
    (after.world as { cycle: { phase: number } }).cycle.phase = 0;
    expect(look.removeState(after, 2)).toHaveLength(1);

    const two = level({ cycle: { states: [{}, {}] } });
    expect(() => look.removeState(two, 0)).toThrow(/at least two states/);
  });
});

describe('particle fields', () => {
  it('add written short, and read back with every default the scene draws with', () => {
    const data = level({ dimensions: 3 });
    applyOps(data, look.addParticleField(data, 'smoke', { x: 1, y: 0, z: 2 }));
    applyOps(data, look.addParticleField(data, 'motes', { x: 0, y: 1, z: 0 }));
    const fields = structure.valueAt(data, ['world', 'particles']) as Array<Record<string, unknown>>;
    expect(fields[0]).toEqual({ kind: 'smoke', count: 120, at: { x: 1, y: 0, z: 2 } });
    expect(look.particleField(fields[0]!)).toMatchObject({ radius: 0.5, opacity: 0.3, speed: 0.6, extent: { x: 0.6, y: 4, z: 0.6 } });
    expect(look.particleField({ kind: 'motes', count: 10, radius: 0.1 })).toMatchObject({ radius: 0.1, opacity: 0.6, at: { x: 0, y: 0, z: 0 } });
  });

  it('add a 2D kind to a 2D level, with no place, and refuse the other dimension\'s', () => {
    const flat = { version: 4, type: 'level', name: 'flat', world: { width: 800, height: 600 }, layers: [] };
    applyOps(flat, look.addParticleField(flat, 'fireflies', { x: 0, y: 0, z: 0 }));
    expect(structure.valueAt(flat, ['world', 'particles'])).toEqual([{ kind: 'fireflies', count: 40 }]);
    expect(() => look.addParticleField(flat, 'smoke', { x: 0, y: 0, z: 0 })).toThrow(/not drawn in a 2D level/);
    expect(() => look.addParticleField(level({ dimensions: 3 }), 'rain', { x: 0, y: 0, z: 0 })).toThrow(/not drawn in a 3D level/);
  });
});
