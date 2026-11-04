/**
 * A projection from the ground plane the simulation runs on to the plane
 * the renderer draws in.
 *
 * Physics, movement and queries live in ground coordinates: a flat plane
 * seen from directly above, in pixels. A perspective such as isometric
 * shows that plane obliquely, which changes *where* things are drawn but
 * not where they are. So a projection is applied to positions only — an
 * entity's `renderPosition`, a tile's centre, a click's landing — and the
 * sprites themselves are art already drawn for the view.
 *
 * Both directions are linear, so a direction on screen maps to a direction
 * on the ground as well (`directionToWorld`), which is what lets the arrow
 * keys move along the screen's axes.
 */
export class Projection {
  /**
   * @param {string} type - A name for the scene loader and the debug readout
   * @param {[number, number, number, number]} matrix - `[a, b, c, d]` of
   *   `sx = a·x + c·y`, `sy = b·x + d·y`
   */
  constructor(type, matrix) {
    this.type = type;
    const [a, b, c, d] = matrix;
    this.matrix = matrix;
    const det = a * d - b * c;
    if (!det) throw new Error('Projection matrix is singular');
    this.inverse = [d / det, -b / det, -c / det, a / det];
  }

  /**
   * Isometric (dimetric 2:1 by default): ground x runs down-right on
   * screen, ground y down-left. A ground square of side `s` draws as a
   * diamond `2s` wide and `2s·ratio` tall, so a 128×64 tile sprite covers a
   * ground tile of 64 units.
   * @param {Object} [options]
   * @param {number} [options.ratio=0.5] - Screen height over width of a ground square
   */
  static isometric({ ratio = 0.5 } = {}) {
    return new Projection('isometric', [1, ratio, -1, ratio]);
  }

  /**
   * The belt scroller's view: a side view with a depth lane. Ground x runs
   * along the street and ground y is depth, which the screen shows
   * compressed by `ratio`, so walking "up" the street moves slowly up the
   * screen while a jump (`elevation`) moves the sprite freely.
   * @param {Object} [options]
   * @param {number} [options.ratio=0.5] - Screen rise per unit of depth
   */
  static belt({ ratio = 0.5 } = {}) {
    return new Projection('belt', [1, 0, 0, ratio]);
  }

  /** Ground to render plane. */
  toScreen(x, y) {
    const [a, b, c, d] = this.matrix;
    return { x: a * x + c * y, y: b * x + d * y };
  }

  /** Render plane to ground. */
  toWorld(sx, sy) {
    const [a, b, c, d] = this.inverse;
    return { x: a * sx + c * sy, y: b * sx + d * sy };
  }

  /** A screen-space direction as a unit ground direction. */
  directionToWorld(dx, dy) {
    const v = this.toWorld(dx, dy);
    const length = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / length, y: v.y / length };
  }

  /**
   * The ground speed that moves at `1` on screen along a unit ground
   * direction. Isometric foreshortening makes the same ground speed look
   * nearly three times faster across the screen than up it; a game that
   * wants a steady pace on screen multiplies its speed by this.
   */
  groundSpeedScale(ux, uy) {
    const s = this.toScreen(ux, uy);
    const length = Math.hypot(s.x, s.y);
    return length ? 1 / length : 1;
  }

  /** The on-screen angle a ground-plane angle appears at. */
  screenAngle(angle) {
    const s = this.toScreen(Math.cos(angle), Math.sin(angle));
    return Math.atan2(s.y, s.x);
  }

  /** The render-plane box that contains a ground rectangle. */
  boundsOf(x, y, width, height) {
    const corners = [
      this.toScreen(x, y), this.toScreen(x + width, y),
      this.toScreen(x, y + height), this.toScreen(x + width, y + height)
    ];
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }

  /** The ground box that contains a render-plane rectangle. */
  groundBoundsOf({ left, top, right, bottom }) {
    const corners = [this.toWorld(left, top), this.toWorld(right, top), this.toWorld(left, bottom), this.toWorld(right, bottom)];
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }

  /**
   * Build from a scene's `world.projection`: a type name or
   * `{ type, ...options }`. Returns null for none.
   */
  static fromConfig(config) {
    if (!config) return null;
    const { type, ...options } = typeof config === 'string' ? { type: config } : config;
    if (type === 'isometric') return Projection.isometric(options);
    if (type === 'belt') return Projection.belt(options);
    throw new Error(`Unknown projection '${type}'`);
  }
}

/** Projection names the scene loader accepts. */
export const PROJECTION_TYPES = ['isometric', 'belt'];
