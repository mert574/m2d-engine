import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

/** Runs the backend contract against the WebGL2 renderer. */
describeRendererConformance({
  name: 'WebGLRenderer',
  createRenderer: () => new WebGLRenderer({
    // Keep the drawing buffer around so readPixels sees the presented frame.
    contextAttributes: { preserveDrawingBuffer: true }
  }),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels
});
