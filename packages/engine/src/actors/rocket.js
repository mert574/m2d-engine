import { Projectile } from '../core/projectile.js';

export class Rocket extends Projectile {
  name = 'Rocket';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, {
      speed: options.speed ?? 480,
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

    const pos = this.renderPosition;
    const renderer = this.game.renderer;

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: this.rotation });

    // Rocket body (red)
    renderer.drawRect({ x: -12, y: -4, width: 20, height: 8, fillStyle: '#E53935' });

    // Rocket tip (darker red)
    renderer.drawPath({
      points: [{ x: 8, y: -4 }, { x: 14, y: 0 }, { x: 8, y: 4 }],
      closed: true,
      fillStyle: '#B71C1C'
    });

    // Rocket fins (orange)
    renderer.drawPath({
      points: [{ x: -12, y: -4 }, { x: -16, y: -8 }, { x: -8, y: -4 }],
      closed: true,
      fillStyle: '#FF5722'
    });

    renderer.drawPath({
      points: [{ x: -12, y: 4 }, { x: -16, y: 8 }, { x: -8, y: 4 }],
      closed: true,
      fillStyle: '#FF5722'
    });

    // Exhaust flame (yellow/orange, animated)
    renderer.drawPath({
      points: [{ x: -12, y: -3 }, { x: -18 - Math.random() * 4, y: 0 }, { x: -12, y: 3 }],
      closed: true,
      fillStyle: '#FFC107'
    });

    renderer.popTransform();

    if (this.game.renderer.isDebugEnabled()) {
      // Draw velocity vector, as a sharp overlay annotation rather than into
      // the world surface.
      this.game.worldOverlay.drawLine({
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
