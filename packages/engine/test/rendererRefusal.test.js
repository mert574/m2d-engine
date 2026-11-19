import { describe, it, expect, beforeAll } from 'vitest';
import { createCanvasElement, stubDocumentListeners } from './helpers/environment.js';
import { M2D } from '../src/core/m2d.js';

/**
 * A browser without WebGL2 gets no game. @napi-rs/canvas has no WebGL2, so
 * in this project the default backend cannot initialise, which is exactly
 * that browser.
 */

/** A canvas in a page: the engine replaces it through its owner document. */
function canvasInPage() {
  const canvas = createCanvasElement(64, 48);
  const page = { replaced: null, created: [] };
  canvas.ownerDocument = {
    createElement(tag) {
      const element = { tag, className: '', textContent: '' };
      page.created.push(element);
      return element;
    }
  };
  canvas.replaceWith = (element) => { page.replaced = element; };
  return { canvas, page };
}

describe('M2D without WebGL2', () => {
  beforeAll(stubDocumentListeners);

  it('refuses to start and puts a line of text where the canvas was', () => {
    const { canvas, page } = canvasInPage();
    expect(() => new M2D(canvas, { width: 64, height: 48 })).toThrowError(/WebGL2 is not available/);
    expect(page.replaced).toBe(page.created[0]);
    expect(page.replaced.tag).toBe('p');
    expect(page.replaced.className).toBe('m2d-unsupported');
    expect(page.replaced.textContent).toBe('This game needs a modern browser with WebGL 2.');
  });

  it('says what the game asked it to say', () => {
    const { canvas, page } = canvasInPage();
    expect(() => new M2D(canvas, { width: 64, height: 48, unsupportedText: 'Nope.' })).toThrow();
    expect(page.replaced.textContent).toBe('Nope.');
  });

  it('leaves the page alone when told to, and only throws', () => {
    const { canvas, page } = canvasInPage();
    expect(() => new M2D(canvas, { width: 64, height: 48, unsupportedText: false })).toThrowError(/WebGL2 is not available/);
    expect(page.replaced).toBeNull();
    expect(page.created).toHaveLength(0);
  });

  it('only throws for a canvas outside any document', () => {
    expect(() => new M2D(createCanvasElement(64, 48), { width: 64, height: 48 })).toThrowError(/WebGL2 is not available/);
  });

  it('throws for a backend named explicitly, the same way', () => {
    const { canvas, page } = canvasInPage();
    expect(() => new M2D(canvas, { width: 64, height: 48, renderer: 'webgl' })).toThrowError(/WebGL2 is not available/);
    expect(page.replaced).not.toBeNull();
  });
});
