import { makeRng, range } from '../shared/rng.js';

/**
 * Ash Row's menu: the street at noon, side on. A sunlit brick front with
 * sky in the windows, washing strung between the lamp posts, and the row's
 * thugs waiting in the one shadowed doorway at the right.
 */
export class StreetFront {
  constructor(seed = 4) {
    const rng = makeRng(seed);
    this.windows = Array.from({ length: 26 }, () => ({ x: range(rng, 0.3, 1.05), y: range(rng, 0.12, 0.5), w: range(rng, 0.028, 0.04), lit: rng() < 0.4, phase: range(rng, 0, 6.28) }));
    this.lamps = [0.42, 0.68, 0.94];
    this.figures = Array.from({ length: 4 }, (_, i) => ({ x: 0.75 + i * 0.06, h: range(rng, 0.16, 0.2), phase: range(rng, 0, 6.28) }));
    this.washing = Array.from({ length: 8 }, (_, i) => ({ t: 0.34 + i * 0.085, hue: ['#e8d8c0', '#c0d8e8', '#e8c0c8', '#d8e8c0'][i % 4], phase: range(rng, 0, 6.28) }));
  }

  update() {}

  draw(paint, { width, height, elapsed }) {
    const kerb = height * 0.68;
    const roof = height * 0.1;
    // Sky, sun, a slow cloud; then the sunlit front below the roofline.
    paint.drawRect({ x: 0, y: 0, width, height: roof, fillStyle: { type: 'linear', x0: 0, y0: 0, x1: 0, y1: roof, stops: [{ offset: 0, color: '#5aa6e0' }, { offset: 1, color: '#a8d2ee' }] } });
    paint.drawArc({ x: width * 0.84, y: roof * 0.55, radius: 26, fillStyle: '#fff6d8' });
    paint.drawArc({ x: width * 0.84, y: roof * 0.55, radius: 60, fillStyle: { type: 'radial', x: width * 0.84, y: roof * 0.55, r0: 20, r1: 60, stops: [{ offset: 0, color: 'rgba(255, 244, 200, 0.5)' }, { offset: 1, color: 'rgba(255, 244, 200, 0)' }] } });
    paint.drawRect({ x: 0, y: roof, width, height: kerb - roof, fillStyle: { type: 'linear', x0: 0, y0: roof, x1: 0, y1: kerb, stops: [{ offset: 0, color: '#c88a62' }, { offset: 1, color: '#9a6648' }] } });
    paint.drawRect({ x: 0, y: roof - 4, width, height: 8, fillStyle: '#6b5648' });
    paint.drawRect({ x: 0, y: kerb, width, height: height - kerb, fillStyle: { type: 'linear', x0: 0, y0: kerb, x1: 0, y1: height, stops: [{ offset: 0, color: '#c8c2b4' }, { offset: 1, color: '#9a948a' }] } });
    paint.drawRect({ x: 0, y: kerb - 6, width, height: 8, fillStyle: '#ddd6c8' });
    for (const w of this.windows) {
      paint.drawRect({ x: w.x * width - 3, y: Math.max(roof + 8, w.y * height) - 3, width: w.w * width + 6, height: w.w * width * 1.4 + 6, fillStyle: '#eee8da', cornerRadius: 2 });
      paint.drawRect({ x: w.x * width, y: Math.max(roof + 8, w.y * height), width: w.w * width, height: w.w * width * 1.4, fillStyle: { type: 'linear', x0: w.x * width, y0: w.y * height, x1: w.x * width + w.w * width, y1: w.y * height + w.w * width * 1.4, stops: [{ offset: 0, color: '#aed2ec' }, { offset: 1, color: '#5a7e9e' }] }, cornerRadius: 2 });
    }
    // Washing on a line between the first two lamps, swinging a little.
    const lineY = height * 0.3;
    paint.drawLine({ x1: this.lamps[0] * width, y1: lineY, x2: this.lamps[2] * width, y2: lineY + 10, strokeStyle: 'rgba(60, 50, 44, 0.6)', lineWidth: 1.5 });
    for (const item of this.washing) {
      const x = (this.lamps[0] + (this.lamps[2] - this.lamps[0]) * ((item.t - 0.34) / 0.6)) * width;
      const y = lineY + 10 * ((item.t - 0.34) / 0.6);
      const sway = Math.sin(elapsed * 1.2 + item.phase) * 4;
      paint.drawPath({ points: [{ x, y }, { x: x + 16 + sway * 0.3, y }, { x: x + 14 + sway, y: y + 26 }, { x: x - 2 + sway, y: y + 26 }], closed: true, fillStyle: item.hue });
    }
    for (const lx of this.lamps) {
      const x = lx * width;
      const top = kerb - height * 0.3;
      paint.drawRect({ x: x - 3, y: top, width: 6, height: kerb - top, fillStyle: '#3a3e46' });
      paint.drawRect({ x: x + 4, y: top - 10, width: 14, height: 16, fillStyle: '#4a4e56', cornerRadius: 3 });
      // The post's sun shadow across the paving.
      paint.pushTransform({ x: x + 40, y: kerb + 16, scaleX: 1, scaleY: 0.25 });
      paint.drawArc({ x: 0, y: 0, radius: 46, fillStyle: 'rgba(40, 36, 30, 0.25)' });
      paint.popTransform();
    }
    // The one dark doorway, and the figures waiting in it.
    paint.drawRect({ x: width * 0.72, y: kerb - height * 0.3, width: width * 0.24, height: height * 0.3, fillStyle: 'rgba(30, 24, 20, 0.85)', cornerRadius: 4 });
    for (const f of this.figures) {
      const x = f.x * width;
      const h = f.h * height;
      const sway = Math.sin(elapsed * 0.8 + f.phase) * 3;
      paint.drawPath({ points: [{ x: x - h * 0.22 + sway, y: kerb + 4 }, { x: x - h * 0.16, y: kerb + 4 - h * 0.7 }, { x: x, y: kerb + 4 - h }, { x: x + h * 0.16, y: kerb + 4 - h * 0.7 }, { x: x + h * 0.22 + sway, y: kerb + 4 }], closed: true, fillStyle: 'rgba(16, 14, 12, 0.9)' });
    }
  }
}

export const menuBackdrop = {
  gradient: { from: '#79b7e8', to: '#cfe6f4', angle: 180 },
  layers: [new StreetFront()],
  motes: 0,
  vignette: 0.3
};
