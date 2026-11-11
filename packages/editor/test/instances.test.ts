import { describe, it, expect } from 'vitest';
import { encodeInstance, decodeInstance } from '../src/viewport.ts';

/**
 * A prop instance has no id; the editor addresses it as
 * `props:<layer>:<prop>:<index>`, which no object id can collide with
 * (ids cannot hold a colon).
 */
describe('instance ids', () => {
  it('round-trips', () => {
    expect(decodeInstance(encodeInstance({ layer: 2, prop: 17, index: 1105 }))).toEqual({ layer: 2, prop: 17, index: 1105 });
  });

  it('refuses everything else', () => {
    expect(decodeInstance('crate-3')).toBeNull();
    expect(decodeInstance('props:a:b:c')).toBeNull();
    expect(decodeInstance('props:1:2')).toBeNull();
    expect(decodeInstance('props:-1:0:0')).toBeNull();
  });
});
