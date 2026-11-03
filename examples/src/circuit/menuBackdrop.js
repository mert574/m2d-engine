/**
 * The circuit's menu: a lap already running.
 *
 * A ribbon of road winds across the frame at night. One car runs it on a
 * loop, headlight cones sweeping the asphalt, lamps dropping pools of warm
 * light, a second car trailing far behind. The composition keeps the road
 * in the right two thirds, under the menu column's clear side.
 */
import { makeRng, range } from '../shared/rng.js';

const ASPHALT = 'rgba(56, 61, 78, 0.95)';
const EDGE = 'rgba(214, 220, 234, 0.35)';
const DASH = 'rgba(255, 211, 77, 0.4)';

class NightLap {
  constructor(seed = 9) {
    this.rng = makeRng(seed);
    this.size = { width: 0, height: 0 };
    this.path = [];
    this.t = 0.15;
    this.chaser = -0.12;
  }

  /** The ribbon, rebuilt when the frame changes size. */
  #layout(width, height) {
    if (this.size.width === width && this.size.height === height && this.path.length) return;
    this.size = { width, height };
    this.path = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = width * (0.3 + u * 0.78);
      const y = height * (0.78 - 0.42 * u)
        + Math.sin(u * 9.5) * height * 0.075
        + Math.sin(u * 3.7 + 1.2) * height * 0.11;
      this.path.push({ x, y });
    }
    for (let i = 0; i <= n; i++) {
      const a = this.path[Math.max(0, i - 1)];
      const b = this.path[Math.min(n, i + 1)];
      this.path[i].angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
    this.lamps = [];
    for (let i = 12; i < n; i += 26) {
      const p = this.path[i];
      this.lamps.push({ x: p.x, y: p.y - height * 0.035 });
    }
  }

  #pose(t) {
    const n = this.path.length - 1;
    const wrapped = ((t % 1) + 1) % 1;
    return this.path[Math.round(wrapped * n)];
  }

  update(deltaTime) {
    this.t += deltaTime * 0.055;
    this.chaser += deltaTime * 0.051;
  }

  draw(paint, { width, height }) {
    if (!(width > 0) || !(height > 0)) return;
    this.#layout(width, height);
    const roadWidth = height * 0.055;

    // Skyline: a few dark slabs against the gradient.
    const rng = makeRng(31);
    for (let i = 0; i < 14; i++) {
      const w = range(rng, 0.03, 0.09) * width;
      const h = range(rng, 0.08, 0.3) * height;
      const x = range(rng, 0.25, 1) * width;
      paint.drawRect({
        x, y: height * 0.46 - h, width: w, height: h,
        fillStyle: `rgba(18, 20, 34, ${range(rng, 0.5, 0.85)})`
      });
      for (let k = 0; k < 5; k++) {
        if (rng() < 0.4) continue;
        paint.drawRect({
          x: x + range(rng, 0.1, 0.8) * w, y: height * 0.46 - h + range(rng, 0.1, 0.9) * h,
          width: 2, height: 3, fillStyle: 'rgba(255, 214, 140, 0.5)'
        });
      }
    }

    // The ribbon.
    paint.drawPolyline?.({ points: this.path, strokeStyle: ASPHALT, lineWidth: roadWidth })
      ?? this.#fallbackRoad(paint, roadWidth);
    for (let i = 0; i < this.path.length - 1; i++) {
      const a = this.path[i];
      const b = this.path[i + 1];
      if ((i >> 2) % 2 === 0) {
        paint.drawLine({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, strokeStyle: DASH, lineWidth: 1.5 });
      }
      const nx = -Math.sin(a.angle) * roadWidth * 0.46;
      const ny = Math.cos(a.angle) * roadWidth * 0.46;
      if (i % 3 === 0) {
        paint.drawLine({ x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny, strokeStyle: EDGE, lineWidth: 1 });
        paint.drawLine({ x1: a.x - nx, y1: a.y - ny, x2: b.x - nx, y2: b.y - ny, strokeStyle: EDGE, lineWidth: 1 });
      }
    }

    for (const lamp of this.lamps) {
      paint.drawArc({
        x: lamp.x, y: lamp.y + height * 0.03, radius: roadWidth * 1.4,
        fillStyle: {
          type: 'radial', x: lamp.x, y: lamp.y + height * 0.03, r0: 0, r1: roadWidth * 1.4,
          stops: [
            { offset: 0, color: 'rgba(255, 214, 150, 0.22)' },
            { offset: 1, color: 'rgba(255, 214, 150, 0)' }
          ]
        }
      });
      paint.drawArc({ x: lamp.x, y: lamp.y, radius: 1.6, fillStyle: '#ffd996' });
    }

    this.#car(paint, this.#pose(this.t), '#ff5a4e', roadWidth, true);
    this.#car(paint, this.#pose(this.chaser), '#ffc94e', roadWidth, false);
  }

  #fallbackRoad(paint, roadWidth) {
    for (let i = 0; i < this.path.length - 1; i++) {
      const a = this.path[i];
      const b = this.path[i + 1];
      paint.drawLine({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, strokeStyle: ASPHALT, lineWidth: roadWidth });
    }
  }

  #car(paint, pose, color, roadWidth, beams) {
    const size = roadWidth * 0.42;
    const cos = Math.cos(pose.angle);
    const sin = Math.sin(pose.angle);
    if (beams) {
      // Headlight cones ahead of the car.
      for (const side of [-0.35, 0.35]) {
        const ox = pose.x - sin * size * side;
        const oy = pose.y + cos * size * side;
        const reach = roadWidth * 3.4;
        const spread = 0.28;
        paint.drawPath({
          points: [
            { x: ox, y: oy },
            { x: ox + Math.cos(pose.angle - spread) * reach, y: oy + Math.sin(pose.angle - spread) * reach },
            { x: ox + Math.cos(pose.angle + spread) * reach, y: oy + Math.sin(pose.angle + spread) * reach }
          ],
          closed: true,
          fillStyle: 'rgba(255, 238, 190, 0.14)'
        });
      }
    }
    paint.drawRect({
      x: pose.x - size, y: pose.y - size * 0.55,
      width: size * 2, height: size * 1.1,
      fillStyle: color, cornerRadius: size * 0.3
    });
    paint.drawArc({ x: pose.x + cos * size, y: pose.y + sin * size, radius: size * 0.3, fillStyle: '#fff2cf' });
  }
}

/** `UIBackdrop` options for the circuit's menu. */
export const menuBackdrop = {
  gradient: { from: '#0b0d1c', to: '#232743', angle: 160 },
  layers: [new NightLap()],
  motes: 14,
  vignette: 0.5
};
