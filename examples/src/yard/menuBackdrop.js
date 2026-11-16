/**
 * The yard's menu: the yard itself, late in the afternoon.
 *
 * A 3D place sells itself on light, so its menu gets the yard's light: a
 * low sun off to the right, the colonnade standing in it with long shadows
 * laid across the ground toward the viewer, the wall behind, a stack of
 * crates by the way in. The palette is the scene file's — its sky, fog,
 * ground and crate colours — so the menu and the yard are one afternoon.
 *
 * Nothing moves. A menu that animates for its own sake is a screensaver;
 * a still place reads as a place.
 */

/** Where the ground meets the sky, as a fraction of the height. */
const HORIZON = 0.62;

/** The colonnade: pillars across the right half, as fractions of the width. */
const PILLARS = [0.5, 0.57, 0.64, 0.71, 0.78, 0.85, 0.92];

/** The crate stack, in crates from the stack's foot: two down, one on top. */
const CRATES = [[0, 0], [1.05, 0], [0.5, -1]];

export class YardAfternoon {
  draw(paint, { width, height }) {
    const horizon = height * HORIZON;
    const unit = Math.min(width, height);
    const sun = { x: width * 0.86, y: height * 0.47 };

    // The sun's glow over the sky, and the disc.
    paint.drawRect({
      x: 0, y: 0, width, height: horizon,
      fillStyle: {
        type: 'radial', x: sun.x, y: sun.y, r0: 0, r1: unit * 0.55,
        stops: [
          { offset: 0, color: 'rgba(255, 241, 218, 0.55)' },
          { offset: 0.3, color: 'rgba(255, 226, 190, 0.18)' },
          { offset: 1, color: 'rgba(255, 226, 190, 0)' }
        ]
      }
    });
    paint.drawArc({ x: sun.x, y: sun.y, radius: unit * 0.04, fillStyle: '#fff1da' });

    // Haze at the horizon, the scene's fog colour.
    paint.drawRect({
      x: 0, y: horizon - height * 0.1, width, height: height * 0.1,
      fillStyle: { type: 'linear', x0: 0, y0: horizon - height * 0.1, x1: 0, y1: horizon, stops: [
        { offset: 0, color: 'rgba(212, 223, 239, 0)' }, { offset: 1, color: 'rgba(212, 223, 239, 0.7)' }
      ] }
    });

    // The ground, lit far and warm, darker near.
    paint.drawRect({
      x: 0, y: horizon, width, height: height - horizon,
      fillStyle: { type: 'linear', x0: 0, y0: horizon, x1: 0, y1: height, stops: [
        { offset: 0, color: '#a39480' }, { offset: 1, color: '#6b5d4c' }
      ] }
    });

    // The wall along the back, its top catching the sun.
    const wallTop = horizon - height * 0.07;
    paint.drawRect({ x: 0, y: wallTop, width, height: horizon - wallTop, fillStyle: '#b9a88f' });
    paint.drawRect({ x: 0, y: wallTop, width, height: height * 0.006, fillStyle: '#eadfca' });

    // The colonnade: each pillar's shadow first, laid toward the lower left,
    // then the pillar, its sunward face light and the other in shade.
    const pillarHeight = height * 0.19;
    const pillarWidth = width * 0.014;
    const base = horizon + height * 0.012;
    const reach = { x: -pillarHeight * 1.9, y: pillarHeight * 0.55 };
    for (const at of PILLARS) {
      const x = width * at;
      paint.drawPath({
        points: [
          { x, y: base }, { x: x + pillarWidth, y: base },
          { x: x + pillarWidth + reach.x, y: base + reach.y }, { x: x + reach.x, y: base + reach.y }
        ],
        closed: true, fillStyle: '#4a3f33', globalAlpha: 0.55
      });
      paint.drawRect({ x, y: base - pillarHeight, width: pillarWidth * 0.45, height: pillarHeight, fillStyle: '#b19e86' });
      paint.drawRect({ x: x + pillarWidth * 0.45, y: base - pillarHeight, width: pillarWidth * 0.55, height: pillarHeight, fillStyle: '#eadfca' });
    }

    // Crates by the way in, the scene's own colour, two with one on top.
    // The stack throws one shadow, from its outline, before any crate.
    const crate = unit * 0.07;
    const stack = { x: width * 0.3, y: horizon + height * 0.16 };
    const foot = { left: stack.x, right: stack.x + crate * 2.05, y: stack.y };
    paint.drawPath({
      points: [
        { x: foot.left, y: foot.y }, { x: foot.right, y: foot.y },
        { x: foot.right - crate * 1.4, y: foot.y + crate * 0.4 }, { x: foot.left - crate * 1.4, y: foot.y + crate * 0.4 }
      ],
      closed: true, fillStyle: '#4a3f33', globalAlpha: 0.5
    });
    for (const [dx, dy] of CRATES) {
      const cx = stack.x + dx * crate;
      const cy = stack.y + dy * crate;
      paint.drawRect({ x: cx, y: cy - crate, width: crate, height: crate, fillStyle: '#b86a2a' });
      paint.drawRect({ x: cx, y: cy - crate, width: crate, height: crate * 0.08, fillStyle: '#d98a45' });
      paint.drawRect({ x: cx, y: cy - crate, width: crate * 0.08, height: crate, fillStyle: '#8a4d1c' });
    }
  }
}
