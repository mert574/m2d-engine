import { CanvasRenderer } from '../../src/core/renderers/canvasRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readCanvas2DPixels } from '../helpers/environment.js';

/**
 * The Canvas backend's conformance run, repeated in a real browser.
 *
 * The headless run (test/canvasRenderer.conformance.test.js) uses node-canvas.
 * Running the same suite against Chromium's rasterizer proves the suite's
 * tolerances hold for a second rasterizer before a second *backend* is judged
 * by it: a test that fails only here is a tolerance bug, not a backend bug.
 */
describeRendererConformance({
  name: 'CanvasRenderer (browser)',
  createRenderer: () => new CanvasRenderer(),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readCanvas2DPixels,
  capabilities: {
    gradients: true,
    shadows: true,
    text: true,
    roundedCorners: true,
    clipping: true,
    transforms: true,
    // Canvas 2D has composite operations natively. It declines `tint`:
    // tinting a sprite would need an offscreen pass per draw.
    blendModes: true
  }
});
