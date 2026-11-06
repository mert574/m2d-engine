import * as mat4 from './renderers/geometry/mat4.js';
import { Vec3 } from './math.js';

/**
 * The camera of a three-dimensional game: an eye, a point it looks at and
 * a perspective projection, with two ways of being driven.
 *
 * - `'orbit'`: the camera circles a target (an entity, or a point) at a
 *   `distance`, by a `yaw` around the up axis and a `pitch` above the
 *   ground. Drag to turn it, scroll to move in and out. The default, and
 *   what most third-person games want.
 * - `'free'`: a position and a direction, moved by game code; a flying
 *   camera, a first-person view.
 *
 * It answers the same calls the 2D `Camera` does, where they still mean
 * something: `init`, `follow`, `resetConfig`, `update`, `resize`,
 * `screenToWorld` and `worldToScreen`. The last two go through a ray and
 * the ground plane, since a screen point is a line in a 3D world, not a
 * point. `width` and `height` are the view in UI units and only decide
 * the aspect ratio.
 *
 * Presentation only: nothing here is read by the simulation.
 */
export class Camera3D {
  constructor(width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.view = mat4.create();
    this.projection = mat4.create();
    this.viewProjection = mat4.create();
    this.inverseViewProjection = mat4.create();
    this.resetConfig(options);
  }

  /** The frame rate `lerp` is specified against; see `Camera.REFERENCE_FPS`. */
  static REFERENCE_FPS = 60;

  /**
   * Restore every tunable to its default, or to `options`. The engine
   * calls this when a scene unloads so one scene's framing never leaks
   * into the next.
   */
  resetConfig(options = {}) {
    /** @type {'orbit'|'free'} */
    this.mode = options.mode ?? 'orbit';
    /** Vertical field of view, radians. */
    this.fov = options.fov ?? Math.PI / 3;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 500;
    this.up = { x: 0, y: 1, z: 0 };

    this.position = { ...(options.position ?? { x: 0, y: 5, z: 10 }) };
    /** Where the camera looks. In orbit mode it eases toward the target. */
    this.lookAt = { ...(options.lookAt ?? { x: 0, y: 0, z: 0 }) };
    /** An entity (anything with `renderPosition` or `position`) or a point, or null. */
    this.target = options.target ?? null;
    /** Added to the target's position before looking at it: a character's chest, not its feet. */
    this.targetOffset = { ...(options.targetOffset ?? { x: 0, y: 0, z: 0 }) };

    this.yaw = options.yaw ?? Math.PI / 4;
    this.pitch = options.pitch ?? 0.45;
    this.distance = options.distance ?? 10;
    this.minDistance = options.minDistance ?? 1;
    this.maxDistance = options.maxDistance ?? 60;
    this.minPitch = options.minPitch ?? -0.2;
    this.maxPitch = options.maxPitch ?? Math.PI / 2 - 0.05;
    /** Per-frame fraction at 60 Hz the look-at point covers toward the target. */
    this.lerp = options.lerp ?? 0.15;
    this.scene = null;
    this.#rebuild();
  }

  init(scene) {
    this.scene = scene;
  }

  follow(target) {
    this.target = target;
  }

  /** Turn an orbit camera by a drag, in radians. */
  orbit(deltaYaw, deltaPitch) {
    this.yaw += deltaYaw;
    this.pitch = Math.min(this.maxPitch, Math.max(this.minPitch, this.pitch + deltaPitch));
  }

  /** Move an orbit camera in or out by a factor; 1.1 is a notch out. */
  zoom(factor) {
    this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance * factor));
  }

  /**
   * The direction the camera faces, flattened to the ground and normalised:
   * what "forward" means to a character steered relative to the view.
   */
  get forward() {
    const d = Vec3.subtract(this.lookAt, this.position);
    return Vec3.normalize({ x: d.x, y: 0, z: d.z });
  }

  /** Forward turned a quarter to the right. */
  get right() {
    const f = this.forward;
    return { x: -f.z, y: 0, z: f.x };
  }

  update(deltaTime = 1 / Camera3D.REFERENCE_FPS) {
    if (this.mode === 'orbit') {
      const t = this.#targetPoint();
      if (t) {
        // Exponential ease, frame-rate corrected as the 2D camera's is.
        const k = 1 - Math.pow(1 - this.lerp, deltaTime * Camera3D.REFERENCE_FPS);
        this.lookAt.x += (t.x - this.lookAt.x) * k;
        this.lookAt.y += (t.y - this.lookAt.y) * k;
        this.lookAt.z += (t.z - this.lookAt.z) * k;
      }
      const cp = Math.cos(this.pitch);
      this.position.x = this.lookAt.x + Math.sin(this.yaw) * cp * this.distance;
      this.position.y = this.lookAt.y + Math.sin(this.pitch) * this.distance;
      this.position.z = this.lookAt.z + Math.cos(this.yaw) * cp * this.distance;
    }
    this.#rebuild();
  }

  #targetPoint() {
    const t = this.target;
    if (!t) return null;
    const p = t.renderPosition ?? t.body?.renderPosition ?? t.position ?? t;
    return Vec3.add(p, this.targetOffset);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.#rebuild();
  }

  #rebuild() {
    mat4.perspective(this.fov, this.width / this.height, this.near, this.far, this.projection);
    mat4.lookAt(this.position, this.lookAt, this.up, this.view);
    mat4.multiply(this.projection, this.view, this.viewProjection);
    mat4.invert(this.viewProjection, this.inverseViewProjection);
  }

  /**
   * The ray through a view point, in world space.
   * @param {number} x - View x, 0..width
   * @param {number} y - View y, 0..height, down
   * @returns {{origin: {x,y,z}, direction: {x,y,z}}}
   */
  screenToRay(x, y) {
    const nx = (x / this.width) * 2 - 1;
    const ny = 1 - (y / this.height) * 2;
    const near = mat4.transformPoint(this.inverseViewProjection, { x: nx, y: ny, z: 0 });
    const far = mat4.transformPoint(this.inverseViewProjection, { x: nx, y: ny, z: 1 });
    return { origin: near, direction: Vec3.normalize(Vec3.subtract(far, near)) };
  }

  /**
   * Where a view point lands on the ground plane `y = groundY`, or on the
   * plane through the look-at point when the ray never reaches the ground.
   * The 2D camera's `screenToWorld`, for a world with a floor.
   */
  screenToWorld(x, y, groundY = 0) {
    const { origin, direction } = this.screenToRay(x, y);
    let t = direction.y !== 0 ? (groundY - origin.y) / direction.y : -1;
    if (t < 0) t = Vec3.distance(origin, this.lookAt);
    return Vec3.add(origin, Vec3.scale(direction, t));
  }

  /**
   * A world point on the view, in view units; `z` is clip depth, so a point
   * behind the camera has `z` outside 0..1.
   */
  worldToScreen(x, y, z = 0) {
    const p = mat4.transformPoint(this.viewProjection, { x, y, z });
    return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height, z: p.z };
  }

  /** The 2D camera's view rectangle has no 3D answer; the ground under the look-at point stands in. */
  getVisibleArea() {
    const r = this.distance * 2;
    return { x: this.lookAt.x - r, y: this.lookAt.z - r, width: r * 2, height: r * 2 };
  }
}
