import { UIElement } from './uiElement.js';

/**
 * The world in miniature.
 *
 * Maps a world rectangle onto the element's box and asks the game how to
 * plot each entity: `plot(entity)` returns `null` to skip it or
 * `{ shape: 'dot'|'square'|'ring', color, size }`. The player is drawn as
 * a heading arrow, the camera's view as a rectangle, and `target` (an
 * entity or `{ position }`) as a pulsing ring, for an objective. Optional
 * `paths` are polylines in world coordinates.
 *
 * @param {import('../m2d.js').M2D} game
 * @param {Object} options - `UIElement` options, plus:
 * @param {{width: number, height: number}} options.bounds - World size to map
 * @param {number} [options.size=200] - Width; the height follows the bounds' aspect
 * @param {(entity) => ({shape, color, size}|null)} [options.plot]
 * @param {Array<Array<{x: number, y: number}>>} [options.paths]
 * @param {string} [options.background]
 */
export class UIMinimap extends UIElement {
  constructor(game, options) {
    const { bounds, size = 200, plot, paths, background, ...rest } = options;
    super({ anchor: 'top-right', pivot: 'top-right', x: -16, y: 16, width: size, height: Math.round(size * bounds.height / bounds.width), ...rest });
    this.game = game;
    this.bounds = bounds;
    this.plot = plot ?? (() => null);
    this.paths = paths ?? [];
    this.background = background ?? 'rgba(24, 40, 26, 0.9)';
    this.borderColor = options.borderColor ?? '$color.border.subtle';
    this.pathColor = options.pathColor ?? 'rgba(150, 126, 82, 0.8)';
    this.target = null;
    this.time = 0;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
  }

  /** World to map coordinates. */
  map(x, y) {
    const f = this.frame;
    return { x: f.x + x * f.width / this.bounds.width, y: f.y + y * f.height / this.bounds.height };
  }

  draw() {
    const f = this.frame;
    const paint = this.paint;
    const sx = f.width / this.bounds.width;
    const sy = f.height / this.bounds.height;

    paint.drawRect({ x: f.x, y: f.y, width: f.width, height: f.height, fillStyle: this.background, strokeStyle: this.borderColor, lineWidth: 1.5, cornerRadius: 8 });
    paint.pushClip({ x: f.x, y: f.y, width: f.width, height: f.height, cornerRadius: 8 });

    for (const path of this.paths) {
      if (path.length > 1) paint.drawPath({ points: path.map(p => this.map(p.x, p.y)), strokeStyle: this.pathColor, lineWidth: 3 });
    }
    for (const entity of this.game.entities) {
      if (entity.dead) continue;
      const mark = this.plot(entity);
      if (!mark) continue;
      const p = this.map(entity.position.x, entity.position.y);
      const size = mark.size ?? 2.5;
      if (mark.shape === 'square') {
        paint.drawRect({ x: p.x - size, y: p.y - size, width: size * 2, height: size * 2, fillStyle: mark.color, cornerRadius: 1 });
      } else if (mark.shape === 'ring') {
        paint.drawArc({ x: p.x, y: p.y, radius: size, strokeStyle: mark.color, lineWidth: 1.5 });
      } else if (mark.shape === 'area') {
        paint.drawArc({ x: p.x, y: p.y, radius: (mark.radius ?? entity.size.x / 2) * sx, fillStyle: mark.color });
      } else {
        paint.drawArc({ x: p.x, y: p.y, radius: size, fillStyle: mark.color });
      }
    }
    if (this.target) {
      const pos = this.target.position ?? this.target;
      const p = this.map(pos.x, pos.y);
      paint.drawArc({ x: p.x, y: p.y, radius: 6 + Math.sin(this.time * 4) * 3, strokeStyle: '$color.text.accent', lineWidth: 1.5 });
    }
    const player = this.game.player;
    if (player && !player.dead) {
      const p = this.map(player.position.x, player.position.y);
      const h = player.heading ?? 0;
      paint.drawPath({
        points: [
          { x: p.x + Math.cos(h) * 7, y: p.y + Math.sin(h) * 7 },
          { x: p.x + Math.cos(h + 2.5) * 5, y: p.y + Math.sin(h + 2.5) * 5 },
          { x: p.x + Math.cos(h - 2.5) * 5, y: p.y + Math.sin(h - 2.5) * 5 }
        ],
        closed: true, fillStyle: '#ffffff'
      });
    }
    // The view, on the ground. The camera lives on the render plane, so
    // under a projection its rectangle is a quadrilateral on the map.
    const area = this.game.camera.getVisibleArea();
    const projection = this.game.projection;
    const view = [[area.left, area.top], [area.right, area.top], [area.right, area.bottom], [area.left, area.bottom]]
      .map(([x, y]) => (projection ? projection.toWorld(x, y) : { x, y }))
      .map((p) => this.map(p.x, p.y));
    paint.drawPath({ points: view, closed: true, strokeStyle: 'rgba(255, 255, 255, 0.35)', lineWidth: 1 });
    paint.popClip();
  }
}
