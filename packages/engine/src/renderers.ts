// The renderer contract and its backends, for a game that picks or writes
// one, and the helpers a custom draw reaches for: colour, primitive
// geometry, ground shadows and the view-to-screen mapping.
export {
  DEFAULT_RENDERER, DEFAULT_RENDERER_3D, registerRenderer, createRenderer,
  BaseRenderer, WebGLRenderer, WebGPURenderer, UIRenderer, initWebGPU, webgpuSupported
} from './core/renderers/index.ts';
export { PARTICLE_STRIDE } from './core/renderers/baseRenderer.ts';
export { parseColor, parseColorPremultiplied } from './core/renderers/geometry/color.ts';
export { box, sphere, cylinder, capsule, plane, boundingSphere, geometryFor } from './core/renderers/geometry/primitives.ts';
export { drawGroundShadow, shadowForLift } from './core/renderers/shadows.ts';
export {
  MAX_PIXEL_RATIO, computeViewport, sameResolution, identityViewport, sameViewport,
  viewToUI, uiToView, mapPointer, viewToClient
} from './core/viewport.ts';
