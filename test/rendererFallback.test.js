import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createCanvasElement } from './helpers/environment.js';
import { M2D } from '../src/core/m2d.js';
import { CanvasRenderer } from '../src/core/renderers/canvasRenderer.js';

/**
 * Backend selection in the engine. node-canvas has no WebGL2, so in this
 * project the default backend cannot initialise, which is exactly the
 * situation the fallback exists for.
 */
describe('M2D renderer selection', () => {
  beforeAll(() => {
    // The engine registers input/sound listeners; the headless shim only
    // provides document.createElement.
    globalThis.document.addEventListener ??= () => {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the Canvas backend when the default cannot initialise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = new M2D(createCanvasElement(64, 48), { width: 64, height: 48 });

    expect(game.renderer).toBeInstanceOf(CanvasRenderer);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/falling back to 'canvas'/));
  });

  it('throws when an explicitly requested backend cannot initialise', () => {
    expect(() => new M2D(createCanvasElement(64, 48), { width: 64, height: 48, renderer: 'webgl' }))
      .toThrowError(/WebGL2 is not available/);
  });

  it('uses an explicitly requested working backend without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = new M2D(createCanvasElement(64, 48), { width: 64, height: 48, renderer: 'canvas' });

    expect(game.renderer).toBeInstanceOf(CanvasRenderer);
    expect(warn).not.toHaveBeenCalled();
  });
});
