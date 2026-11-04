import { generateMaze } from './generateMaze.js';

/**
 * A garden of walled courts.
 *
 * Each court is exactly one screen: 21×15 tiles of 32px under a 672×480
 * view, which is what lets the camera's `'rooms'` mode treat court and
 * screen as the same thing. Every court is its own hedge maze, carved by
 * the same backtracker the old stone maze used; the courts connect through
 * gates cut into their shared hedges, along a spanning tree so the whole
 * garden is walkable, plus a loop or two on the larger maps so there is
 * more than one way round.
 *
 * Everything is seeded: the same map config always builds the same garden.
 */

export const TILE = 32;
export const COURT = { cols: 21, rows: 15 };
export const COURT_PX = { width: COURT.cols * TILE, height: COURT.rows * TILE };

/** The three maps, walked in order. Odd court dimensions carve cleanly. */
export const MAPS = [
  {
    scene: 'court1', courtsX: 2, courtsY: 2, seed: 0x90dd,
    name: 'The East Lawn',
    banner: 'The east lawn is yours. On to the long borders...'
  },
  {
    scene: 'court2', courtsX: 3, courtsY: 2, seed: 0x51be,
    name: 'The Long Borders',
    banner: 'The borders are walked. The old yew court waits...'
  },
  {
    scene: 'court3', courtsX: 3, courtsY: 3, seed: 0xc0a7,
    name: 'The Old Yew Court',
    banner: 'Every court in bloom. The garden is yours.',
    last: true
  }
];

/** The generator's own LCG, so a map never depends on call order. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Build one map: a global wall grid stitched from per-court mazes, the
 * gates between them, and everything the scene and backdrop place from it.
 */
export function buildMap({ courtsX, courtsY, seed }) {
  const rand = makeLcg(seed);
  const cols = courtsX * COURT.cols;
  const rows = courtsY * COURT.rows;

  // Each court is an independent maze; the border ring of each stays wall
  // until a gate is cut, so adjacent courts read as one thick hedge.
  const wall = Array.from({ length: rows }, () => Array(cols).fill(true));
  for (let cy = 0; cy < courtsY; cy++) {
    for (let cx = 0; cx < courtsX; cx++) {
      const court = generateMaze(COURT.cols, COURT.rows, (seed ^ (cx * 73856093 + cy * 19349663)) >>> 0);
      for (let y = 0; y < COURT.rows; y++) {
        for (let x = 0; x < COURT.cols; x++) {
          wall[cy * COURT.rows + y][cx * COURT.cols + x] = court[y][x];
        }
      }
    }
  }

  // Connect the courts: a backtracker over the court grid gives a spanning
  // tree, then the larger maps get an extra edge or two as loops.
  const visited = Array.from({ length: courtsY }, () => Array(courtsX).fill(false));
  const edges = [];
  const unused = [];
  visited[0][0] = true;
  const stack = [[0, 0]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < courtsX && ny < courtsY && !visited[ny][nx];
    });
    if (!open.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = open[Math.floor(rand() * open.length)];
    visited[cy + dy][cx + dx] = true;
    edges.push({ from: [cx, cy], to: [cx + dx, cy + dy] });
    stack.push([cx + dx, cy + dy]);
  }
  for (let cy = 0; cy < courtsY; cy++) {
    for (let cx = 0; cx < courtsX; cx++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= courtsX || ny >= courtsY) continue;
        const used = edges.some(e =>
          (e.from[0] === cx && e.from[1] === cy && e.to[0] === nx && e.to[1] === ny) ||
          (e.from[0] === nx && e.from[1] === ny && e.to[0] === cx && e.to[1] === cy));
        if (!used) unused.push({ from: [cx, cy], to: [nx, ny] });
      }
    }
  }
  const loops = Math.min(unused.length, courtsX * courtsY >= 6 ? 2 : 1);
  for (let i = 0; i < loops; i++) {
    edges.push(unused.splice(Math.floor(rand() * unused.length), 1)[0]);
  }

  // Cut each gate: two border cells opened at a corridor-aligned offset, so
  // the passage always meets a carved cell on both sides.
  const gates = [];
  for (const { from, to } of edges) {
    const [ax, ay] = from, [bx, by] = to;
    if (ay === by) {
      // East-west: a random odd row, away from the court's corners.
      const row = 3 + 2 * Math.floor(rand() * 5);
      const y = ay * COURT.rows + row;
      const x = Math.max(ax, bx) * COURT.cols;
      wall[y][x - 1] = false;
      wall[y][x] = false;
      gates.push({ x: x * TILE, y: (y + 0.5) * TILE, dir: 'ew' });
    } else {
      // North-south: a random odd column.
      const col = 3 + 2 * Math.floor(rand() * 8);
      const x = ax * COURT.cols + col;
      const y = Math.max(ay, by) * COURT.rows;
      wall[y - 1][x] = false;
      wall[y][x] = false;
      gates.push({ x: (x + 0.5) * TILE, y: y * TILE, dir: 'ns' });
    }
  }

  const start = { x: 1.5 * TILE, y: 1.5 * TILE };
  const goal = {
    x: ((courtsX - 1) * COURT.cols + 11.5) * TILE,
    y: ((courtsY - 1) * COURT.rows + 7.5) * TILE
  };
  // The fountain needs its plaza: clear the hedge around the goal cell.
  const gx = (courtsX - 1) * COURT.cols + 11;
  const gy = (courtsY - 1) * COURT.rows + 7;
  for (let y = gy - 1; y <= gy + 1; y++) {
    for (let x = gx - 1; x <= gx + 1; x++) wall[y][x] = false;
  }

  // Dead ends become flower beds: a passage cell with one open neighbour,
  // not too near the start or the fountain.
  const flowerBeds = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (wall[y][x]) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([dx, dy]) => !wall[y + dy][x + dx]).length;
      if (open !== 1) continue;
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      if (Math.hypot(px - start.x, py - start.y) < TILE * 3) continue;
      if (Math.hypot(px - goal.x, py - goal.y) < TILE * 3) continue;
      flowerBeds.push({ x: px, y: py, seed: (x * 31 + y * 57) % 997 });
    }
  }

  return {
    wall,
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    start,
    goal,
    gates,
    flowerBeds
  };
}

/**
 * Merge wall cells into as few rectangles as possible (horizontal runs
 * first, leftovers as vertical runs), so the physics world holds dozens of
 * static bodies instead of hundreds of 32px squares.
 */
export function wallObjects(wall) {
  const rows = wall.length, cols = wall[0].length;
  const used = Array.from({ length: rows }, () => Array(cols).fill(false));
  const runs = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!wall[y][x] || used[y][x]) continue;
      let w = 0;
      while (x + w < cols && wall[y][x + w] && !used[y][x + w]) w++;
      if (w < 2) continue;
      for (let k = 0; k < w; k++) used[y][x + k] = true;
      runs.push({ x, y, w, h: 1 });
      x += w - 1;
    }
  }
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (!wall[y][x] || used[y][x]) continue;
      let h = 0;
      while (y + h < rows && wall[y + h][x] && !used[y + h][x]) h++;
      for (let k = 0; k < h; k++) used[y + k][x] = true;
      runs.push({ x, y, w: 1, h });
    }
  }

  return runs.map(r => ({
    prefab: 'hedge',
    x: (r.x + r.w / 2) * TILE,
    y: (r.y + r.h / 2) * TILE,
    width: r.w * TILE,
    height: r.h * TILE
  }));
}
