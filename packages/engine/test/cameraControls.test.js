import { describe, it, expect, vi } from 'vitest';
import { CameraControls } from '../src/core/cameraControls.js';

/**
 * `world.camera.orbitDrag` turns a 3D camera with a drag. The node suites
 * have no 3D renderer, so the control runs against a stand-in game: the
 * input it listens to and the camera it turns are all it touches.
 */
function standIn(dimensions) {
  const listeners = new Map();
  return {
    physics: { dimensions },
    camera: { orbit: vi.fn() },
    input: {
      on(name, listener) {
        listeners.set(name, listener);
        return () => listeners.delete(name);
      }
    },
    /** Fire `name` at the control, as the input would. */
    emit(name, event) {
      listeners.get(name)?.(event);
    },
    listening: (name) => listeners.has(name)
  };
}

const drag = (x, y, consumed = false) => ({ delta: { ui: { x, y } }, consumed, consume: vi.fn() });

describe('orbit drag', () => {
  it('turns a 3D camera by the drag, scaled by its yaw and pitch, and takes the drag', () => {
    const game = standIn(3);
    const controls = new CameraControls(game, { orbitDrag: { yaw: 0.01, pitch: 0.02 } });
    controls.attach();
    const event = drag(10, -5);
    game.emit('drag', event);
    expect(game.camera.orbit).toHaveBeenCalledWith(-0.1, -0.1);
    expect(event.consume).toHaveBeenCalled();
  });

  it('turns at its default rates when none are given', () => {
    const game = standIn(3);
    new CameraControls(game, { orbitDrag: {} }).attach();
    game.emit('drag', drag(100, 100));
    const [yaw, pitch] = game.camera.orbit.mock.calls[0];
    expect(yaw).toBeCloseTo(-0.5);
    expect(pitch).toBeCloseTo(0.4);
  });

  it('leaves a drag something else took, a 2D camera, and a scene that has left', () => {
    const game = standIn(3);
    const controls = new CameraControls(game, { orbitDrag: {} });
    controls.attach();
    game.emit('drag', drag(10, 10, true));
    expect(game.camera.orbit).not.toHaveBeenCalled();

    controls.detach();
    expect(game.listening('drag')).toBe(false);

    const flat = standIn(2);
    new CameraControls(flat, { orbitDrag: {} }).attach();
    expect(flat.listening('drag')).toBe(false);
  });
});
