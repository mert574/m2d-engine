import { Camera } from './camera.js';

/**
 * The camera controls a scene asks for in `world.camera`: the mouse wheel
 * zooming within limits (`wheelZoom`), a drag turning a 3D orbit
 * (`orbitDrag`), and a 2D view pulling out as what it follows speeds up
 * (`speedZoom`). What the examples' hooks each did with their own input
 * listeners and per-frame code, as data.
 *
 * Presentation: attached when the scene shows, never in edit mode (the
 * editor's camera is its own) and never headless. It listens through the
 * input manager, after the UI, so a menu over the level still takes the
 * wheel first.
 */
export class CameraControls {
  /**
   * @param {import('./m2d.js').M2D} game
   * @param {object} config - `world.camera`
   */
  constructor(game, config) {
    this.game = game;
    this.config = config;
    /** The zoom the wheel sets and speed pulls out from. */
    this.baseZoom = typeof game.camera.zoom === 'number' ? game.camera.zoom : 1;
    this.#off = [];
  }

  #off;

  /** Whether the config asks for any control at all. */
  static wanted(config) {
    return !!(config?.wheelZoom || config?.orbitDrag || config?.speedZoom);
  }

  attach() {
    const input = this.game.input;
    const { wheelZoom, orbitDrag } = this.config;
    const three = this.game.physics.dimensions === 3;
    if (wheelZoom) {
      const speed = wheelZoom.speed ?? 0.0015;
      this.#off.push(input.on('scroll', (event) => {
        if (event.consumed) return;
        if (three) this.game.camera.zoom(Math.exp(event.scroll.y * speed));
        else {
          const min = wheelZoom.min ?? 0.25;
          const max = wheelZoom.max ?? 4;
          this.baseZoom = Math.min(max, Math.max(min, this.baseZoom * Math.exp(-event.scroll.y * speed)));
          if (!this.config.speedZoom) this.game.camera.zoom = this.baseZoom;
        }
        event.consume();
      }));
    }
    if (orbitDrag && three) {
      const yaw = orbitDrag.yaw ?? 0.005;
      const pitch = orbitDrag.pitch ?? 0.004;
      this.#off.push(input.on('drag', (event) => {
        if (event.consumed) return;
        this.game.camera.orbit(-event.delta.ui.x * yaw, event.delta.ui.y * pitch);
        event.consume();
      }));
    }
  }

  /** One frame: the speed zoom eases toward its pull. */
  update(deltaTime) {
    const speedZoom = this.config.speedZoom;
    if (!speedZoom || this.game.physics.dimensions === 3) return;
    const camera = this.game.camera;
    const velocity = camera.target?.velocity ?? camera.target?.body?.velocity;
    const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
    const pull = (speedZoom.out ?? 0.2) * Math.min(1, speed / (speedZoom.at ?? 600));
    const wanted = this.baseZoom * (1 - pull);
    camera.zoom += (wanted - camera.zoom) * Camera.smoothing(speedZoom.ease ?? 0.05, deltaTime);
  }

  detach() {
    for (const off of this.#off) off();
    this.#off = [];
  }
}

/** The `world.camera` keys that configure these controls rather than the camera itself. */
export const CONTROL_KEYS = ['wheelZoom', 'orbitDrag', 'speedZoom'];
