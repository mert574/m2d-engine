import { BaseRenderer } from './baseRenderer.js';
import { CanvasRenderer } from './canvasRenderer.js';
import { WebGLRenderer } from './webglRenderer.js';
import { UIRenderer } from './uiRenderer.js';

const registry = new Map([
  ['webgl', WebGLRenderer],
  ['canvas', CanvasRenderer]
]);

/** Backend used when none is specified. */
export const DEFAULT_RENDERER = 'webgl';

/** Backend used when the default cannot initialise (no WebGL2). */
export const FALLBACK_RENDERER = 'canvas';

/**
 * Register a renderer backend under a name so it can be selected via the
 * M2D `renderer` option, e.g. registerRenderer('webgpu', WebGPURenderer).
 * @param {string} name - Backend name
 * @param {typeof BaseRenderer} RendererClass - Backend class
 */
export function registerRenderer(name, RendererClass) {
  registry.set(name, RendererClass);
}

/**
 * Resolve the M2D `renderer` option into a renderer instance.
 * Accepts a registered backend name, a renderer class, or an instance.
 * @param {string|typeof BaseRenderer|BaseRenderer} renderer - Backend selector
 * @returns {BaseRenderer} Renderer instance (not yet initialized)
 */
export function createRenderer(renderer = DEFAULT_RENDERER) {
  if (typeof renderer === 'string') {
    const RendererClass = registry.get(renderer);
    if (!RendererClass) {
      throw new Error(`Unknown renderer: '${renderer}'. Registered renderers: ${[...registry.keys()].join(', ')}`);
    }
    return new RendererClass();
  }

  if (typeof renderer === 'function') {
    return new renderer();
  }

  return renderer;
}

export { BaseRenderer, CanvasRenderer, WebGLRenderer, UIRenderer };
