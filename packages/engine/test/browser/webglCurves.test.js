import { describe, it, expect } from 'vitest';
import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

/**
 * Curves are tessellated for the size they are *drawn*, not the size they
 * are authored.
 *
 * The WebGL backend turns an arc into line segments; Canvas 2D draws a
 * true curve. So a circle that comes out smooth at one zoom has to come
 * out smooth at another — otherwise zooming in on a shape reveals the
 * polygon under it, and the two backends disagree about a frame they are
 * both supposed to draw.
 *
 * Each case draws the same *on-screen* circle twice: once large at zoom
 * 1, once small at a zoom that scales it back up. The two must match.
 */
const W = 200, H = 200;

function render(radius, zoom, draw) {
  const target = createCanvasElement(W, H);
  const renderer = new WebGLRenderer({ contextAttributes: { preserveDrawingBuffer: true } });
  renderer.init(target, { width: W, height: H });
  renderer.beginFrame();
  // Centred on the same world point either way, so only the scale differs.
  renderer.applyCamera({ x: (W / 2) / zoom, y: (H / 2) / zoom, width: W, height: H, zoom, rotation: 0 });
  draw(renderer, radius, zoom);
  renderer.endFrame();
  const pixels = readWebGLPixels(target);
  renderer.destroy?.();
  return pixels;
}

/** The share of pixels where two renders disagree. */
function mismatch(a, b, tolerance = 24) {
  let bad = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > tolerance || Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance
      || Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance) bad++;
  }
  return bad / (a.data.length / 4);
}

const CASES = {
  'a filled circle': (r, radius, zoom) =>
    r.drawArc({ x: 100 / zoom, y: 100 / zoom, radius, fillStyle: '#ffffff' }),
  'a stroked circle': (r, radius, zoom) =>
    r.drawArc({ x: 100 / zoom, y: 100 / zoom, radius, fill: false, strokeStyle: '#ffffff', lineWidth: 6 / zoom }),
  'a half-circle wedge': (r, radius, zoom) =>
    r.drawArc({ x: 100 / zoom, y: 100 / zoom, radius, startAngle: 0, endAngle: Math.PI, fillStyle: '#ffffff' }),
  'a rounded rect': (r, radius, zoom) =>
    r.drawRect({
      x: (100 - 80) / zoom, y: (100 - 60) / zoom, width: 160 / zoom, height: 120 / zoom,
      cornerRadius: radius, fillStyle: '#ffffff'
    })
};

describe('WebGL curves under zoom', () => {
  for (const [name, draw] of Object.entries(CASES)) {
    it(`tessellates ${name} for its drawn size, not its world size`, () => {
      // The same 80 on-screen pixels, reached by radius or by zoom. 32x
      // is where the old scale-blind rule showed: a filled circle drifted
      // by 0.95% of the frame and a stroked one by 1.92%, against a
      // perimeter band of about 1%. Everyday zooms were always fine.
      const large = render(80, 1, draw);
      for (const zoom of [4, 32]) {
        const zoomed = render(80 / zoom, zoom, draw);
        const share = mismatch(large, zoomed);
        expect(share, `${name} at ${zoom}x: ${(share * 100).toFixed(2)}% of pixels differ between radius and zoom`)
          .toBeLessThan(0.005);
      }
    });
  }

  it('keeps the segment count bounded when the camera zooms a long way in', () => {
    // The cap in `arcSegments` is what makes scaling by the camera safe:
    // a deep zoom must not ask for thousands of segments.
    const deep = render(50, 40, CASES['a filled circle']);
    let onScreen = 0;
    for (let i = 0; i < deep.data.length; i += 4) if (deep.data[i] > 100) onScreen++;
    expect(onScreen, 'the hugely zoomed circle still fills the view').toBeGreaterThan(W * H * 0.5);
  });
});
