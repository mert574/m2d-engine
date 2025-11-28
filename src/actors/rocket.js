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
    const ctx = this.game.renderer.worldContext;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(this.rotation);

    // Rocket body (red)
    ctx.fillStyle = '#E53935';
    ctx.fillRect(-12, -4, 20, 8);

    // Rocket tip (darker red)
    ctx.fillStyle = '#B71C1C';
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(14, 0);
    ctx.lineTo(8, 4);
    ctx.closePath();
    ctx.fill();

    // Rocket fins (orange)
    ctx.fillStyle = '#FF5722';
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-16, -8);
    ctx.lineTo(-8, -4);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(-16, 8);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();

    // Exhaust flame (yellow/orange, animated)
    ctx.fillStyle = '#FFC107';
    ctx.beginPath();
    ctx.moveTo(-12, -3);
    ctx.lineTo(-18 - Math.random() * 4, 0);
    ctx.lineTo(-12, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    if (this.game.renderer.isDebugEnabled()) {
      // Draw velocity vector
      this.game.renderer.drawLine({
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
