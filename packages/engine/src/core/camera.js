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

  /**
   * The frame rate `lerp` is specified against. `lerp` is the fraction of
   * the remaining distance covered per frame *at this rate*; `update`
   * converts it to the current frame's length so the follow feels the same
   * at 30, 60 and 144 frames per second.
   */
  static REFERENCE_FPS = 60;

  /**
   * Move toward the target.
   *
   * The smoothing is an exponential decay, which is what a per-frame lerp
   * is at one frame rate — only this one is corrected for the actual frame
   * length. The naive `x += (target - x) * lerp` closes 0.1 of the gap per
   * frame, so at 144 Hz it closed 2.4× more gap per second than at 60 Hz
   * and the camera felt stiffer on a faster display.
   *
   * @param {number} [deltaTime=1/60] - Wall seconds this frame. The camera
   *   is presentation and should not slow down in slow motion; its target
   *   already moves slower.
   */
  update(deltaTime = 1 / Camera.REFERENCE_FPS) {
    if (!this.target) return;

    // Follow the *rendered* position: the camera is a render concern, and
    // chasing the raw solver position would reintroduce the between-step
    // stair-stepping that interpolation exists to remove.
    const target = this.target.body.renderPosition ?? this.target.body.position;
    const targetX = target.x;
    const targetY = target.y;

    const t = Camera.smoothing(this.lerp, deltaTime);
    this.x += (targetX - this.x) * t;
    this.y += (targetY - this.y) * t;

    // Apply camera bounds if set
    if (this.bounds) {
      this.x = Camera.#clampAxis(this.x, this.bounds.left, this.bounds.right, this.width);
      this.y = Camera.#clampAxis(this.y, this.bounds.top, this.bounds.bottom, this.height);
    }
  }

  /**
   * The fraction of the remaining distance to cover this frame so that a
   * per-frame fraction of `lerp` at `REFERENCE_FPS` is matched over any
   * frame length: `1 - (1 - lerp)^(dt · fps)`.
   * @param {number} lerp - Per-frame fraction at the reference rate, 0..1.
   * @param {number} deltaTime - Seconds this frame.
   */
  static smoothing(lerp, deltaTime) {
    if (lerp >= 1) return 1;
    if (lerp <= 0 || deltaTime <= 0) return 0;
    return 1 - Math.pow(1 - lerp, deltaTime * Camera.REFERENCE_FPS);
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