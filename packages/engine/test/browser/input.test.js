import { describe, it, expect, afterEach, vi } from 'vitest';

import { M2D } from '../../src/core/m2d.js';
import { SettingsMenu } from '../../src/core/ui/settingsMenu.js';

/**
 * The parts of the input system that only a real browser can answer for:
 * that genuine `PointerEvent`s reach the engine at the right coordinates,
 * that the canvas actually claims the surface, and that the listeners are
 * all gone after `destroy()`.
 *
 * The recognizers and the router are covered headlessly in test/input.test.js
 * by pushing records through the same queue; what is left here is the DOM
 * boundary itself.
 */

/** A canvas in the document, sized and positioned so client coords are known. */
function mountCanvas(width = 640, height = 360) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${width}px`,
    height: `${height}px`
  });
  document.body.appendChild(canvas);
  return canvas;
}

function dispatch(canvas, type, options = {}) {
  const event = new PointerEvent(type, {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...options
  });
  canvas.dispatchEvent(event);
  return event;
}

describe('input in a real browser', () => {
  const games = [];
  const canvases = [];

  function makeGame(options = {}) {
    const canvas = mountCanvas();
    canvases.push(canvas);
    // Pointer lock needs a user gesture a synthetic event cannot supply, and
    // would hide the absolute coordinates these tests are about.
    const game = new M2D(canvas, {
      width: 640, height: 360, renderer: 'canvas', pointerLock: false, ...options
    });
    games.push(game);
    return { game, canvas };
  }

  afterEach(() => {
    for (const game of games.splice(0)) game.destroy();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  it('claims the surface so the browser cannot scroll or select it', () => {
    const { canvas } = makeGame();

    expect(canvas.style.touchAction).toBe('none');
    expect(canvas.style.userSelect).toBe('none');
    expect(canvas.style.overscrollBehavior).toBe('contain');
    // Focusable, so keyboard input does not have to be stolen from the page.
    expect(canvas.tabIndex).toBe(0);
  });

  it('suppresses the context menu, since right-click belongs to the game', () => {
    const { canvas } = makeGame();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('turns a real PointerEvent into world coordinates', () => {
    const { game, canvas } = makeGame();
    const seen = [];
    game.input.on('click', (event) => seen.push(event));

    // The camera starts at the origin, so the view's centre is world (0, 0).
    dispatch(canvas, 'pointermove', { clientX: 320, clientY: 180, buttons: 0 });
    dispatch(canvas, 'pointerdown', { clientX: 320, clientY: 180 });
    dispatch(canvas, 'pointerup', { clientX: 320, clientY: 180 });
    game.input.beginFrame(performance.now());

    expect(seen).toHaveLength(1);
    expect(seen[0].world.x).toBeCloseTo(0, 5);
    expect(seen[0].world.y).toBeCloseTo(0, 5);
    expect(seen[0].ui.x).toBeCloseTo(game.uiRenderer.width / 2, 5);
  });

  it('delivers a press inside its own DOM handler, not at the next frame', () => {
    // User-activation-gated APIs (fullscreen, pointer lock) are called from
    // press handlers, and the browser only grants them inside the gesture.
    const { game, canvas } = makeGame();
    let delivered = false;
    game.input.on('pointerdown', () => { delivered = true; });

    dispatch(canvas, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(delivered).toBe(true);
  });

  it('buffers moves until the frame, coalescing them', () => {
    const { game, canvas } = makeGame();
    const seen = [];
    game.input.on('pointermove', (event) => seen.push(event));

    for (let x = 100; x <= 140; x += 10) {
      dispatch(canvas, 'pointermove', { clientX: x, clientY: 100, buttons: 0 });
    }
    expect(seen).toHaveLength(0);

    game.input.beginFrame(performance.now());

    expect(seen).toHaveLength(1);
  });

  it('prevents the page from scrolling on a wheel over the canvas', () => {
    const { game, canvas } = makeGame();
    const seen = [];
    game.input.on('scroll', (event) => seen.push(event));

    const event = new WheelEvent('wheel', {
      bubbles: true, cancelable: true,
      clientX: 100, clientY: 100, deltaY: 120, deltaMode: 0
    });
    canvas.dispatchEvent(event);
    game.input.beginFrame(performance.now());

    expect(event.defaultPrevented).toBe(true);
    expect(seen[0].scroll.y).toBe(120);
  });

  it('normalizes line-mode wheel deltas into pixels', () => {
    const { game, canvas } = makeGame();
    const seen = [];
    game.input.on('scroll', (event) => seen.push(event));

    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true,
      clientX: 100, clientY: 100, deltaY: 3, deltaMode: 1
    }));
    game.input.beginFrame(performance.now());

    expect(seen[0].scroll.y).toBe(48);
  });

  it('tracks held keys from real keyboard events', () => {
    const { game, canvas } = makeGame();

    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyW', key: 'w', bubbles: true, cancelable: true
    }));
    expect(game.input.isDown('KeyW')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'KeyW', key: 'w', bubbles: true, cancelable: true
    }));
    expect(game.input.isDown('KeyW')).toBe(false);
  });

  it('stops the browser scrolling the page with the space bar', () => {
    const { canvas } = makeGame();

    const event = new KeyboardEvent('keydown', {
      code: 'Space', key: ' ', bubbles: true, cancelable: true
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  describe('browser defaults on keys the engine uses', () => {
    function press(canvas, code, options = {}) {
      const event = new KeyboardEvent('keydown', {
        code, key: code, bubbles: true, cancelable: true, ...options
      });
      canvas.dispatchEvent(event);
      return event;
    }

    function release(canvas, code) {
      canvas.dispatchEvent(new KeyboardEvent('keyup', {
        code, key: code, bubbles: true, cancelable: true
      }));
    }

    it('suppresses F3, which would otherwise open the find bar', () => {
      // The engine binds F3 to the frame-rate readout. It is not in the
      // polled-key list and must not need to be: it is suppressed because
      // the readout's subscriber consumed it.
      const { game, canvas } = makeGame();
      expect(game.stats).toBeTruthy();

      const event = press(canvas, 'F3');

      expect(event.defaultPrevented).toBe(true);
      expect(game.stats.expanded).toBe(true);
    });

    it('leaves F3 to the browser when the engine is not using it', () => {
      // No readout, no binding, no reason to take the key away.
      const { canvas } = makeGame({ performanceStats: false });

      const event = press(canvas, 'F3');

      expect(event.defaultPrevented).toBe(false);
    });

    it('keeps suppressing it while the key auto-repeats', () => {
      // A consumed press is never recorded as held, so a repeat looks like
      // a fresh event to the listener and has to be remembered.
      const { canvas } = makeGame();
      press(canvas, 'F3');

      const repeat = press(canvas, 'F3', { repeat: true });

      expect(repeat.defaultPrevented).toBe(true);
    });

    it('stops claiming it once released', () => {
      const { game, canvas } = makeGame({ performanceStats: false });
      // Claim the key for as long as a screen wants it, then let it go.
      const off = game.input.on('keydown', (event) => {
        if (event.code === 'F7') event.consume();
      }, { band: 'overlay' });

      expect(press(canvas, 'F7').defaultPrevented).toBe(true);
      release(canvas, 'F7');
      off();

      expect(press(canvas, 'F7').defaultPrevented).toBe(false);
    });

    it('suppresses the settings hotkey', () => {
      const { game, canvas } = makeGame();
      const menu = new SettingsMenu(game);

      const event = press(canvas, 'KeyO');

      expect(event.defaultPrevented).toBe(true);
      expect(menu.isShowing).toBe(true);
    });

    it('leaves a key the engine ignores alone', () => {
      const { canvas } = makeGame({ performanceStats: false });
      expect(press(canvas, 'F7').defaultPrevented).toBe(false);
    });

    it('never takes a key from a browser shortcut', () => {
      // Ctrl+F3 is the player reaching past the game. Even though a
      // subscriber consumes the code, a held modifier cancels suppression.
      const { canvas } = makeGame();

      const event = press(canvas, 'F3', { ctrlKey: true });

      expect(event.defaultPrevented).toBe(false);
    });

    it('does not record a consumed key as held', () => {
      // Otherwise the game would see F3 down for as long as it is pressed.
      const { game, canvas } = makeGame();
      press(canvas, 'F3');
      expect(game.input.isDown('F3')).toBe(false);
    });
  });

  it('requests pointer lock from inside the press, where it can be granted', () => {
    // Whether Chromium grants it depends on a trusted gesture this test
    // cannot produce; what has to be true of the engine is that the request
    // is made synchronously from the press handler, not deferred to a frame
    // where the user activation has expired.
    const canvas = mountCanvas();
    canvases.push(canvas);
    let requestedDuringDispatch = null;
    canvas.requestPointerLock = () => {
      requestedDuringDispatch = dispatching;
      return Promise.reject(new Error('no user gesture in a synthetic event'));
    };

    const game = new M2D(canvas, { width: 640, height: 360, renderer: 'canvas', pointerLock: true });
    games.push(game);

    let dispatching = true;
    dispatch(canvas, 'pointerdown', { clientX: 100, clientY: 100 });
    dispatching = false;

    expect(requestedDuringDispatch).toBe(true);
  });

  it('does not request pointer lock by default', () => {
    const { game, canvas } = makeGame();
    let requested = false;
    canvas.requestPointerLock = () => { requested = true; };

    dispatch(canvas, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(requested).toBe(false);
    expect(game.input.pointerLocked).toBe(false);
  });

  it('delivers clicks at the virtual cursor without requesting capture while locked', () => {
    const { game, canvas } = makeGame();
    const seen = [];
    game.input.on('click', (event) => seen.push(event));
    const capture = vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('Pointer lock is active', 'InvalidStateError');
    });
    const lock = vi.spyOn(document, 'pointerLockElement', 'get').mockReturnValue(canvas);
    try {
      document.dispatchEvent(new Event('pointerlockchange'));
      game.input.cursor.setUI(200, 150);
      dispatch(canvas, 'pointerdown', { clientX: 10, clientY: 10 });
      dispatch(canvas, 'pointerup', { clientX: 10, clientY: 10 });

      expect(capture).not.toHaveBeenCalled();
      expect(seen).toHaveLength(1);
      expect(seen[0].ui).toEqual({ x: 200, y: 150 });
    } finally {
      lock.mockRestore();
      capture.mockRestore();
    }
  });

  it('still delivers a click if pointer capture fails', () => {
    const { game, canvas } = makeGame();
    const seen = [];
    game.input.on('click', (event) => seen.push(event));
    const capture = vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('Pointer is no longer active', 'NotFoundError');
    });
    try {
      dispatch(canvas, 'pointerdown', { clientX: 100, clientY: 100 });
      dispatch(canvas, 'pointerup', { clientX: 100, clientY: 100 });
      expect(seen).toHaveLength(1);
    } finally {
      capture.mockRestore();
    }
  });

  it('leaves no listener behind after destroy', () => {
    const { game, canvas } = makeGame();
    let fired = false;
    game.input.on('pointerdown', () => { fired = true; });

    game.destroy();
    games.length = 0;

    dispatch(canvas, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(fired).toBe(false);
  });
});
