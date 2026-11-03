import { expect } from 'vitest';
import { createPhysicsWorld } from '../../src/core/physics/index.js';
import { RecordingRenderer } from './recordingRenderer.js';
import { UIRenderer } from '../../src/core/renderers/uiRenderer.js';
import { WorldOverlay } from '../../src/core/ui/worldOverlay.js';
import { Camera } from '../../src/core/camera.js';
import { InputManager } from '../../src/core/input/index.js';
import { viewToUI } from '../../src/core/viewport.js';
import { createTheme } from '../../src/core/ui/theme.js';
import { ScreenStack } from '../../src/core/ui/screenStack.js';
import { MotionManager } from '../../src/core/ui/motion.js';
import { CVarRegistry } from '../../src/core/console/cvars.js';
import { CommandRegistry } from '../../src/core/console/commands.js';
import { Time } from '../../src/core/time.js';
import { Rng } from '../../src/core/rng.js';

/**
 * A minimal stand-in for the M2D instance that entities, constraints and UI
 * elements need, backed by a RecordingRenderer so tests can assert on the
 * abstract draw calls that engine code emits.
 */
export function makeTestGame(options = {}) {
  const renderer = new RecordingRenderer();
  const { theme: themeOverrides, ...engineOptions } = options;

  const game = {
    renderer,
    uiRenderer: new UIRenderer(renderer),
    // The real theme, so assertions see the colours components actually
    // resolve rather than a stand-in that could drift from the defaults.
    theme: createTheme(themeOverrides),
    // The real clock, shared with physics as in the engine, so a test can
    // advance game time by hand with `game.time.tick(dt)`.
    time: new Time({ maxDelta: Infinity, maxSubSteps: Infinity }),
    rng: new Rng(1),
    physics: null,
    entities: new Set(),
    player: null,
    // No event target and no bounding rect: the input system attaches
    // nothing here and tests drive it through `game.input.push` instead
    // (see helpers/input.js).
    canvas: {
      width: 800,
      height: 600,
      style: {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 })
    },
    soundManager: { playSound() {}, stopMusic() {} },
    paused: false,
    sceneManager: { switchTo() {} },
    // Camera centred on the view, so world (0..800, 0..600) is on screen and
    // worldToUI is the identity under the recording renderer's 800x600
    // identity viewport — assertions can reason in plain world numbers.
    camera: new Camera(800, 600),
    options: { width: 800, height: 600, worldWidth: 1600, worldHeight: 1200, ...engineOptions },
    get viewport() {
      return renderer.viewport;
    },
    worldToUI(x, y) {
      const view = this.camera.worldToScreen(x, y);
      return viewToUI({ x: view.x, y: view.y, viewport: this.viewport });
    }
  };
  game.physics = createPhysicsWorld({ clock: game.time });
  game.camera.x = 400;
  game.camera.y = 300;
  // The real motion driver and UI band. The router asks the latter before
  // the scene's UI, so tests that route input need a real one.
  game.motion = new MotionManager(game);
  game.ui = new ScreenStack(game);
  // Real registries with persistence off; tests register what they need.
  game.cvars = new CVarRegistry({ storage: null });
  game.commands = new CommandRegistry(game.cvars);
  game.worldOverlay = new WorldOverlay(game);
  // The real input system, minus a DOM to listen to. Pointer lock stays off:
  // on, it would switch the virtual cursor on and make every
  // synthesized position relative.
  game.input = new InputManager(game, { pointerLock: false });
  return game;
}

/**
 * A physics body positioned and sized for entity tests. Belongs to `game`'s
 * world but is not added to it — tests that need simulation call
 * `game.physics.add(body)`.
 */
export function makeBody(game, x, y, width, height, bodyOptions = {}) {
  return game.physics.createBox({ x, y, width, height, ...bodyOptions });
}

/**
 * Assert that pushTransform/popTransform and pushClip/popClip calls are
 * balanced and never pop below zero. Unbalanced stacks leak transform state
 * into unrelated entities, which is invisible until something far away
 * renders in the wrong place.
 */
export function expectBalancedStacks(renderer) {
  for (const [push, pop] of [['pushTransform', 'popTransform'], ['pushClip', 'popClip']]) {
    let depth = 0;
    for (const method of renderer.sequence()) {
      if (method === push) depth++;
      if (method === pop) depth--;
      expect(depth, `${pop} called more often than ${push}`).toBeGreaterThanOrEqual(0);
    }
    expect(depth, `${push} left ${depth} unbalanced entries`).toBe(0);
  }
}
