import { expect } from 'vitest';
import { createPhysicsWorld } from '../../src/core/physics/index.js';
import { RecordingRenderer } from './recordingRenderer.js';
import { UIRenderer } from '../../src/core/renderers/uiRenderer.js';
import { WorldOverlay } from '../../src/core/ui/worldOverlay.js';
import { Camera } from '../../src/core/camera.js';
import { viewToUI } from '../../src/core/viewport.js';

/**
 * A minimal stand-in for the M2D instance that entities, constraints and UI
 * elements need, backed by a RecordingRenderer so tests can assert on the
 * abstract draw calls that engine code emits.
 */
export function makeTestGame(options = {}) {
  const renderer = new RecordingRenderer();

  const game = {
    renderer,
    uiRenderer: new UIRenderer(renderer),
    physics: createPhysicsWorld(),
    entities: new Set(),
    player: null,
    canvas: { width: 800, height: 600, style: {} },
    soundManager: { playSound() {}, stopMusic() {} },
    sceneManager: { switchTo() {} },
    overlays: new Set(),
    // Camera centred on the view, so world (0..800, 0..600) is on screen and
    // worldToUI is the identity under the recording renderer's 800x600
    // identity viewport — assertions can reason in plain world numbers.
    camera: new Camera(800, 600),
    options: { width: 800, height: 600, worldWidth: 1600, worldHeight: 1200, ...options },
    get viewport() {
      return renderer.viewport;
    },
    worldToUI(x, y) {
      const view = this.camera.worldToScreen(x, y);
      return viewToUI({ x: view.x, y: view.y, viewport: this.viewport });
    }
  };
  game.camera.x = 400;
  game.camera.y = 300;
  game.worldOverlay = new WorldOverlay(game);
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
