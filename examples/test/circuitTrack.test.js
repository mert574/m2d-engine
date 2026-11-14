import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Track, WALL_SPACING } from '../src/circuit/track.js';

/**
 * Night Circuit's barriers are cut from the road path a person edits.
 * Whatever the path, they are short pieces along the edges: one far longer
 * than the spacing is a wall across the road.
 */

const CIRCUITS = readdirSync(new URL('../src/circuit/scenes/', import.meta.url)).filter((f) => /^circuit\d+\.json$/.test(f)).map((f) => f.replace('.json', ''));
const road = (name) => JSON.parse(readFileSync(new URL(`../src/circuit/scenes/${name}.json`, import.meta.url), 'utf8')).paths.road.points;

/** On the outside of a tight corner the edge outruns the centreline, so a piece may reach about twice the spacing. */
const longestWall = (track) => Math.max(...track.walls.map((wall) => wall.length));

describe('Night Circuit\'s track', () => {
  it.each(CIRCUITS)('%s is barriered in short pieces with a width everywhere', (name) => {
    const track = new Track(road(name));
    expect(track.samples.every((sample) => Number.isFinite(sample.x + sample.y + sample.w))).toBe(true);
    expect(longestWall(track)).toBeLessThan(WALL_SPACING * 4);
  });

  it('gives points without a width their neighbours\' and never walls across the road', () => {
    const points = road('circuit1').map((point, i) => (i >= 12 && i < 20 ? { x: point.x, y: point.y } : point));
    const track = new Track(points);
    const widths = track.controls.slice(11, 21).map((point) => point.w);
    const [from, to] = [widths[0], widths[widths.length - 1]];
    expect(widths.every((w) => w >= Math.min(from, to) && w <= Math.max(from, to))).toBe(true);
    expect(longestWall(track)).toBeLessThan(WALL_SPACING * 4);
  });

  it('falls back to a default width when no point has one', () => {
    const track = new Track(road('circuit2').map(({ x, y }) => ({ x, y })));
    expect(track.controls.every((point) => point.w > 0)).toBe(true);
    expect(longestWall(track)).toBeLessThan(WALL_SPACING * 4);
  });
});
