import { CanvasRenderer } from '../src/core/renderers/canvasRenderer.js';
import { describeRendererConformance } from './conformance/rendererConformance.js';
import { createCanvasElement, readCanvas2DPixels } from './helpers/environment.js';

/**
 * Runs the full backend contract against the Canvas 2D renderer.
 *
 * A WebGL backend gets validated by adding a sibling file with the same shape:
 * swap createRenderer, and supply a readPixels built on gl.readPixels.
 */
describeRendererConformance({
  name: 'CanvasRenderer',
  createRenderer: () => new CanvasRenderer(),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readCanvas2DPixels,
  capabilities: {
    gradients: true,
    shadows: true,
    text: true,
    roundedCorners: true,
    clipping: true,
    transforms: true
  }
});
