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

/**
 * A converted light block placed in the world: its `offset` turned by
 * `yaw` about the up axis and scaled, added to `position`.
 *
 * Both things that carry a light use this — an entity, whose light
 * follows its body, and a prop, placed many times from one prefab — so
 * the two cannot drift apart. An entity passes no yaw or scale: its
 * offset is in the world's frame, as it has always been.
 *
 * `light` must be a `lightFor` result, not a raw scene block; a CSS
 * colour string reaching the frame packs as NaN, and
 * `Frame3D.addLight` refuses it.
 *
 * @param {object} light - From `lightFor`
 * @param {{x: number, y: number, z: number}} position
 * @param {number} [yaw=0] - Radians about the up axis
 * @param {number} [scale=1] - Multiplier on the offset's reach
 */
export function placeLight(light, position, yaw = 0, scale = 1) {
  const o = light.offset ?? ZERO;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    ...light,
    position: {
      x: position.x + (o.x * cos + o.z * sin) * scale,
      y: position.y + o.y * scale,
      z: position.z + (o.z * cos - o.x * sin) * scale
    }
  };
}

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

export const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** The emissive an instance record carries: none when the material's own colour glows instead. */
export const instanceEmissive = (mesh) => (mesh?.emissiveColor ? 0 : mesh?.emissive);
