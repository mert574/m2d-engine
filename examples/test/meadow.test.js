import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Bee } from '../src/scroller/meadowActors.js';

/**
 * Beeline's lane is a scene file a person edits, and the scroll window
 * only moves forward, so what has to hold is a property of the file, not
 * of the script that seeded it: everything collectable sits inside the
 * bee's flight band and the world (or a perfect run is impossible), the
 * hive is the end of the lane with nothing hostile at its door, and every
 * web leaves a way past.
 */

const LANE = JSON.parse(readFileSync(new URL('../src/scroller/scenes/lane.json', import.meta.url), 'utf8'));
const objects = LANE.layers.flatMap((layer) => layer.objects);
const placed = (...prefabs) => objects.filter((object) => prefabs.includes(object.prefab));

/** The bee's flight band as the lane gives it: the placed bee's own, or its actor's defaults. */
function band() {
  const bee = placed('player')[0];
  const initial = (name) => Bee.properties[name].initial;
  return {
    top: bee?.properties?.bandTop ?? initial('bandTop'),
    bottom: bee?.properties?.bandBottom ?? initial('bandBottom')
  };
}

describe('the meadow lane', () => {
  const { width, height } = LANE.world;
  const flight = band();

  it('scrolls forward along a lane that has an end', () => {
    expect(LANE.world.camera.mode).toBe('scroll');
    expect(LANE.world.camera.scrollVelocity.x).toBeGreaterThan(0);
    expect(placed('player')).toHaveLength(1);
    expect(placed('front')).toHaveLength(1);
  });

  it('keeps every pollen grain inside the flight band and the world', () => {
    const pollen = placed('pollen');
    expect(pollen.length).toBeGreaterThan(0);
    for (const grain of pollen) {
      expect(grain.y, grain.id).toBeGreaterThanOrEqual(flight.top);
      expect(grain.y, grain.id).toBeLessThanOrEqual(flight.bottom);
      expect(grain.x, grain.id).toBeGreaterThan(0);
      expect(grain.x, grain.id).toBeLessThan(width);
    }
  });

  it('keeps each wasp\'s swing inside the world', () => {
    for (const wasp of placed('wasp')) {
      const amp = wasp.properties?.amp ?? 80;
      expect(wasp.y - amp, wasp.id).toBeGreaterThan(0);
      expect(wasp.y + amp, wasp.id).toBeLessThan(height);
    }
  });

  it('ends at the hive, with nothing hostile at its door', () => {
    const [hive] = placed('hive');
    expect(hive.x).toBeLessThan(width);
    const plaza = hive.x - 400;
    for (const thing of placed('bramble-a', 'bramble-b', 'wasp', 'web')) {
      expect(thing.x, thing.id).toBeLessThan(plaza);
    }
  });

  it('leaves room to pass every web', () => {
    // A web never seals the band: above or below it, at least a bee's
    // height and a half of clear air remains.
    for (const web of placed('web')) {
      const above = (web.y - web.height / 2) - flight.top;
      const below = flight.bottom - (web.y + web.height / 2);
      expect(Math.max(above, below), web.id).toBeGreaterThan(40);
    }
  });
});
