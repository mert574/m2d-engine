import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

/**
 * Runs the backend contract against the WebGL2 renderer.
 *
 * Every capability is enabled, mandatory and optional alike: the WebGL2
 * backend is held to the full contract plus every optional feature it claims.
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
    transforms: true,
    tint: true,
    blendModes: true,
    particles: true,
    lights: true,
    postEffects: true
  }
});
