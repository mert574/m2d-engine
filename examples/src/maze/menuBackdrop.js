import { generateMaze, solveMaze } from './generateMaze.js';

/**
 * The maze's menu: a survey of a labyrinth.
 *
 * The level is a maze seen from above, so the menu is the plan of one. The
 * walls are drawn as thin lines on near-black, the way a site survey would
 * draw them, and a thread works its way from entry to exit, lighting the
 * walls around it as it goes. When it arrives, the exit flares, the thread
 * fades and it sets off again. Nothing else moves: the picture is a
 * document, and the thread is the only living thing in it.
 *
 * The maze is a different one from the level's, so the menu does not give
 * the route away, but it is carved by the same generator and drawn to the
 * same proportions.
 */

const COLS = 37;
const ROWS = 25;
const SEED = 0xA12E;
// The plan is sized to cover the display, so its margins are cropped at
// some aspect ratios. The route starts and ends a few cells in, where the
// markers stay in view from 4:3 to 21:9.
const ENTRY = [5, 5];
const EXIT = [COLS - 6, ROWS - 6];

/** Thread speed, in cells per second. */
const PACE = 5.5;
/** How long the exit holds its flare before the thread resets, in seconds. */
const HOLD = 2.4;
/** How long the fade-out takes, in seconds. */
const FADE = 1.1;

const INK = 'rgba(79, 217, 155, 0.17)';
const INK_LIT = 'rgba(140, 240, 190, 0.6)';
const THREAD = '#4fd99b';
const HEAD = '#dafff0';

export class MazeSurvey {
  constructor() {
    this.wall = generateMaze(COLS, ROWS, SEED);
    this.path = solveMaze(this.wall, ENTRY, EXIT);
    this.segments = mergeWalls(this.wall);
    this.progress = 0;
    this.phase = 'walk';
    this.timer = 0;
  }

  update(deltaTime) {
    switch (this.phase) {
      case 'walk':
        this.progress = Math.min(this.path.length - 1, this.progress + PACE * deltaTime);
        if (this.progress >= this.path.length - 1) {
          this.phase = 'hold';
          this.timer = 0;
        }
        break;
      case 'hold':
        this.timer += deltaTime;
        if (this.timer >= HOLD) {
          this.phase = 'fade';
          this.timer = 0;
        }
        break;
      case 'fade':
        this.timer += deltaTime;
        if (this.timer >= FADE) {
          this.phase = 'walk';
          this.progress = 0;
        }
        break;
    }
  }

  /** The grid's cell size and origin for this frame, covering the display. */
  #layout(width, height) {
    const cell = Math.max(width / (COLS - 1), height / (ROWS - 1));
    return {
      cell,
      originX: (width - (COLS - 1) * cell) / 2,
      originY: (height - (ROWS - 1) * cell) / 2
    };
  }

  /** Where along the path the thread's head is, in grid units. */
  #head() {
    const index = Math.floor(this.progress);
    const next = Math.min(this.path.length - 1, index + 1);
    const t = this.progress - index;
    const [ax, ay] = this.path[index];
    const [bx, by] = this.path[next];
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }

  draw(paint, { width, height, elapsed }) {
    const { cell, originX, originY } = this.#layout(width, height);
    const at = ([gx, gy]) => ({ x: originX + gx * cell, y: originY + gy * cell });
    const head = at(this.#head());
    const threadAlpha = this.phase === 'fade' ? 1 - this.timer / FADE : 1;
    const reach = cell * 5;

    // The lantern around the head, under everything so the walls sit on it.
    paint.drawRect({
      x: head.x - reach, y: head.y - reach, width: reach * 2, height: reach * 2,
      fillStyle: {
        type: 'radial', x: head.x, y: head.y, r0: 0, r1: reach,
        stops: [
          { offset: 0, color: 'rgba(79, 217, 155, 0.16)' },
          { offset: 1, color: 'rgba(79, 217, 155, 0)' }
        ]
      },
      globalAlpha: threadAlpha
    });

    // Walls: faint everywhere, lit within the lantern's reach.
    for (const segment of this.segments) {
      const a = at(segment.from);
      const b = at(segment.to);
      paint.drawLine({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, strokeStyle: INK, lineWidth: 1.5 });
    }
    for (const segment of this.segments) {
      const a = at(segment.from);
      const b = at(segment.to);
      const distance = segmentDistance(head.x, head.y, a.x, a.y, b.x, b.y);
      if (distance > reach) continue;
      paint.drawLine({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        strokeStyle: INK_LIT,
        lineWidth: 1.5,
        globalAlpha: (1 - distance / reach) * threadAlpha
      });
    }

    // Markers at either end.
    const entry = at(ENTRY);
    const exit = at(EXIT);
    this.#marker(paint, entry, cell, 'ENTRY', 1);
    const pulse = this.phase === 'hold'
      ? 1 + Math.min(1, this.timer / 0.6) * 1.6
      : 1 + 0.15 * Math.sin(elapsed * 3);
    this.#marker(paint, exit, cell * pulse, 'EXIT', this.phase === 'hold' ? 1 : 0.7);

    // The thread so far, with a soft halo under it.
    const count = Math.floor(this.progress) + 1;
    const points = this.path.slice(0, count).map(at);
    points.push(head);
    if (points.length >= 2) {
      paint.drawPath({ points, strokeStyle: THREAD, lineWidth: 7, globalAlpha: 0.12 * threadAlpha });
      paint.drawPath({ points, strokeStyle: THREAD, lineWidth: 2, globalAlpha: 0.9 * threadAlpha });
    }
    paint.drawArc({ x: head.x, y: head.y, radius: 3.5, fillStyle: HEAD, globalAlpha: threadAlpha });

    // The survey readout, top right, out of the column's way.
    const percent = Math.round((this.progress / (this.path.length - 1)) * 100);
    paint.drawText({
      text: `SURVEY ${String(COLS).padStart(2, '0')}×${String(ROWS).padStart(2, '0')}   ROUTE ${String(percent).padStart(3, ' ')}%`,
      x: width - 40, y: 36,
      textAlign: 'right',
      fontFamily: '$font.mono',
      fontSize: 11,
      letterSpacing: 2,
      fillStyle: 'rgba(79, 217, 155, 0.55)'
    });
  }

  /** A square outline with a small caption, the way a plan labels a door. */
  #marker(paint, point, size, label, alpha) {
    const half = size * 0.32;
    paint.drawRect({
      x: point.x - half, y: point.y - half, width: half * 2, height: half * 2,
      strokeStyle: THREAD, lineWidth: 1.5, fill: false, globalAlpha: 0.8 * alpha
    });
    paint.drawText({
      text: label,
      x: point.x + half + 8, y: point.y,
      textBaseline: 'middle',
      fontFamily: '$font.mono',
      fontSize: 10,
      letterSpacing: 2,
      fillStyle: THREAD,
      globalAlpha: 0.7 * alpha
    });
  }
}

/**
 * Turn the wall grid into line segments between the centres of adjacent
 * wall cells, merged into runs. A few hundred lines instead of a few
 * thousand, and no doubled strokes where runs would overlap.
 */
function mergeWalls(wall) {
  const rows = wall.length, cols = wall[0].length;
  const segments = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!wall[y][x]) continue;
      let w = 0;
      while (x + w + 1 < cols && wall[y][x + w + 1]) w++;
      if (w > 0) segments.push({ from: [x, y], to: [x + w, y] });
      x += w;
    }
  }
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (!wall[y][x]) continue;
      let h = 0;
      while (y + h + 1 < rows && wall[y + h + 1][x]) h++;
      if (h > 0) segments.push({ from: [x, y], to: [x, y + h] });
      y += h;
    }
  }
  return segments;
}

/** Distance from a point to a segment. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** `UIBackdrop` options for the maze's menu. */
export const menuBackdrop = {
  gradient: { from: '#040b08', to: '#0b1d15', angle: 120 },
  layers: [new MazeSurvey()],
  motes: 0,
  vignette: 0.6
};
