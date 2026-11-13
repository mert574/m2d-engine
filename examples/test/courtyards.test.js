import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_OBJECT_SIZE } from 'm2d-engine/core/sceneSchema.js';
import { TILE } from '../scripts/courtyards.mjs';

/**
 * Hedgerow Court's gardens are scene files a person can edit, so what has
 * to hold is a property of the files, not of the script that seeded them:
 * every shipped court is fully walkable — the fountain and every flower
 * bed reachable from where the gardener starts — and its rules agree with
 * what it places.
 */

const COURTS = ['court1', 'court2', 'court3'];
const load = (name) => JSON.parse(readFileSync(new URL(`../src/maze/scenes/${name}.json`, import.meta.url), 'utf8'));

/** A placed object's size as the loader fills it in: the file leaves a default-sized side out. */
const sizeOf = (object) => ({ width: object.width ?? DEFAULT_OBJECT_SIZE, height: object.height ?? DEFAULT_OBJECT_SIZE });

/** The hedge objects as a boolean grid, true where a wall is. */
function wallGrid(scene) {
  const cols = scene.world.width / TILE;
  const rows = scene.world.height / TILE;
  const wall = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (const object of scene.layers.flatMap((layer) => layer.objects)) {
    if (object.prefab !== 'hedge') continue;
    const { width, height } = sizeOf(object);
    const left = Math.round((object.x - width / 2) / TILE);
    const top = Math.round((object.y - height / 2) / TILE);
    for (let y = top; y < top + height / TILE; y++) {
      for (let x = left; x < left + width / TILE; x++) wall[y][x] = true;
    }
  }
  return wall;
}

/** Flood-fill the passages from a cell; the set of reached cell keys. */
function reachable(wall, fromX, fromY) {
  const rows = wall.length, cols = wall[0].length;
  const key = (x, y) => y * cols + x;
  const seen = new Set([key(fromX, fromY)]);
  const queue = [[fromX, fromY]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || wall[ny][nx] || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return { has: (x, y) => seen.has(key(x, y)) };
}

describe.each(COURTS)('%s', (name) => {
  const scene = load(name);
  const objects = scene.layers.flatMap((layer) => layer.objects);
  const byPrefab = (prefab) => objects.filter((object) => object.prefab === prefab);
  const cell = ({ x, y }) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  const wall = wallGrid(scene);

  it('is hedged all the way round, so nothing walks off the garden', () => {
    expect(wall[0].every(Boolean)).toBe(true);
    expect(wall[wall.length - 1].every(Boolean)).toBe(true);
    expect(wall.every((row) => row[0] && row[row.length - 1])).toBe(true);
  });

  it('reaches the fountain and every flower bed from where the gardener starts', () => {
    const [sx, sy] = cell(byPrefab('player')[0]);
    expect(wall[sy][sx]).toBe(false);
    const reached = reachable(wall, sx, sy);
    const [fx, fy] = cell(byPrefab('fountain')[0]);
    expect(reached.has(fx, fy)).toBe(true);
    const sealed = byPrefab('bed').filter((bed) => !reached.has(...cell(bed))).map((bed) => bed.id);
    expect(sealed).toEqual([]);
  });

  it('counts the beds it places: the ceiling and the "all tended" rule agree with the file', () => {
    const beds = byPrefab('bed').length;
    expect(beds).toBeGreaterThan(0);
    expect(scene.world.counters.beds.max).toBe(beds);
    const done = scene.world.rules.find((rule) => rule.id === 'all-tended');
    expect(done.when).toEqual({ event: 'count', counter: 'beds', atLeast: beds });
  });
});
