import { parseColor } from './renderers/geometry/color.js';

/**
 * A prefab's `mesh` and `light` blocks as the 3D renderer wants them:
 * colours parsed from CSS and taken from sRGB to linear light, the rest
 * as given. Parsed once per block and shared, so a thousand crates from
 * one prefab share one converted mesh.
 */
const meshCache = new WeakMap();
export function meshFor(mesh) {
  if (!mesh) return DEFAULT_MESH;
  let made = meshCache.get(mesh);
  if (made) return made;
  const [r, g, b] = mesh.color ? parseColor(mesh.color) : [0.8, 0.8, 0.8];
  made = {
    ...mesh,
    color: [toLinear(r), toLinear(g), toLinear(b)]
  };
  meshCache.set(mesh, made);
  return made;
}
export const DEFAULT_MESH = Object.freeze({ color: [0.55, 0.55, 0.55], roughness: 0.7 });

const lightCache = new WeakMap();
export function lightFor(light) {
  let made = lightCache.get(light);
  if (made) return made;
  const [r, g, b] = light.color ? parseColor(light.color) : [1, 1, 1];
  made = { ...light, color: [toLinear(r), toLinear(g), toLinear(b)] };
  lightCache.set(light, made);
  return made;
}

export const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
