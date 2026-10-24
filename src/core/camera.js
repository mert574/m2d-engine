/**
 * The camera's width and height are the size of the visible world *in world
 * units* — how much of the world is on screen, not how many pixels it is drawn
 * with. They come from the viewport's view size, so changing the render
 * resolution leaves them untouched; only an aspect-ratio change in `'expand'`
 * mode moves them. See `viewport.js`.
 */
export class Camera {
  constructor(width, height, options = {}) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;

    this.target = null;
    this.lerp = options.lerp || 0.1;
    this.bounds = options.bounds || null;
    this.padding = options.padding || { x: 100, y: 100 };
  }

  init(scene) {
    this.scene = scene;
  }

  follow(target) {
    this.target = target;
  }

  update() {
    if (!this.target) return;

    const targetX = this.target.body.position.x;
    const targetY = this.target.body.position.y;

    // Smooth camera movement
    this.x += (targetX - this.x) * this.lerp;
    this.y += (targetY - this.y) * this.lerp;

    // Apply camera bounds if set
    if (this.bounds) {
      this.x = Camera.#clampAxis(this.x, this.bounds.left, this.bounds.right, this.width);
      this.y = Camera.#clampAxis(this.y, this.bounds.top, this.bounds.bottom, this.height);
    }
  }

  /**
   * Clamp the camera centre so the view stays inside [min, max].
   *
   * When the view is *larger* than the bounded span — an expanded aspect on a
   * small board — the two clamp limits cross and naive min/max would pin the
   * camera to whichever limit wins, parking the board off-centre. Centring on
   * the span is the graceful version: the whole board stays in the middle and
   * only the surrounding void grows.
   */
  static #clampAxis(value, min, max, viewSize) {
    const lo = min + viewSize / 2;
    const hi = max - viewSize / 2;
    if (lo > hi) return (min + max) / 2;
    return Math.max(lo, Math.min(hi, value));
  }

  isVisible(x, y, width, height) {
    const left = x - this.x + this.width / 2;
    const top = y - this.y + this.height / 2;
    
    return (
      left + width >= -this.padding.x &&
      left <= this.width + this.padding.x &&
      top + height >= -this.padding.y &&
      top <= this.height + this.padding.y
    );
  }

  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.x + this.width / 2,
      y: worldY - this.y + this.height / 2
    };
  }

  screenToWorld(screenX, screenY) {
    return {
      x: screenX + this.x - this.width / 2,
      y: screenY + this.y - this.height / 2
    };
  }

  getVisibleArea() {
    return {
      left: this.x - this.width / 2,
      right: this.x + this.width / 2,
      top: this.y - this.height / 2,
      bottom: this.y + this.height / 2
    };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }
} 