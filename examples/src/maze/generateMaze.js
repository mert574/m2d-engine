/**
 * Carve a maze with an iterative backtracker over a fixed-seed PRNG, so the
 * layout is deterministic: every visitor (and every bug report) sees the same
 * maze. Returns a boolean grid, true = wall. Cells and walls both occupy one
 * grid square, which is why the dimensions must be odd.
 *
 * Shared by the level (as physics bodies) and the main menu (as a survey
 * drawing), so the two are recognisably the same kind of place.
 *
 * @param {number} cols
 * @param {number} rows
 * @param {number} seed
 * @returns {boolean[][]}
 */
export function generateMaze(cols, rows, seed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const wall = Array.from({ length: rows }, () => Array(cols).fill(true));
  wall[1][1] = false;
  const stack = [[1, 1]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const open = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && wall[ny][nx];
    });
    if (!open.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = open[Math.floor(rand() * open.length)];
    wall[y + dy / 2][x + dx / 2] = false;
    wall[y + dy][x + dx] = false;
    stack.push([x + dx, y + dy]);
  }
  return wall;
}

/**
 * Shortest route between two passage cells, as a list of `[x, y]` grid
 * cells. Breadth-first over four-connected passages; a perfect maze has
 * exactly one route, so this is also the only one.
 *
 * @param {boolean[][]} wall
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @returns {Array<[number, number]>}
 */
export function solveMaze(wall, from, to) {
  const rows = wall.length, cols = wall[0].length;
  const key = (x, y) => y * cols + x;
  const previous = new Map([[key(...from), null]]);
  const queue = [from];

  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || wall[ny][nx]) continue;
      if (previous.has(key(nx, ny))) continue;
      previous.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }

  const path = [];
  for (let cell = to; cell; cell = previous.get(key(...cell))) path.push(cell);
  return path.reverse();
}
