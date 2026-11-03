import { makeRng, range } from '../shared/rng.js';

/**
 * The physics playground's menu: a Galton board.
 *
 * The game is a funnel into a splitter into a peg field, so the menu is one
 * too, running. Balls pour through a funnel, rattle down the pegs and pile
 * up in bins at the bottom, where the bell curve builds itself. When the
 * bins are full they drain and it starts again. This is the Portal 2 idea
 * of a main menu: the world behind the type is the game, already moving.
 *
 * It is not the engine's physics. A decorative simulation this small
 * (circles against fixed circles and segments) is a few dozen lines and
 * costs nothing, while a Rapier world behind a menu would need the scene
 * machinery and a second world. Everything is sized against the live
 * frame; a resize resets the board rather than leaving balls hanging over
 * the wrong pegs.
 */

const ROWS = 10;
const COLUMNS = 12;
const SPAWN_INTERVAL = 0.085;
const MAX_BALLS = 160;
/** Settled balls before the bins drain. */
const CAPACITY = 300;
const DRAIN = 0.9;
const SUBSTEP = 1 / 120;
const RESTITUTION = 0.45;

const PEG = '#d9a066';
const BALL = '#ffd9a8';
const FRAME = 'rgba(255, 200, 140, 0.16)';

export class GaltonBoard {
  constructor(seed = 5) {
    this.rng = makeRng(seed);
    this.size = { width: 0, height: 0 };
    this.#reset();
  }

  #reset() {
    this.balls = [];
    this.bins = Array.from({ length: COLUMNS }, () => []);
    this.settled = 0;
    this.spawnTimer = 0;
    this.drainTimer = -1;
  }

  /** The board's geometry for a frame, in UI units. */
  #layout(width, height) {
    const left = width * 0.47;
    const right = width * 0.97;
    const spacing = (right - left) / COLUMNS;
    const top = height * 0.2;
    const binTop = height * 0.74;
    const floor = height * 0.965;
    const ballRadius = Math.max(3, height * 0.0075);
    const centre = (left + right) / 2;

    const pegs = [];
    for (let row = 0; row < ROWS; row++) {
      const y = top + ((binTop - top - spacing * 0.5) / (ROWS - 1)) * row;
      const offset = row % 2 === 0 ? spacing / 2 : 0;
      for (let column = 0; column <= COLUMNS; column++) {
        const x = left + column * spacing + offset;
        if (x > left + ballRadius && x < right - ballRadius) pegs.push({ x, y });
      }
    }

    // The funnel: two segments above the first row, narrowing to a mouth
    // two ball widths across.
    const mouth = ballRadius * 2.2;
    const funnelTop = height * 0.045;
    const funnelBottom = top - spacing * 0.7;
    const segments = [
      { ax: left + spacing, ay: funnelTop, bx: centre - mouth, by: funnelBottom },
      { ax: right - spacing, ay: funnelTop, bx: centre + mouth, by: funnelBottom }
    ];

    return {
      left, right, top, binTop, floor, spacing, ballRadius, centre, pegs, segments,
      pegRadius: Math.max(2, height * 0.0045),
      gravity: height * 1.9,
      funnelTop
    };
  }

  update(deltaTime, { width, height }) {
    if (!(width > 0) || !(height > 0)) return;
    if (width !== this.size.width || height !== this.size.height) {
      this.size = { width, height };
      this.#reset();
    }
    const board = this.#layout(width, height);

    if (this.drainTimer >= 0) {
      this.drainTimer += deltaTime;
      if (this.drainTimer >= DRAIN) {
        this.bins = this.bins.map(() => []);
        this.settled = 0;
        this.drainTimer = -1;
      }
    }

    this.spawnTimer += deltaTime;
    while (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer -= SPAWN_INTERVAL;
      if (this.balls.length < MAX_BALLS) {
        this.balls.push({
          x: board.centre + range(this.rng, -0.3, 0.3) * (board.right - board.left),
          y: -board.ballRadius * 2,
          vx: range(this.rng, -20, 20),
          vy: 0
        });
      }
    }

    // A fixed step, in slices, so a slow frame cannot push a ball through
    // a peg.
    let remaining = Math.min(deltaTime, 1 / 20);
    while (remaining > 0) {
      const dt = Math.min(SUBSTEP, remaining);
      remaining -= dt;
      this.#step(dt, board);
    }
  }

  #step(dt, board) {
    const { ballRadius: r, pegRadius, left, right, binTop, floor, spacing } = board;
    const contact = r + pegRadius;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.vy += board.gravity * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      for (const segment of board.segments) this.#collideSegment(ball, segment, r);

      for (const peg of board.pegs) {
        if (Math.abs(peg.y - ball.y) > contact) continue;
        const dx = ball.x - peg.x;
        const dy = ball.y - peg.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= contact || distance === 0) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        ball.x = peg.x + nx * contact;
        ball.y = peg.y + ny * contact;
        const along = ball.vx * nx + ball.vy * ny;
        if (along < 0) {
          ball.vx -= (1 + RESTITUTION) * along * nx;
          ball.vy -= (1 + RESTITUTION) * along * ny;
          // A nudge, so a ball landing dead on a peg still picks a side.
          ball.vx += range(this.rng, -30, 30);
        }
      }

      if (ball.x < left + r) { ball.x = left + r; ball.vx = Math.abs(ball.vx) * 0.5; }
      if (ball.x > right - r) { ball.x = right - r; ball.vx = -Math.abs(ball.vx) * 0.5; }

      // Into the bins: the dividers hold it to one column until it lands on
      // the pile, where it stops being simulated at all.
      if (ball.y > binTop) {
        const column = Math.max(0, Math.min(COLUMNS - 1, Math.floor((ball.x - left) / spacing)));
        const binLeft = left + column * spacing;
        ball.x = Math.max(binLeft + r + 1, Math.min(binLeft + spacing - r - 1, ball.x));
        ball.vx *= 0.9;
        const pile = this.bins[column];
        const perLayer = Math.max(1, Math.floor((spacing - 2) / (r * 2)));
        const layer = Math.floor(pile.length / perLayer);
        const restY = floor - r - layer * r * 1.74;
        if (ball.y >= restY) {
          const slot = pile.length % perLayer;
          const stagger = layer % 2 === 1 && perLayer > 1 ? r : 0;
          pile.push({ x: Math.min(binLeft + spacing - r - 1, binLeft + r + 1 + slot * r * 2 + stagger), y: restY });
          this.balls.splice(i, 1);
          this.settled++;
          if (this.settled >= CAPACITY && this.drainTimer < 0) this.drainTimer = 0;
        }
      }
    }
  }

  /** Push a ball out of a segment and reflect it. */
  #collideSegment(ball, { ax, ay, bx, by }, r) {
    const dx = bx - ax, dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / length));
    const cx = ax + dx * t, cy = ay + dy * t;
    const ox = ball.x - cx, oy = ball.y - cy;
    const distance = Math.hypot(ox, oy);
    if (distance >= r || distance === 0) return;
    const nx = ox / distance, ny = oy / distance;
    ball.x = cx + nx * r;
    ball.y = cy + ny * r;
    const along = ball.vx * nx + ball.vy * ny;
    if (along < 0) {
      ball.vx -= (1 + RESTITUTION * 0.4) * along * nx;
      ball.vy -= (1 + RESTITUTION * 0.4) * along * ny;
    }
  }

  draw(paint, { width, height }) {
    if (!(width > 0) || !(height > 0)) return;
    const board = this.#layout(width, height);
    const { left, right, top, binTop, floor, spacing, ballRadius: r, pegRadius } = board;

    // A lamp above the board, so the pile at the bottom sits in shadow.
    paint.drawRect({
      x: 0, y: 0, width, height,
      fillStyle: {
        type: 'radial', x: board.centre, y: 0, r0: 0, r1: height * 0.95,
        stops: [
          { offset: 0, color: 'rgba(255, 190, 120, 0.2)' },
          { offset: 0.5, color: 'rgba(255, 170, 110, 0.05)' },
          { offset: 1, color: 'rgba(255, 170, 110, 0)' }
        ]
      }
    });

    // The frame: sides, funnel, bin dividers and floor.
    paint.drawLine({ x1: left, y1: top - spacing, x2: left, y2: floor, strokeStyle: FRAME, lineWidth: 1.5 });
    paint.drawLine({ x1: right, y1: top - spacing, x2: right, y2: floor, strokeStyle: FRAME, lineWidth: 1.5 });
    paint.drawLine({ x1: left, y1: floor, x2: right, y2: floor, strokeStyle: FRAME, lineWidth: 1.5 });
    for (const { ax, ay, bx, by } of board.segments) {
      paint.drawLine({ x1: ax, y1: ay, x2: bx, y2: by, strokeStyle: FRAME, lineWidth: 1.5 });
    }
    for (let column = 1; column < COLUMNS; column++) {
      const x = left + column * spacing;
      paint.drawLine({ x1: x, y1: binTop + spacing * 0.4, x2: x, y2: floor, strokeStyle: FRAME, lineWidth: 1 });
    }

    for (const peg of board.pegs) {
      paint.drawArc({ x: peg.x, y: peg.y, radius: pegRadius, fillStyle: PEG, globalAlpha: 0.7 });
    }

    const pileAlpha = this.drainTimer >= 0 ? 1 - this.drainTimer / DRAIN : 1;
    for (const pile of this.bins) {
      for (const ball of pile) {
        paint.drawArc({ x: ball.x, y: ball.y, radius: r, fillStyle: BALL, globalAlpha: 0.75 * pileAlpha });
      }
    }
    for (const ball of this.balls) {
      paint.drawArc({ x: ball.x, y: ball.y, radius: r, fillStyle: BALL });
    }
  }
}

/** `UIBackdrop` options for the physics playground's menu. */
export const menuBackdrop = {
  gradient: { from: '#110904', to: '#2c1a0d', angle: 120 },
  layers: [new GaltonBoard()],
  motes: 0,
  vignette: 0.55
};
