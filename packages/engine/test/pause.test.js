import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createCanvasElement, installWindowStub, displayCanvas, stubDocumentListeners } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { M2D } from '../src/core/m2d.js';

/**
 * Engine pause (`game.paused`): the simulation freezes, the presentation
 * does not. That split is what lets the settings menu sit over a crisp,
 * frozen frame — and what the menu's Paused row and `pauseWhenOpen` rely on.
 */

describe('engine pause', () => {
  let game;
  let renderer;
  let scene;

  beforeAll(stubDocumentListeners);

  beforeEach(() => {
    installWindowStub();
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};

    renderer = new RecordingRenderer();
    game = new M2D(displayCanvas(1280, 720), { width: 1280, height: 720, renderer });
    scene = { fixedUpdate: vi.fn(), update: vi.fn(), updateUI: vi.fn(), draw: vi.fn(), drawUI: vi.fn() };
    game.sceneManager.currentScene = scene;
    game.sceneManager.loading = false;
  });

  /**
   * Two update calls: the first only establishes lastTime. The second is a
   * 20 ms frame, which pays for one 1/60 s tick and leaves the rest in the
   * accumulator.
   */
  function runFrame() {
    game.update(1000);
    renderer.reset();
    game.update(1020);
  }

  it('starts unpaused and simulates normally', () => {
    runFrame();

    expect(game.paused).toBe(false);
    expect(scene.fixedUpdate).toHaveBeenCalledWith(1 / 60);
    expect(scene.update).toHaveBeenCalled();
    expect(scene.draw).toHaveBeenCalled();
  });

  it('freezes the simulation but keeps presenting while paused', () => {
    game.paused = true;
    runFrame();

    // No simulation...
    expect(scene.fixedUpdate).not.toHaveBeenCalled();
    expect(scene.update).not.toHaveBeenCalled();
    // ...but the frame is still drawn, world pass and UI pass alike, so the
    // frozen game stays visible under overlays.
    expect(scene.draw).toHaveBeenCalled();
    expect(scene.drawUI).toHaveBeenCalled();
    expect(renderer.callsTo('beginFrame')).toHaveLength(1);
  });

  it('keeps ticking the UI while paused', () => {
    // A pause menu has to animate itself in over the frozen game, so the UI
    // tree is updated on a path the pause does not gate. Freezing it with
    // the simulation is what would make the pause look like a hang.
    game.paused = true;
    runFrame();

    expect(scene.update).not.toHaveBeenCalled();
    expect(scene.updateUI).toHaveBeenCalledWith(expect.closeTo(0.02, 3));
  });

  it('passes the frame delta to the draw passes', () => {
    // Both used to be called with no argument at all, so every element's
    // `draw(deltaTime)` saw `undefined` and nothing could animate itself.
    runFrame();

    expect(scene.draw).toHaveBeenCalledWith(expect.closeTo(0.02, 3));
    expect(scene.drawUI).toHaveBeenCalledWith(expect.closeTo(0.02, 3));
  });

  it('does not move the camera while paused', () => {
    game.camera.follow({ body: { position: { x: 5000, y: 3000 } } });
    const before = { x: game.camera.x, y: game.camera.y };

    game.paused = true;
    runFrame();

    expect(game.camera.x).toBe(before.x);
    expect(game.camera.y).toBe(before.y);
  });

  it('resumes without a time jump', () => {
    game.paused = true;
    game.update(1000);
    game.update(5000); // a long pause

    game.paused = false;
    scene.update.mockClear();
    game.update(5020);

    // lastTime advanced during the pause, so the first live frame is one
    // frame's worth — one tick — not the whole paused stretch.
    expect(scene.fixedUpdate).toHaveBeenCalledTimes(1);
    expect(scene.update).toHaveBeenCalledWith(expect.closeTo(0.02, 3));
  });

  describe('game.time', () => {
    it('ticks the clocks once per frame and the simulation once per fixed step', () => {
      runFrame();

      expect(game.time.frame).toBe(1);
      expect(game.time.steps).toBe(1);
      expect(game.time.delta).toBeCloseTo(0.02, 3);
      expect(game.time.unscaledElapsed).toBeCloseTo(0.02, 3);
      // Simulation time is tick-quantized; the rest waits in the accumulator.
      expect(game.time.elapsed).toBeCloseTo(1 / 60, 6);
      expect(game.time.interpolation).toBeCloseTo((0.02 - 1 / 60) / (1 / 60), 3);
    });

    it('runs as many ticks as a frame pays for, each with the fixed dt', () => {
      game.update(1000);
      game.update(1050); // 50 ms: three ticks
      expect(scene.fixedUpdate).toHaveBeenCalledTimes(3);
      for (const call of scene.fixedUpdate.mock.calls) expect(call[0]).toBe(1 / 60);
      expect(game.time.steps).toBe(3);
    });

    it('reports zero game time while paused and keeps wall time moving', () => {
      game.paused = true;
      runFrame();

      expect(game.time.delta).toBe(0);
      expect(game.time.elapsed).toBe(0);
      expect(game.time.steps).toBe(0);
      expect(game.time.unscaledDelta).toBeCloseTo(0.02, 3);
      expect(game.time.unscaledElapsed).toBeCloseTo(0.02, 3);
    });

    it('gives the scene scaled game time per frame and the UI wall time', () => {
      // Slow motion slows per-frame animation along with the ticks, while a
      // menu keeps its own pace.
      game.time.scale = 0.5;
      game.update(1000);
      game.update(1040); // 40 ms at half speed: 20 ms of game time, one tick

      expect(scene.fixedUpdate).toHaveBeenCalledTimes(1);
      expect(scene.update).toHaveBeenCalledWith(expect.closeTo(0.02, 3));
      expect(scene.updateUI).toHaveBeenCalledWith(expect.closeTo(0.04, 3));
      expect(scene.draw).toHaveBeenCalledWith(expect.closeTo(0.04, 3));
    });

    it('steps physics once per tick, inside fixedUpdate, after the scene', () => {
      const order = [];
      scene.fixedUpdate.mockImplementation(() => order.push('scene'));
      vi.spyOn(game.physics, 'step').mockImplementation(() => order.push('physics'));
      game.update(1000);
      game.update(1040); // two ticks

      expect(order).toEqual(['scene', 'physics', 'scene', 'physics']);
    });

    it('samples the input once per tick, with edges reaching only the first tick of a frame', () => {
      const seen = [];
      scene.fixedUpdate.mockImplementation(() => seen.push(game.input.snapshot.justPressed('Space')));
      game.update(1000); // seed frame
      // Pressed between frames: delivered by the next beginFrame.
      game.input.push({ kind: 'keydown', code: 'Space', key: ' ', time: 1010 });
      game.update(1040); // two ticks in one frame

      expect(seen).toEqual([true, false]);
      // The per-frame API still sees the edge for the whole frame.
      expect(game.input.snapshot.isDown('Space')).toBe(true);
    });

    it('carries a press edge across a frame that ran no tick', () => {
      // A 144 Hz display: a 7 ms frame runs no 1/60 s tick. A key pressed in
      // it must still reach the next tick, or nitro presses vanish.
      const seen = [];
      scene.fixedUpdate.mockImplementation(() => seen.push(game.input.snapshot.justPressed('KeyX')));
      game.update(1000);
      game.input.push({ kind: 'keydown', code: 'KeyX', key: 'x', time: 1003 });
      game.update(1007);   // tickless frame: edge would be retired here
      expect(scene.fixedUpdate).not.toHaveBeenCalled();
      game.update(1020);   // the tick that must see it
      expect(seen).toEqual([true]);
    });

    it('does not simulate the scene when the game is over, but keeps stepping physics', () => {
      game.isGameOver = true;
      const stepped = vi.spyOn(game.physics, 'step');
      runFrame();
      expect(scene.fixedUpdate).not.toHaveBeenCalled();
      expect(stepped).toHaveBeenCalledTimes(1);
    });

    it('is one time scale with the physics world and the g_timescale cvar', () => {
      game.cvars.set('g_timescale', 0.25);
      expect(game.time.scale).toBe(0.25);
      expect(game.physics.timeScale).toBe(0.25);

      game.physics.timeScale = 2;
      expect(game.cvars.get('g_timescale')).toBe(2);
    });

    it('takes the initial scale from the timeScale option', () => {
      const scaled = new M2D(displayCanvas(1280, 720), { renderer: new RecordingRenderer(), timeScale: 0.5 });
      expect(scaled.time.scale).toBe(0.5);
      scaled.destroy();

      // The older spelling still works.
      const legacy = new M2D(displayCanvas(1280, 720), { renderer: new RecordingRenderer(), physicsTimeScale: 2 });
      expect(legacy.time.scale).toBe(2);
      expect(legacy.physics.timeScale).toBe(2);
      legacy.destroy();
    });

    it('takes the step settings from the engine options and shares them with physics', () => {
      const custom = new M2D(displayCanvas(1280, 720), {
        renderer: new RecordingRenderer(), fixedTimestep: 1 / 30, maxSubSteps: 2
      });
      expect(custom.time.fixedTimestep).toBe(1 / 30);
      expect(custom.physics.fixedTimestep).toBe(1 / 30);
      expect(custom.physics.maxSubSteps).toBe(2);
      custom.destroy();
    });

    it('pause(), resume() and togglePause() drive the same flag', () => {
      game.pause();
      expect(game.paused).toBe(true);
      game.resume();
      expect(game.paused).toBe(false);
      expect(game.togglePause()).toBe(true);
      expect(game.paused).toBe(true);
    });

    it('reset() zeroes the clocks, drops timers and reseeds the rng', () => {
      const fn = vi.fn();
      runFrame();
      game.time.after(0.001, fn);
      const first = game.rng.next();

      game.reset();

      expect(game.time.elapsed).toBe(0);
      expect(game.time.steps).toBe(0);
      expect(game.time.activeCount).toBe(0);
      expect(game.rng.next()).toBe(first);
    });
  });
});
