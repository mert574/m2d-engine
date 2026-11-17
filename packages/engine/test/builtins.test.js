import { describe, it, expect } from 'vitest';
import { BUILTIN_ACTORS, BUILTIN_CONSTRAINTS, BUILTIN_MODULES, Registry } from '../src/core/builtins.js';

/**
 * The built-in maps and the Registry: the editor's catalog and the MCP
 * tools read these instead of keeping lists of their own, so the maps must
 * agree with each other and with the files, and the registry must say
 * where every name came from.
 */

describe('the built-in module map', () => {
  it('names exactly the built-ins', () => {
    const names = [...BUILTIN_ACTORS.keys(), ...BUILTIN_CONSTRAINTS.keys()].sort();
    expect([...BUILTIN_MODULES.keys()].sort()).toEqual(names);
  });

  it('every path exports its class under its name', async () => {
    for (const [name, path] of BUILTIN_MODULES) {
      const module = await import(`../src/${path}`);
      const klass = BUILTIN_ACTORS.get(name) ?? BUILTIN_CONSTRAINTS.get(name);
      expect(module[name], `${path} should export ${name}`).toBe(klass);
    }
  });
});

describe('a registry', () => {
  class Own {}
  it('tells engine, kit and game names apart', () => {
    const registry = new Registry(new Map([['Prop', Own]]));
    expect(registry.originOf('Prop')).toBe('engine');
    registry.set('Mine', Own);
    expect(registry.originOf('Mine')).toBe('game');
    registry.set('Shared', Own, 'kit');
    expect(registry.originOf('Shared')).toBe('kit');
    // A game registering over a built-in name owns it.
    registry.set('Prop', Own);
    expect(registry.originOf('Prop')).toBe('game');
    registry.delete('Prop');
    expect(registry.originOf('Prop')).toBe('engine');
    expect(registry.originOf('Nothing')).toBeUndefined();
  });
});
