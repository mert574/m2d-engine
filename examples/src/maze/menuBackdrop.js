import { generateMaze, solveMaze } from './generateMaze.js';

/**
 * The garden's menu: the head gardener's plan of a hedge maze.
 *
 * The level is a maze seen from above, so the menu is the plan of one. The
 * hedges are drawn as thin ink lines on a dark evening-green board, and a
 * bee works its way from the gate to the fountain, lighting the hedges
 * around it as it goes. When it arrives, the fountain flares, the bee's
 * route fades and it sets off again. Nothing else moves: the picture is a
 * document, and the bee is the only living thing in it.
 *
 * The maze is a different one from any of the level's, so the menu does not
 * give a route away, but it is carved by the same generator and drawn to
 * the same proportions.
 */

const COLS = 37;
const ROWS = 25;
const SEED = 0xA12E;
// The plan is sized to cover the display, so its margins are cropped at
// some aspect ratios. The route starts and ends a few cells in, where the
// markers stay in view from 4:3 to 21:9.
const ENTRY = [5, 5];
const EXIT = [COLS - 6, ROWS - 6];

/** Bee speed, in cells per second. */
const PACE = 5.5;
/** How long the fountain holds its flare before the bee resets, in seconds. */
const HOLD = 2.4;
/** How long the fade-out takes, in seconds. */
const FADE = 1.1;

const INK = 'rgba(196, 214, 150, 0.16)';
const INK_LIT = 'rgba(228, 238, 180, 0.6)';
const ROUTE = '#d8b84e';
const BEE = '#f6e3a0';

export class GardenPlan {
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

  /** Where along the path the bee is, in grid units. */
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
    const routeAlpha = this.phase === 'fade' ? 1 - this.timer / FADE : 1;
    const reach = cell * 5;

    // The patch of sun around the bee, under everything so the hedges sit
    // on it.
    paint.drawRect({
      x: head.x - reach, y: head.y - reach, width: reach * 2, height: reach * 2,
      fillStyle: {
        type: 'radial', x: head.x, y: head.y, r0: 0, r1: reach,
        stops: [
          { offset: 0, color: 'rgba(216, 184, 78, 0.14)' },
          { offset: 1, color: 'rgba(216, 184, 78, 0)' }
        ]
      },
      globalAlpha: routeAlpha
    });

    // Hedges: faint everywhere, lit within the sun's reach.
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
        globalAlpha: (1 - distance / reach) * routeAlpha
      });
    }

    // Markers at either end: the gate squared, the fountain round, the way
    // a plan draws them.
    const entry = at(ENTRY);
    const exit = at(EXIT);
    this.#marker(paint, entry, cell, 'GATE', 1, 'square');
    const pulse = this.phase === 'hold'
      ? 1 + Math.min(1, this.timer / 0.6) * 1.6
      : 1 + 0.15 * Math.sin(elapsed * 3);
    this.#marker(paint, exit, cell * pulse, 'FOUNTAIN', this.phase === 'hold' ? 1 : 0.7, 'round');

    // The route so far, with a soft halo under it.
    const count = Math.floor(this.progress) + 1;
    const points = this.path.slice(0, count).map(at);
    points.push(head);
    if (points.length >= 2) {
      paint.drawPath({ points, strokeStyle: ROUTE, lineWidth: 7, globalAlpha: 0.12 * routeAlpha });
      paint.drawPath({ points, strokeStyle: ROUTE, lineWidth: 2, globalAlpha: 0.9 * routeAlpha });
    }

    // The bee: a bright body and two wings that trade widths too fast to
    // follow, which is all a bee is at this size.
    const flap = Math.sin(elapsed * 34);
    paint.drawArc({
      x: head.x - 2.4 * (0.5 + 0.5 * Math.abs(flap)), y: head.y - 2,
      radius: 2, fillStyle: 'rgba(246, 227, 160, 0.6)', globalAlpha: routeAlpha
    });
    paint.drawArc({
      x: head.x + 2.4 * (0.5 + 0.5 * Math.abs(-flap)), y: head.y - 2,
      radius: 2, fillStyle: 'rgba(246, 227, 160, 0.6)', globalAlpha: routeAlpha
    });
    paint.drawArc({ x: head.x, y: head.y, radius: 3.2, fillStyle: BEE, globalAlpha: routeAlpha });
    paint.drawArc({ x: head.x, y: head.y, radius: 3.2, strokeStyle: '#5a4716', lineWidth: 1, fill: false, globalAlpha: routeAlpha });

    // The plan's readout, top right, out of the column's way.
    const percent = Math.round((this.progress / (this.path.length - 1)) * 100);
    paint.drawText({
      text: `GARDEN PLAN ${String(COLS).padStart(2, '0')}×${String(ROWS).padStart(2, '0')}   ROUTE ${String(percent).padStart(3, ' ')}%`,
      x: width - 40, y: 36,
      textAlign: 'right',
      fontFamily: '$font.mono',
      fontSize: 11,
      letterSpacing: 2,
      fillStyle: 'rgba(216, 198, 120, 0.55)'
    });
  }

  /** An outline with a small caption, the way a plan labels its features. */
  #marker(paint, point, size, label, alpha, shape) {
    const half = size * 0.32;
    if (shape === 'round') {
      paint.drawArc({
        x: point.x, y: point.y, radius: half,
        strokeStyle: ROUTE, lineWidth: 1.5, fill: false, globalAlpha: 0.8 * alpha
      });
    } else {
      paint.drawRect({
        x: point.x - half, y: point.y - half, width: half * 2, height: half * 2,
        strokeStyle: ROUTE, lineWidth: 1.5, fill: false, globalAlpha: 0.8 * alpha
      });
    }
    paint.drawText({
      text: label,
      x: point.x + half + 8, y: point.y,
      textBaseline: 'middle',
      fontFamily: '$font.mono',
      fontSize: 10,
      letterSpacing: 2,
      fillStyle: ROUTE,
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

/** `UIBackdrop` options for the garden's menu. */
export const menuBackdrop = {
  gradient: { from: '#16200f', to: '#2a3b1c', angle: 120 },
  layers: [new GardenPlan()],
  motes: 14,
  vignette: 0.5
};
