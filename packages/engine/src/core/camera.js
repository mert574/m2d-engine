/**
 * The camera's width and height are the size of the visible world *in world
 * units* — how much of the world is on screen, not how many pixels it is drawn
 * with. They come from the viewport's view size, so changing the render
 * resolution leaves them untouched; only an aspect-ratio change in `'expand'`
 * mode moves them. See `viewport.js`.
 */
import * as mat from './renderers/geometry/matrix.js';

export class Camera {
  constructor(width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.resetConfig(options);
  }

  /**
   * Restore position and every tunable to its default, or to `options`.
   * The engine calls this (with no options) when a scene unloads and when
   * the world resets, so one scene's camera setup — mode, bounds, zoom, a
   * rotation follow — never leaks into the next. A scene configures the
   * camera it wants in `onEnter`. `width` and `height` belong to the
   * viewport and are left alone.
   */
  resetConfig(options = {}) {
    this.x = 0;
    this.y = 0;

    /**
     * Magnification about the camera's centre. 1 draws the world at its
     * native size; 2 shows half as much world at twice the size. Presentation
     * only: the view size in world units stays `width / zoom` by `height /
     * zoom`, and the simulation never sees it.
     */
    this.zoom = options.zoom ?? 1;
    /**
     * The camera's own angle in radians; the world appears turned the other
     * way. A camera that follows a car's heading sets this every frame.
     */
    this.rotation = options.rotation ?? 0;

    this.target = null;
    /**
     * How the camera moves each frame.
     * - `'follow'`: ease toward the target (the default).
     * - `'scroll'`: move at `scrollVelocity` regardless of the target; an
     *   auto-scroller. The target, if any, is ignored.
     * - `'rooms'`: snap to the room of `roomSize` the target is in, easing
     *   between rooms; a single-screen game with room transitions.
     * @type {'follow'|'scroll'|'rooms'}
     */
    this.mode = options.mode ?? 'follow';
    /** Render-plane units per second in `'scroll'` mode. */
    this.scrollVelocity = options.scrollVelocity ?? { x: 0, y: 0 };
    /** Room size in render units for `'rooms'` mode; defaults to the view. */
    this.roomSize = options.roomSize ?? null;
    /** Which axes a follow tracks; a belt scroller locks y. */
    this.followAxes = options.followAxes ?? { x: true, y: true };
    /**
     * Turn with the target: the camera's `rotation` eases toward the
     * target body's angle plus `rotationOffset`, so the target's nose
     * stays up the screen. A rotating top-down game sets this.
     */
    this.followRotation = options.followRotation ?? false;
    /** Added to the target's angle; -π/2 points a +x nose up the screen. */
    this.rotationOffset = options.rotationOffset ?? -Math.PI / 2;
    /** Per-frame fraction at 60 Hz for the turn, like `lerp` for the move. */
    this.rotationLerp = options.rotationLerp ?? 0.04;
    /**
     * The most the view may turn per second, rad/s. A whole screen turning
     * is the strongest motion a camera can make, and following a ship that
     * spins at 3 rad/s with no cap is nauseating; 1.2 keeps the world
     * drifting round rather than whipping. `Infinity` disables the cap.
     */
    this.rotationMaxRate = options.rotationMaxRate ?? 1.2;
    /** Turns smaller than this, rad, are not followed: a wobble stays a wobble. */
    this.rotationDeadband = options.rotationDeadband ?? 0.03;
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
    if (this.mode === 'scroll') {
      this.x += this.scrollVelocity.x * deltaTime;
      this.y += this.scrollVelocity.y * deltaTime;
      this.clampToBounds();
      return;
    }
    // Bounds are the camera's, not the follow's: a single-screen level
    // with nothing to follow still opens inside its world rather than
    // with its corner in the middle of the view.
    if (!this.target) {
      this.clampToBounds();
      return;
    }

    // Follow the *rendered* position: the camera is a render concern, and
    // chasing the raw solver position would reintroduce the between-step
    // stair-stepping that interpolation exists to remove.
    // An entity's render anchor is its feet on the render plane, through
    // the scene's projection; a bare `{ body }` target gives its position.
    const target = this.target.renderAnchor ?? this.target.body.renderPosition ?? this.target.body.position;
    let targetX = target.x;
    let targetY = target.y;

    if (this.mode === 'rooms') {
      // The centre of the room the target stands in.
      const room = this.roomSize ?? { width: this.width / this.zoom, height: this.height / this.zoom };
      targetX = (Math.floor(target.x / room.width) + 0.5) * room.width;
      targetY = (Math.floor(target.y / room.height) + 0.5) * room.height;
    }

    const t = Camera.smoothing(this.lerp, deltaTime);
    if (this.followAxes.x) this.x += (targetX - this.x) * t;
    if (this.followAxes.y) this.y += (targetY - this.y) * t;

    if (this.followRotation) {
      const angle = this.target.body?.renderAngle ?? this.target.body?.angle;
      if (angle !== undefined) {
        const wanted = angle + this.rotationOffset;
        // Ease along the shorter arc so a turn through ±π does not spin.
        let delta = (wanted - this.rotation) % (Math.PI * 2);
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) > this.rotationDeadband) {
          let step = delta * Camera.smoothing(this.rotationLerp, deltaTime);
          const cap = this.rotationMaxRate * deltaTime;
          if (Math.abs(step) > cap) step = Math.sign(step) * cap;
          this.rotation += step;
        }
      }
    }

    this.clampToBounds();
  }

  /**
   * Jump to the target at once, as if the follow had always been there: no
   * swing from wherever the camera last was. The engine snaps when a scene
   * shows, so entering a level never opens on the view easing across it.
   */
  snap() {
    if (!this.target || this.mode === 'scroll') return;
    if (this.followRotation) {
      const angle = this.target.body?.renderAngle ?? this.target.body?.angle;
      if (angle !== undefined) this.rotation = angle + this.rotationOffset;
    }
    const lerp = this.lerp;
    this.lerp = 1;
    this.update(1 / Camera.REFERENCE_FPS);
    this.lerp = lerp;
  }

  /**
   * Keep the view inside `bounds`, if set. `update` does this after the
   * follow; a game that moves the camera by hand (a room snap, a zoom) can
   * call it itself so the edit cannot reveal the void past the map.
   */
  clampToBounds() {
    if (!this.bounds) return;
    const { width, height } = this.viewExtents();
    this.x = Camera.#clampAxis(this.x, this.bounds.left, this.bounds.right, width);
    this.y = Camera.#clampAxis(this.y, this.bounds.top, this.bounds.bottom, height);
  }

  /**
   * The world-space size of the visible region's bounding box: the view
   * divided by the zoom and, when the camera is rotated, grown to the box
   * that contains the turned rectangle.
   */
  viewExtents() {
    const w = this.width / this.zoom;
    const h = this.height / this.zoom;
    if (!this.rotation) return { width: w, height: h };
    const c = Math.abs(Math.cos(this.rotation));
    const s = Math.abs(Math.sin(this.rotation));
    return { width: w * c + h * s, height: w * s + h * c };
  }

  /**
   * World-to-view matrix, in the renderer's six-number affine form. Both
   * backends apply exactly this, so what `worldToScreen` computes is where
   * a point is drawn.
   */
  get matrix() {
    return mat.viewMatrix(this);
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

  /**
   * Whether a world rectangle with its top-left at `x, y` intersects the
   * visible area, grown by `padding` (in world units). Under rotation the
   * test is against the view's bounding box, so it can say yes to a corner
   * that is just off screen, never no to something on it.
   */
  isVisible(x, y, width, height) {
    const area = this.getVisibleArea();
    return (
      x + width >= area.left - this.padding.x &&
      x <= area.right + this.padding.x &&
      y + height >= area.top - this.padding.y &&
      y <= area.bottom + this.padding.y
    );
  }

  /** World position to view coordinates, (0, 0) at the view's top-left. */
  worldToScreen(worldX, worldY) {
    if (this.zoom === 1 && !this.rotation) {
      return {
        x: worldX - this.x + this.width / 2,
        y: worldY - this.y + this.height / 2
      };
    }
    const [x, y] = mat.apply(this.matrix, worldX, worldY);
    return { x, y };
  }

  /** View coordinates to world position. */
  screenToWorld(screenX, screenY) {
    if (this.zoom === 1 && !this.rotation) {
      return {
        x: screenX + this.x - this.width / 2,
        y: screenY + this.y - this.height / 2
      };
    }
    const inverse = mat.invert(this.matrix);
    if (!inverse) return { x: this.x, y: this.y };
    const [x, y] = mat.apply(inverse, screenX, screenY);
    return { x, y };
  }

  /**
   * The visible world as an axis-aligned rectangle. With rotation this is
   * the bounding box of the turned view, so it contains everything on
   * screen plus the corners that are not.
   */
  getVisibleArea() {
    const { width, height } = this.viewExtents();
    return {
      left: this.x - width / 2,
      right: this.x + width / 2,
      top: this.y - height / 2,
      bottom: this.y + height / 2
    };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }
} 