import { BaseRenderer } from './baseRenderer.js';
import { WebGLRenderer } from './webglRenderer.js';
import { WebGPURenderer } from './webgpuRenderer.js';
import { UIRenderer } from './uiRenderer.js';

const registry = new Map([
  ['webgl', WebGLRenderer],
  ['webgpu', WebGPURenderer]
]);

/** Backend used when none is specified, by the game's dimension. */
export const DEFAULT_RENDERER = 'webgl';
export const DEFAULT_RENDERER_3D = 'webgpu';

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

export { BaseRenderer, WebGLRenderer, WebGPURenderer, UIRenderer };
export { initWebGPU, webgpuSupported } from './webgpu/device.js';
