import { parseColor } from './renderers/geometry/color.ts';
import type { Vector3 } from './math.ts';

/** A prefab's `mesh` block as a scene writes it: a CSS colour, the rest free-form. */
export interface MeshBlock {
  color?: string;
  emissive?: number;
  emissiveColor?: string;
  roughness?: number;
  [key: string]: unknown;
}

/** A `mesh` block as the renderer wants it: linear-light colour. */
export interface Mesh3D {
  color: readonly [number, number, number];
  emissive?: number;
  emissiveColor?: string;
  roughness?: number;
  [key: string]: unknown;
}

/** A prefab's `light` block as a scene writes it. */
export interface LightBlock {
  color?: string;
  offset?: Vector3;
  [key: string]: unknown;
}

/** A `light` block as the renderer wants it: linear-light colour. */
export interface ConvertedLight {
  color: readonly [number, number, number];
  offset?: Vector3;
  [key: string]: unknown;
}

/**
 * A prefab's `mesh` and `light` blocks as the 3D renderer wants them:
 * colours parsed from CSS and taken from sRGB to linear light, the rest
 * as given. Parsed once per block and shared, so a thousand crates from
 * one prefab share one converted mesh.
 */
const meshCache = new WeakMap<MeshBlock, Mesh3D>();
export function meshFor(mesh: MeshBlock | null | undefined): Mesh3D {
  if (!mesh) return DEFAULT_MESH;
  let made = meshCache.get(mesh);
  if (made) return made;
  const [r, g, b] = mesh.color ? parseColor(mesh.color) : [0.8, 0.8, 0.8] as const;
  made = {
    ...mesh,
    color: [toLinear(r), toLinear(g), toLinear(b)]
  };
  meshCache.set(mesh, made);
  return made;
}
export const DEFAULT_MESH: Mesh3D = Object.freeze({ color: [0.55, 0.55, 0.55] as const, roughness: 0.7 });

const lightCache = new WeakMap<LightBlock, ConvertedLight>();
export function lightFor(light: LightBlock): ConvertedLight {
  let made = lightCache.get(light);
  if (made) return made;
  const [r, g, b] = light.color ? parseColor(light.color) : [1, 1, 1] as const;
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
 * @param light - From `lightFor`
 * @param yaw - Radians about the up axis
 * @param scale - Multiplier on the offset's reach
 */
export function placeLight(
  light: ConvertedLight, position: Vector3, yaw = 0, scale = 1
): ConvertedLight & { position: Vector3 } {
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

const ZERO: Vector3 = Object.freeze({ x: 0, y: 0, z: 0 });

export const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** The emissive an instance record carries: none when the material's own colour glows instead. */
export const instanceEmissive = (mesh: Mesh3D | null | undefined): number | undefined =>
  (mesh?.emissiveColor ? 0 : mesh?.emissive);
