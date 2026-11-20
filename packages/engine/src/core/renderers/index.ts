import { BaseRenderer } from './baseRenderer.ts';
import { WebGLRenderer } from './webglRenderer.ts';
import { WebGPURenderer } from './webgpuRenderer.ts';
import { UIRenderer } from './uiRenderer.ts';

/** A backend: a class whose instances implement the renderer contract. */
export type RendererClass = new () => BaseRenderer;

const registry = new Map<string, RendererClass>([
  ['webgl', WebGLRenderer],
  ['webgpu', WebGPURenderer]
]);

/** Backend used when none is specified, by the game's dimension. */
export const DEFAULT_RENDERER = 'webgl';
export const DEFAULT_RENDERER_3D = 'webgpu';

/**
 * Register a renderer backend under a name so it can be selected via the
 * M2D `renderer` option, e.g. registerRenderer('webgpu', WebGPURenderer).
 */
export function registerRenderer(name: string, RendererClass: RendererClass): void {
  registry.set(name, RendererClass);
}

/**
 * Resolve the M2D `renderer` option into a renderer instance (not yet
 * initialized). Accepts a registered backend name, a renderer class, or
 * an instance.
 */
export function createRenderer(renderer: string | RendererClass | BaseRenderer = DEFAULT_RENDERER): BaseRenderer {
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
export { initWebGPU, webgpuSupported } from './webgpu/device.ts';
