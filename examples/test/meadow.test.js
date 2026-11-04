import { describe, it, expect } from 'vitest';
import { LENGTH, HEIGHT, BAND, buildMeadow } from '../src/scroller/meadow.js';

/**
 * Beeline's lane is generated, and the scroll window only moves forward, so
 * two properties are load-bearing: everything collectable sits inside the
 * flight band (or a perfect run is impossible), and the layout is a pure
 * function of its seed (or the determinism contract breaks at the source).
 */
describe('the meadow lane', () => {
  const meadow = buildMeadow();

  it('keeps every pollen grain inside the flight band', () => {
    for (const grain of meadow.pollen) {
      expect(grain.y).toBeGreaterThanOrEqual(BAND.top);
      expect(grain.y).toBeLessThanOrEqual(BAND.bottom);
      expect(grain.x).toBeGreaterThan(0);
      expect(grain.x).toBeLessThan(LENGTH);
    }
  });

  it('keeps the lane inside the world and the end plaza clear', () => {
    for (const list of [meadow.flowers, meadow.brambles, meadow.wasps]) {
      for (const thing of list) {
        expect(thing.x).toBeGreaterThan(0);
        expect(thing.x).toBeLessThan(LENGTH);
      }
    }
    // Nothing hostile in the hive's plaza, so the arrival is an arrival.
    const plaza = meadow.hive.x - 400;
    expect(meadow.brambles.every(b => b.x < plaza)).toBe(true);
    expect(meadow.wasps.every(w => w.x < plaza)).toBe(true);
    expect(meadow.hive.y).toBeLessThan(HEIGHT);
  });

  it('keeps every wasp loop inside the world', () => {
    for (const wasp of meadow.wasps) {
      expect(wasp.y - wasp.amp).toBeGreaterThan(0);
      expect(wasp.y + wasp.amp).toBeLessThan(HEIGHT);
    }
  });

  it('builds the same lane every time', () => {
    expect(buildMeadow()).toEqual(meadow);
  });
});
