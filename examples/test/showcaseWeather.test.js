import { describe, it, expect } from 'vitest';
import { Weather, HOUR_MODES, FRONT_MODES } from '../src/showcase/weather.js';

/** The showcase's cycles can be held, for comparing backends on one look. */
describe('the showcase\'s weather', () => {
  it('holds the light at an hour, and turns on from there when let go', () => {
    const weather = new Weather({});
    weather.holdHour('night');
    weather.update(60);
    expect(weather.hour).toBe('night');
    expect(weather.held).toBe(true);
    weather.holdHour('cycle');
    expect(weather.held).toBe(false);
    weather.update(10);
    expect(weather.cycle.phase).toBeGreaterThan(1);
  });

  it('holds the front calm or at full blow, with no strike while held', () => {
    const weather = new Weather({});
    weather.holdFront('calm');
    expect(weather.strength).toBe(0);
    weather.holdFront('squall');
    expect(weather.strength).toBe(1);
    for (let t = 0; t < 150; t += 0.25) {
      weather.update(0.25);
      expect(weather.strike).toBeNull();
    }
    weather.holdFront('cross');
    expect(weather.held).toBe(false);
  });

  it('offers every hour and both holds as modes', () => {
    expect(HOUR_MODES).toEqual(['cycle', 'dusk', 'night', 'first light']);
    expect(FRONT_MODES).toEqual(['cross', 'calm', 'squall']);
  });
});
