import { describe, it, expect } from 'vitest';
import { MAPS, COURT, TILE, buildMap, wallObjects } from '../scripts/courtyards.mjs';

/**
 * Hedgerow Court's maps are generated, so solvability is a property of the
 * generator, not something a playtest can pin once. Every shipped map must
 * be fully walkable: the fountain, every gate and every flower bed
 * reachable from the start.
 */

/** Flood-fill the passages from a cell; returns the reached set. */
function reachable(wall, fromX, fromY) {
  const rows = wall.length, cols = wall[0].length;
  const seen = new Set([fromY * cols + fromX]);
  const queue = [[fromX, fromY]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || wall[ny][nx]) continue;
      const key = ny * cols + nx;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return { seen, cols };
}

describe.each(MAPS)('map $scene ($name)', (config) => {
  const map = buildMap(config);
  const cell = ({ x, y }) => [Math.floor(x / TILE), Math.floor(y / TILE)];

  it('is built to the court grid', () => {
    expect(map.cols).toBe(config.courtsX * COURT.cols);
    expect(map.rows).toBe(config.courtsY * COURT.rows);
    // The outer hedge is unbroken: nothing walks off the map.
    expect(map.wall[0].every(Boolean)).toBe(true);
    expect(map.wall[map.rows - 1].every(Boolean)).toBe(true);
    expect(map.wall.every(row => row[0] && row[map.cols - 1])).toBe(true);
  });

  it('reaches the fountain, every gate and every flower bed from the start', () => {
    const [sx, sy] = cell(map.start);
    expect(map.wall[sy][sx]).toBe(false);
    const { seen, cols } = reachable(map.wall, sx, sy);

    const [gx, gy] = cell(map.goal);
    expect(seen.has(gy * cols + gx)).toBe(true);

    for (const bed of map.flowerBeds) {
      const [bx, by] = cell(bed);
      expect(seen.has(by * cols + bx)).toBe(true);
    }

    // A gate's two opened cells sit either side of a court border.
    for (const gate of map.gates) {
      const [cx, cy] = cell(gate);
      expect(seen.has(cy * cols + cx)).toBe(true);
    }

    // Enough gates to span the courts, so no court is sealed off.
    expect(map.gates.length).toBeGreaterThanOrEqual(config.courtsX * config.courtsY - 1);
  });

  it('builds the same garden every time', () => {
    const again = buildMap(config);
    expect(again.wall).toEqual(map.wall);
    expect(again.gates).toEqual(map.gates);
    expect(again.flowerBeds).toEqual(map.flowerBeds);
  });

  it('merges the hedges into rectangles that tile the wall grid exactly', () => {
    const covered = Array.from({ length: map.rows }, () => Array(map.cols).fill(false));
    for (const hedge of wallObjects(map.wall)) {
      const left = Math.round(hedge.x - hedge.width / 2) / TILE;
      const top = Math.round(hedge.y - hedge.height / 2) / TILE;
      for (let y = top; y < top + hedge.height / TILE; y++) {
        for (let x = left; x < left + hedge.width / TILE; x++) {
          expect(map.wall[y][x]).toBe(true);
          expect(covered[y][x]).toBe(false);
          covered[y][x] = true;
        }
      }
    }
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        expect(covered[y][x]).toBe(map.wall[y][x]);
      }
    }
  });
});
