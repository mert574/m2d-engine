import { describe, it, expect } from 'vitest';
import { LENGTH, HEIGHT, BAND, ACTS, buildMeadow } from '../src/scroller/meadow.js';

/**
 * Beeline's lane is generated, and the scroll window only moves forward, so
 * a few properties are load-bearing: everything collectable sits inside the
 * flight band (or a perfect run is impossible), the hazards keep to their
 * acts, and the layout is a pure function of its seed (or the determinism
 * contract breaks at the source).
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

  it('keeps each hazard to its act and out of the dusk glide', () => {
    for (const thistle of meadow.thistles) {
      expect(thistle.x).toBeGreaterThanOrEqual(ACTS.thistles);
      expect(thistle.x).toBeLessThan(ACTS.hollow);
    }
    for (const wasp of meadow.wasps) {
      expect(wasp.x).toBeGreaterThanOrEqual(ACTS.wasps);
      expect(wasp.x).toBeLessThan(ACTS.hollow);
      expect(wasp.y - wasp.amp).toBeGreaterThan(0);
      expect(wasp.y + wasp.amp).toBeLessThan(HEIGHT);
    }
    for (const web of meadow.webs) {
      expect(web.x).toBeGreaterThanOrEqual(ACTS.hollow);
      expect(web.x).toBeLessThan(ACTS.glide);
    }
    // Nothing hostile near the hive, so the arrival is an arrival.
    const plaza = meadow.hive.x - 400;
    for (const list of [meadow.thistles, meadow.wasps, meadow.webs]) {
      expect(list.every(thing => thing.x < plaza)).toBe(true);
    }
  });

  it('leaves room to pass every web', () => {
    // A web never seals the band: above or below it, at least a bee's
    // height and a half of clear air remains.
    for (const web of meadow.webs) {
      const above = (web.y - web.h / 2) - BAND.top;
      const below = BAND.bottom - (web.y + web.h / 2);
      expect(Math.max(above, below)).toBeGreaterThan(40);
    }
  });

  it('builds the same lane every time', () => {
    expect(buildMeadow()).toEqual(meadow);
  });
});
