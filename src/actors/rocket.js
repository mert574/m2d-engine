import { Projectile } from '../core/projectile.js';

export class Rocket extends Projectile {
  name = 'Rocket';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, {
      speed: options.speed ?? 4,
      damage: options.damage ?? 25,
      direction: options.direction,
      maxLifetime: options.maxLifetime ?? 6,
      owner: options.owner,
      targetNames: ['Player'],
      ...options
    });
  }

  draw() {
    if (this.dead) return;

    const pos = this.position;
    const renderer = this.game.renderer;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    // Helper to rotate a point around origin
    const rotatePoint = (x, y) => ({
      x: pos.x + x * cos - y * sin,
      y: pos.y + x * sin + y * cos
    });

    // Rocket body (red) - draw as thick line
    const bodyStart = rotatePoint(-12, 0);
    const bodyEnd = rotatePoint(8, 0);
    renderer.drawLine({
      x1: bodyStart.x,
      y1: bodyStart.y,
      x2: bodyEnd.x,
      y2: bodyEnd.y,
      strokeStyle: '#E53935',
      lineWidth: 8
    });

    // Rocket tip (darker red)
    const tipEnd = rotatePoint(14, 0);
    renderer.drawLine({
      x1: bodyEnd.x,
      y1: bodyEnd.y,
      x2: tipEnd.x,
      y2: tipEnd.y,
      strokeStyle: '#B71C1C',
      lineWidth: 6
    });

    // Exhaust flame (yellow/orange)
    const flameStart = rotatePoint(-12, 0);
    const flameLength = 18 + Math.random() * 4;
    const flameEnd = rotatePoint(-flameLength, 0);
    renderer.drawLine({
      x1: flameStart.x,
      y1: flameStart.y,
      x2: flameEnd.x,
      y2: flameEnd.y,
      strokeStyle: '#FFC107',
      lineWidth: 6
    });

    if (renderer.isDebugEnabled()) {
      // Draw velocity vector
      renderer.drawLine({
        x1: pos.x,
        y1: pos.y,
        x2: pos.x + this.direction.x * 30,
        y2: pos.y + this.direction.y * 30,
        strokeStyle: 'rgba(255, 0, 0, 0.8)',
        lineWidth: 2
      });
    }
  }
}
