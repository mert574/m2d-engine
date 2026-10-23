import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

/**
 * Runs the backend contract against the WebGL2 renderer.
 *
 * Every capability is enabled: the WebGL2 backend is held to the full
 * contract, exactly like the Canvas backend.
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
