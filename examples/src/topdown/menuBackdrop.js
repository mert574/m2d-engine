import { makeRng, range } from '../shared/rng.js';

/**
 * The top-down game's menu: a motion tracker.
 *
 * The level is ghosts that chase and turrets that check line of sight, so
 * the menu is the instrument that would find them: a sweep turning over a
 * range plot, contacts lighting as it passes and fading until the next
 * pass. The contacts drift between sweeps but are only drawn where they
 * were last seen, which is what makes a radar read as a radar rather than
 * as dots on a dial.
 *
 * The sweep's trail is a fan of thin wedges with falling alpha. A conic
 * gradient would be one call, but neither backend has one and forty
 * triangles are cheaper than they sound.
 */

const SWEEP_RATE = 0.75;
const TRAIL_WEDGES = 44;
const TRAIL_STEP = 0.022;
const CONTACTS = 9;
/** Seconds a contact stays visible after the sweep passes. */
const PERSIST = 4.5;

const PLOT = 'rgba(214, 170, 255, 0.14)';
const PLOT_STRONG = 'rgba(214, 170, 255, 0.32)';
const SWEEP = 'rgba(214, 170, 255, 1)';
const CONTACT = '#f6e9ff';
const TEXT = 'rgba(214, 170, 255, 0.6)';

export class MotionTracker {
  constructor(seed = 21) {
    const rng = makeRng(seed);
    this.contacts = Array.from({ length: CONTACTS }, (_, index) => ({
      id: `G-${String(index + 1).padStart(2, '0')}`,
      radius: range(rng, 0.14, 0.92),
      angle: range(rng, 0, Math.PI * 2),
      turn: range(rng, -0.09, 0.09),
      breathe: range(rng, 0, Math.PI * 2),
      lastSeen: -Infinity,
      seenAt: null
    }));
    this.heading = 0;
  }

  update(deltaTime, { width, height, elapsed }) {
    const previous = this.heading;
    this.heading = (this.heading + SWEEP_RATE * deltaTime) % (Math.PI * 2);
    const { cx, cy, R } = this.#plot(width, height);

    for (const contact of this.contacts) {
      contact.angle += contact.turn * deltaTime;
      const radius = contact.radius + 0.03 * Math.sin(elapsed * 0.4 + contact.breathe);
      const angle = ((contact.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      // Did the head cross this bearing since last frame? Handles the wrap.
      const crossed = previous <= this.heading
        ? angle > previous && angle <= this.heading
        : angle > previous || angle <= this.heading;
      if (crossed) {
        contact.lastSeen = elapsed;
        contact.seenAt = { x: cx + Math.cos(angle) * radius * R, y: cy + Math.sin(angle) * radius * R };
      }
    }
  }

  #plot(width, height) {
    return {
      cx: width * 0.68,
      cy: height * 0.52,
      R: Math.min(width * 0.32, height * 0.44)
    };
  }

  draw(paint, { width, height, elapsed }) {
    const { cx, cy, R } = this.#plot(width, height);

    // The floor: a faint tile grid, the game's own ground seen from above.
    const tile = Math.max(48, height / 15);
    for (let x = (cx % tile); x < width; x += tile) {
      paint.drawLine({ x1: x, y1: 0, x2: x, y2: height, strokeStyle: 'rgba(214, 170, 255, 0.045)', lineWidth: 1 });
    }
    for (let y = (cy % tile); y < height; y += tile) {
      paint.drawLine({ x1: 0, y1: y, x2: width, y2: y, strokeStyle: 'rgba(214, 170, 255, 0.045)', lineWidth: 1 });
    }

    // Range rings, cross hairs and bearing ticks.
    for (let ring = 1; ring <= 4; ring++) {
      paint.drawArc({
        x: cx, y: cy, radius: R * ring / 4,
        strokeStyle: ring === 4 ? PLOT_STRONG : PLOT, lineWidth: ring === 4 ? 1.5 : 1
      });
    }
    paint.drawLine({ x1: cx - R, y1: cy, x2: cx + R, y2: cy, strokeStyle: PLOT, lineWidth: 1 });
    paint.drawLine({ x1: cx, y1: cy - R, x2: cx, y2: cy + R, strokeStyle: PLOT, lineWidth: 1 });
    for (let degree = 0; degree < 360; degree += 10) {
      const a = degree * Math.PI / 180;
      const inner = degree % 30 === 0 ? R * 0.955 : R * 0.975;
      paint.drawLine({
        x1: cx + Math.cos(a) * inner, y1: cy + Math.sin(a) * inner,
        x2: cx + Math.cos(a) * R, y2: cy + Math.sin(a) * R,
        strokeStyle: PLOT_STRONG, lineWidth: 1
      });
    }

    // The sweep: trailing wedges, then the head.
    for (let i = TRAIL_WEDGES - 1; i >= 0; i--) {
      const a = this.heading - i * TRAIL_STEP;
      const b = a - TRAIL_STEP * 1.05;
      const alpha = 0.3 * Math.pow(1 - i / TRAIL_WEDGES, 1.6);
      paint.drawPath({
        points: [
          { x: cx, y: cy },
          { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R },
          { x: cx + Math.cos(b) * R, y: cy + Math.sin(b) * R }
        ],
        closed: true,
        fillStyle: SWEEP,
        globalAlpha: alpha
      });
    }
    paint.drawLine({
      x1: cx, y1: cy,
      x2: cx + Math.cos(this.heading) * R, y2: cy + Math.sin(this.heading) * R,
      strokeStyle: '#efe4ff', lineWidth: 1.5, globalAlpha: 0.9
    });
    paint.drawArc({ x: cx, y: cy, radius: 3, fillStyle: '#efe4ff' });

    // Contacts, where the sweep last found them.
    let live = 0;
    for (const contact of this.contacts) {
      const age = elapsed - contact.lastSeen;
      if (!contact.seenAt || age > PERSIST) continue;
      live++;
      const fade = Math.exp(-age * 0.75);
      const { x, y } = contact.seenAt;
      paint.drawArc({ x, y, radius: 3.5, fillStyle: CONTACT, globalAlpha: fade });
      if (age < 1.2) {
        paint.drawArc({
          x, y, radius: 6 + age * 28,
          strokeStyle: CONTACT, lineWidth: 1, globalAlpha: (1 - age / 1.2) * 0.6
        });
      }
      paint.drawText({
        text: contact.id,
        x: x + 9, y: y - 7,
        fontFamily: '$font.mono', fontSize: 10, letterSpacing: 1.5,
        fillStyle: CONTACT, globalAlpha: fade * 0.75
      });
    }

    // The readout, pinned under the plot.
    const bearing = Math.round(((this.heading * 180) / Math.PI + 90) % 360);
    paint.drawText({
      text: `BRG ${String(bearing).padStart(3, '0')}°   CONTACTS ${String(live).padStart(2, '0')}`,
      x: cx + R, y: cy + R + 22,
      textAlign: 'right',
      fontFamily: '$font.mono', fontSize: 11, letterSpacing: 2,
      fillStyle: TEXT
    });
  }
}

/** `UIBackdrop` options for the top-down game's menu. */
export const menuBackdrop = {
  gradient: { from: '#080412', to: '#1a0e2c', angle: 115 },
  layers: [new MotionTracker()],
  motes: 0,
  vignette: 0.62
};
