import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

/**
 * Runs the backend contract against the WebGL2 renderer.
 *
 * Every capability is false while the backend is a scaffold; the lifecycle,
 * clearing, camera, stats, debug and hitTest groups still run. Flip a flag to
 * true as soon as its feature lands: a true flag is a promise the suite
 * enforces.
 */
describeRendererConformance({
  name: 'WebGLRenderer',
  createRenderer: () => new WebGLRenderer({
    // Keep the drawing buffer around so readPixels sees the presented frame.
    contextAttributes: { preserveDrawingBuffer: true }
  }),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels,
  capabilities: {
    gradients: true,
    shadows: true,
    text: true,
    roundedCorners: true,
    clipping: true,
    transforms: true
  }
});
