import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachCameraControls } from '../src/cameraControls.ts';

/**
 * The editor's camera, driven as the engine would drive it: drags and
 * scrolls arrive as input events with the held buttons, the fly keys as
 * DOM keyboard events while the right button is down. The orbit camera
 * is modelled as the engine's: the eye derives from the look-at point.
 */

interface Handler { (event: unknown): void }

function orbitCamera() {
  const camera = {
    mode: 'orbit' as const,
    position: { x: 0, y: 0, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    yaw: Math.PI / 4, pitch: 0.45, distance: 10, minPitch: -0.2, maxPitch: Math.PI / 2 - 0.05,
    fov: Math.PI / 3, height: 540,
    orbit(dYaw: number, dPitch: number) { this.yaw += dYaw; this.pitch = Math.min(this.maxPitch, Math.max(this.minPitch, this.pitch + dPitch)); },
    zoom(factor: number) { this.distance *= factor; },
    update() {
      const cp = Math.cos(this.pitch);
      this.position.x = this.lookAt.x + Math.sin(this.yaw) * cp * this.distance;
      this.position.y = this.lookAt.y + Math.sin(this.pitch) * this.distance;
      this.position.z = this.lookAt.z + Math.cos(this.yaw) * cp * this.distance;
    }
  };
  camera.update();
  return camera;
}

function fakeGame(dimensions: 2 | 3) {
  const handlers = new Map<string, Handler>();
  const camera = dimensions === 3 ? orbitCamera() : { x: 100, y: 100, zoom: 1 };
  return {
    camera,
    renderer: { dimensions },
    input: { on: (type: string, handler: Handler) => { handlers.set(type, handler); return () => handlers.delete(type); } },
    fire: (type: string, event: Record<string, unknown>) => handlers.get(type)?.({ consume() {}, ...event })
  };
}

const drag = (buttons: number, dx: number, dy: number) => ({ buttons, delta: { ui: { x: dx, y: dy } }, scroll: { x: 0, y: 0 } });

let canvas: HTMLCanvasElement;
let frames: FrameRequestCallback[];
beforeEach(() => {
  canvas = document.createElement('canvas');
  document.body.replaceChildren(canvas);
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Run the animation frames queued so far, `ms` apart. */
const tick = (now: number) => { const due = frames.splice(0); for (const cb of due) cb(now); };

describe('the 3D camera', () => {
  it('orbits on a left drag and looks around from the eye on a right drag', () => {
    const game = fakeGame(3);
    const changed = vi.fn();
    attachCameraControls(game as never, canvas, changed);
    const camera = game.camera as ReturnType<typeof orbitCamera>;
    const yaw = camera.yaw;
    game.fire('drag', drag(1, 40, 0));
    expect(camera.yaw).toBeCloseTo(yaw - 0.2);
    expect(camera.lookAt).toEqual({ x: 0, y: 0, z: 0 });        // the look-at point stays, the eye moves
    expect(changed).toHaveBeenCalled();

    const eye = { ...camera.position };
    game.fire('drag', drag(2, 50, 10));
    // Looking around: the eye stays where it was, the look-at point swings.
    expect(camera.position.x).toBeCloseTo(eye.x, 6);
    expect(camera.position.y).toBeCloseTo(eye.y, 6);
    expect(camera.position.z).toBeCloseTo(eye.z, 6);
    expect(Math.hypot(camera.lookAt.x, camera.lookAt.y, camera.lookAt.z)).toBeGreaterThan(0.1);
  });

  it('pans on a middle drag', () => {
    const game = fakeGame(3);
    attachCameraControls(game as never, canvas);
    const camera = game.camera as ReturnType<typeof orbitCamera>;
    game.fire('drag', drag(4, 0, 100));
    expect(camera.lookAt.y).toBeGreaterThan(0.5);            // dragging down lifts the view: the world slides down
    expect(camera.lookAt.x).toBeCloseTo(0);
  });

  it('flies with W while the right button is held, and not otherwise', () => {
    const game = fakeGame(3);
    const controls = attachCameraControls(game as never, canvas);
    const camera = game.camera as ReturnType<typeof orbitCamera>;
    const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

    // W alone is the gizmo's key: nothing moves.
    key('keydown', 'KeyW');
    tick(0); tick(100);
    expect(camera.lookAt).toEqual({ x: 0, y: 0, z: 0 });
    key('keyup', 'KeyW');

    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, buttons: 2, bubbles: true }));
    expect(controls.flying).toBe(true);
    key('keydown', 'KeyW');
    tick(0); tick(100); tick(200);
    // Forward along the view: toward the look-at point, which is -x -z from the eye and downward.
    expect(camera.lookAt.x).toBeLessThan(-0.5);
    expect(camera.lookAt.z).toBeLessThan(-0.5);
    expect(camera.lookAt.y).toBeLessThan(0);
    const after = { ...camera.lookAt };
    // Shift hurries.
    key('keydown', 'ShiftLeft');
    tick(300);
    const quick = Math.hypot(camera.lookAt.x - after.x, camera.lookAt.z - after.z);
    key('keyup', 'ShiftLeft');
    key('keyup', 'KeyW');
    window.dispatchEvent(new PointerEvent('pointerup', { button: 2, buttons: 0, bubbles: true }));
    expect(controls.flying).toBe(false);
    const plain = Math.hypot(after.x, after.z) / 2;           // two plain 100 ms steps got us to `after`
    expect(quick).toBeGreaterThan(plain * 3);
    // Released: a later frame moves nothing.
    const still = { ...camera.lookAt };
    tick(400); tick(500);
    expect(camera.lookAt).toEqual(still);
  });

  it('rises and sinks with E and Q, and detaches cleanly', () => {
    const game = fakeGame(3);
    const controls = attachCameraControls(game as never, canvas);
    const camera = game.camera as ReturnType<typeof orbitCamera>;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, buttons: 2, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    tick(0); tick(100);
    expect(camera.lookAt.y).toBeGreaterThan(0.5);
    expect(camera.lookAt.x).toBeCloseTo(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
    const y = camera.lookAt.y;
    tick(200); tick(300);
    expect(camera.lookAt.y).toBeLessThan(y);
    controls.detach();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', bubbles: true }));
    const stillY = camera.lookAt.y;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    tick(400); tick(500);
    expect(camera.lookAt.y).toBe(stillY);
  });

  it('flies on the arrow keys when the viewport has the focus, not when typing', () => {
    const game = fakeGame(3);
    attachCameraControls(game as never, canvas);
    const camera = game.camera as ReturnType<typeof orbitCamera>;
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    tick(0); tick(100);
    expect(camera.lookAt).toEqual({ x: 0, y: 0, z: 0 });
    input.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', bubbles: true }));
    input.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    tick(200); tick(300);
    expect(camera.lookAt.z).toBeLessThan(-0.3);
  });
});

describe('the 2D camera', () => {
  it('pans on any drag, zooms on scroll, and pans on the arrow keys', () => {
    const game = fakeGame(2);
    attachCameraControls(game as never, canvas);
    const camera = game.camera as { x: number; y: number; zoom: number };
    game.fire('drag', drag(1, 10, 5));
    expect(camera).toMatchObject({ x: 90, y: 95 });
    game.fire('drag', drag(2, 10, 5));
    expect(camera).toMatchObject({ x: 80, y: 90 });
    game.fire('scroll', { scroll: { x: 0, y: -100 } });
    expect(camera.zoom).toBeGreaterThan(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    tick(0); tick(100);
    expect(camera.x).toBeGreaterThan(80);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }));
  });
});
