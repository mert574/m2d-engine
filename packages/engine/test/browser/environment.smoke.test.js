import { describe, it, expect } from 'vitest';
import {
  createCanvasElement,
  readCanvas2DPixels,
  readWebGLPixels,
  hasDOM
} from '../helpers/environment.js';
import { makeTileSheet, TILE, TILE_COLORS } from '../helpers/fixtures.js';
import { snapshot, expectColorAt } from '../helpers/pixels.js';

/**
 * Fail-fast checks for the browser test environment.
 *
 * If WebGL2 is unavailable in the runner (missing Chromium flags, broken
 * SwiftShader, ...), this file fails with one clear message instead of the
 * whole conformance suite failing in confusing ways.
 */
describe('browser environment', () => {
  it('is running in a real DOM', () => {
    expect(hasDOM).toBe(true);
    expect(typeof HTMLCanvasElement).toBe('function');
  });

  it('exposes a WebGL2 context on a fresh canvas', () => {
    const canvas = createCanvasElement(8, 8);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    expect(gl, 'WebGL2 unavailable: check launch args in vitest.browser.config.js').not.toBeNull();
    expect(gl.getParameter(gl.VERSION)).toMatch(/WebGL 2/);
  });

  it('reads WebGL pixels back with a top-left origin', () => {
    const W = 20, H = 10;
    const canvas = createCanvasElement(W, H);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });

    gl.clearColor(0, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // GL scissor coordinates are bottom-up: this rect is the TOP-left 4x4
    // block in image coordinates.
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, H - 4, 4, 4);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);

    const snap = snapshot({ readPixels: readWebGLPixels }, canvas);
    expect(snap.width).toBe(W);
    expect(snap.height).toBe(H);
    expectColorAt(snap, 1, 1, '#ff0000', { label: 'top-left after row flip' });
    expectColorAt(snap, 1, H - 2, '#0000ff', { label: 'bottom-left stays background' });
    expectColorAt(snap, W - 2, 1, '#0000ff', { label: 'top-right stays background' });
  });

  it('readWebGLPixels rejects a canvas without a WebGL2 context', () => {
    const canvas = createCanvasElement(4, 4);
    canvas.getContext('2d');
    expect(() => readWebGLPixels(canvas)).toThrowError(/no WebGL2 context/);
  });

  it('rasterizes the shared fixtures through the browser 2D canvas', () => {
    const sheet = makeTileSheet();
    const snap = snapshot({ readPixels: readCanvas2DPixels }, sheet);
    expectColorAt(snap, TILE / 2, TILE / 2, TILE_COLORS.topLeft);
    expectColorAt(snap, TILE + TILE / 2, TILE + TILE / 2, TILE_COLORS.bottomRight);
  });

  it('accepts a canvas fixture as a WebGL texture source', () => {
    const canvas = createCanvasElement(8, 8);
    const gl = canvas.getContext('webgl2');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeTileSheet());
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
