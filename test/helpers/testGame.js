import Matter from 'matter-js';
import { expect } from 'vitest';
import { RecordingRenderer } from './recordingRenderer.js';
import { UIRenderer } from '../../src/core/renderers/uiRenderer.js';

/**
 * A minimal stand-in for the M2D instance that entities, constraints and UI
 * elements need, backed by a RecordingRenderer so tests can assert on the
 * abstract draw calls that engine code emits.
 */
export function makeTestGame(options = {}) {
  const renderer = new RecordingRenderer();

  return {
    renderer,
    uiRenderer: new UIRenderer(renderer),
    engine: Matter.Engine.create(),
    entities: new Set(),
    player: null,
    canvas: { width: 800, height: 600, style: {} },
    soundManager: { playSound() {}, stopMusic() {} },
    sceneManager: { switchTo() {} },
    options: { width: 800, height: 600, worldWidth: 1600, worldHeight: 1200, ...options }
  };
}

/** A Matter body positioned and sized for entity tests. */
export function makeBody(x, y, width, height, bodyOptions = {}) {
  return Matter.Bodies.rectangle(x, y, width, height, bodyOptions);
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
