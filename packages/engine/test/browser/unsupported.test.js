import { describe, it, expect, afterEach } from 'vitest';
import { M2D } from '../../src/core/m2d.js';

/**
 * The page a visitor without WebGL2 sees, in a real DOM: the canvas gives
 * no context, so the engine refuses to start and leaves a line of text in
 * the canvas's place.
 */
describe('a page without WebGL2', () => {
  const cleanup = [];
  afterEach(() => { for (const fn of cleanup.splice(0)) fn(); });

  function canvasWithoutWebGL2() {
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.getContext = () => null;
    host.append(canvas);
    document.body.append(host);
    cleanup.push(() => host.remove());
    return { host, canvas };
  }

  it('replaces the canvas with the notice and throws', () => {
    const { host, canvas } = canvasWithoutWebGL2();
    expect(() => new M2D(canvas, { width: 64, height: 48 })).toThrowError(/WebGL2 is not available/);

    expect(canvas.isConnected).toBe(false);
    const notice = host.querySelector('p.m2d-unsupported');
    expect(notice).not.toBeNull();
    expect(notice.textContent).toBe('This game needs a modern browser with WebGL 2.');
    expect(host.children).toHaveLength(1);
  });

  it('keeps the canvas when the game handles the page itself', () => {
    const { host, canvas } = canvasWithoutWebGL2();
    expect(() => new M2D(canvas, { width: 64, height: 48, unsupportedText: false })).toThrow();
    expect(canvas.isConnected).toBe(true);
    expect(host.querySelector('.m2d-unsupported')).toBeNull();
  });
});
