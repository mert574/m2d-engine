import * as mat4 from './geometry/mat4.js';
import { boundingSphere } from './geometry/primitives.js';

/**
 * Everything a 3D renderer draws in one frame, as plain data.
 *
 * The 2D renderers are told what to draw one call at a time. A 3D frame
 * has to be known whole before the first pixel is shaded — the shadow
 * passes draw every caster before the main pass draws anything — so the
 * scene fills one of these and hands it over. `add` groups instances by
 * geometry and material as they arrive, which is the order the GPU wants
 * them in: one instanced draw per group.
 *
 * `add` culls the main pass as it goes: an instance outside the camera's
 * frustum is not drawn. Shadow casting is decided later, in `resolveShadows`,
 * once the renderer has fitted the sun's cascades and chosen which spot
 * lights cast — both depend on the whole frame. Call `setCamera` first, or
 * nothing is culled.
 *
 * Units are the world's: metres, y up. Colours are linear 0..1.
 */
export class Frame3D {
  constructor() {
    /** The camera, from `setCamera` or hand-built. `view`, `fov`, `aspect`, `near` and `far` fit the shadow cascades. */
    this.camera = {
      viewProjection: null, inverseViewProjection: null, view: null,
      position: { x: 0, y: 0, z: 0 }, fov: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 500
    };
    /** The camera's frustum planes, for culling; null draws everything. */
    this.frustum = null;
    /** The sun: the direction its light travels, its colour and intensity. */
    this.sun = { direction: [0.4, -1, 0.3], color: [1, 0.96, 0.9], intensity: 3 };
    /** Hemisphere ambient: light from the sky above and the ground below. */
    this.ambient = { sky: [0.35, 0.45, 0.6], ground: [0.12, 0.1, 0.08], intensity: 1 };
    /** Distance fog toward `color`; `density` 0 turns it off. */
    this.fog = { color: [0.55, 0.65, 0.8], density: 0.012 };
    /** Exposure applied before tonemapping. */
    this.exposure = 1;
    /**
     * Bloom: light brighter than `threshold` (after exposure) spreads into
     * a glow added at `intensity`; `intensity` 0 skips the passes.
     */
    this.bloom = { threshold: 1, intensity: 0.12 };
    /**
     * Shadows. The sun's cascades cover the view out to `distance` metres;
     * `normalOffset` is how far, in shadow texels, a surface is pushed along
     * its normal before the lookup, the trade between acne and peter-panning;
     * `bias` is the depth tolerance in metres. `enabled: false` turns every
     * shadow off.
     */
    this.shadow = { distance: 60, normalOffset: 1.5, bias: 0.03, enabled: true };
    /** Point and spot lights, as packed records; see `addLight`. @type {Float32Array[]} */
    this.lights = [];
    /** The same lights as given, for the renderer to pick shadow casters from. */
    this.lightInfo = [];
    /** @type {Map<string, Group>} */
    this.groups = new Map();
    /** Instances added, drawn or not. */
    this.added = 0;
    /** Instances in the main pass after culling. */
    this.drawn = 0;
    /** Instances in the shadow passes after culling; set by `resolveShadows`. */
    this.casting = 0;
  }

  /** Take the camera's matrices, eye, frustum and lens from a `Camera3D`. */
  setCamera(camera) {
    const c = this.camera;
    c.viewProjection = camera.viewProjection;
    c.inverseViewProjection = camera.inverseViewProjection;
    c.view = camera.view;
    c.position = camera.position;
    c.fov = camera.fov;
    c.aspect = camera.width / camera.height;
    c.near = camera.near;
    c.far = camera.far;
    this.frustum = mat4.frustumPlanes(camera.viewProjection, this.frustum ?? new Float32Array(24));
  }

  /**
   * Draw `geometry` once, at a transform and in a material.
   * @param {object} geometry - A `primitives.js` or glTF geometry (positions, normals, uvs, indices)
   * @param {object} instance
   * @param {Float32Array} [instance.model] - A model matrix; or give the three below
   * @param {{x,y,z}} [instance.position]
   * @param {{x,y,z,w}} [instance.rotation] - A unit quaternion
   * @param {{x,y,z}|number} [instance.scale]
   * @param {object} [instance.material] - A glTF material (`gltf.js`); textures and factors. None for a plain surface
   * @param {number[]} [instance.color=[0.8,0.8,0.8]] - Linear base colour, multiplied into the material's
   * @param {number} [instance.metallic=0] - Multiplied into the material's
   * @param {number} [instance.roughness=0.6] - Multiplied into the material's
   * @param {number} [instance.emissive=0] - Self-illumination, as a multiple of the base colour
   * @param {number} [instance.checker=0] - Size in metres of a two-tone checker on the surface; 0 for none
   * @param {boolean} [instance.castShadow=true]
   */
  add(geometry, instance = {}) {
    let model = instance.model;
    if (!model) {
      const s = instance.scale ?? 1;
      const scale = typeof s === 'number' ? { x: s, y: s, z: s } : s;
      model = mat4.fromTRS(instance.position ?? ZERO, instance.rotation ?? IDENTITY_Q, scale);
    }
    this.added++;

    // The geometry's bounding sphere carried through the model matrix.
    const sphere = boundingSphere(geometry);
    const cx = model[0] * sphere.x + model[4] * sphere.y + model[8] * sphere.z + model[12];
    const cy = model[1] * sphere.x + model[5] * sphere.y + model[9] * sphere.z + model[13];
    const cz = model[2] * sphere.x + model[6] * sphere.y + model[10] * sphere.z + model[14];
    const maxScale = Math.sqrt(Math.max(
      model[0] * model[0] + model[1] * model[1] + model[2] * model[2],
      model[4] * model[4] + model[5] * model[5] + model[6] * model[6],
      model[8] * model[8] + model[9] * model[9] + model[10] * model[10]));
    const radius = sphere.radius * maxScale;
    const visible = !this.frustum || mat4.sphereInFrustum(this.frustum, cx, cy, cz, radius);
    const mayCast = this.shadow.enabled !== false && instance.castShadow !== false;
    if (!visible && !mayCast) return;

    const data = new Float32Array(INSTANCE_FLOATS);
    data.set(model, 0);
    mat4.normalMatrix(model, data.subarray(16, 28));
    const color = instance.color ?? GREY;
    data[28] = color[0]; data[29] = color[1]; data[30] = color[2]; data[31] = 1;
    data[32] = instance.metallic ?? 0;
    data[33] = instance.roughness ?? 0.6;
    data[34] = instance.emissive ?? 0;
    data[35] = instance.checker ?? 0;

    const material = instance.material ?? null;
    let group = this.groups.get(geometry);
    if (!group) this.groups.set(geometry, group = new Map());
    let entry = group.get(material);
    if (!entry) group.set(material, entry = { geometry, material, main: [], shadow: [], casters: [] });
    if (visible) { entry.main.push(data); this.drawn++; }
    if (mayCast) entry.casters.push({ data, x: cx, y: cy, z: cz, radius });
  }

  /**
   * A point or spot light.
   * @param {object} light
   * @param {'point'|'spot'} [light.type='point']
   * @param {{x,y,z}} light.position
   * @param {number[]} [light.color=[1,1,1]] - Linear
   * @param {number} [light.intensity=10] - Radiance at one metre, before falloff
   * @param {number} [light.range=10] - Metres; the light ends smoothly here
   * @param {{x,y,z}} [light.direction] - Where a spot points
   * @param {number} [light.innerCone=0.4] - Radians, full brightness inside
   * @param {number} [light.outerCone=0.6] - Radians, dark outside
   * @param {boolean} [light.shadow=true] - Whether a spot casts a shadow map (the nearest few do)
   */
  addLight(light) {
    if (this.lights.length >= MAX_LIGHTS) return;
    const data = new Float32Array(LIGHT_FLOATS);
    const p = light.position;
    data[0] = p.x; data[1] = p.y; data[2] = p.z; data[3] = light.range ?? 10;
    const c = light.color ?? WHITE;
    data[4] = c[0]; data[5] = c[1]; data[6] = c[2]; data[7] = light.intensity ?? 10;
    const spot = light.type === 'spot';
    const d = light.direction ?? DOWN;
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    data[8] = d.x / len; data[9] = d.y / len; data[10] = d.z / len; data[11] = spot ? 1 : 0;
    data[12] = Math.cos(light.innerCone ?? 0.4);
    data[13] = Math.cos(light.outerCone ?? 0.6);
    data[14] = 0; // shadow layer + 1, assigned by the renderer
    this.lights.push(data);
    this.lightInfo.push(light);
  }

  /**
   * Decide the shadow casters, once the renderer has fitted the shadow
   * volumes: an instance casts if its sphere touches the sun's reach or any
   * shadowed spot's. Called by the renderer before upload.
   * @param {Array<{x: number, y: number, z: number, radius: number}>} volumes
   */
  resolveShadows(volumes) {
    this.casting = 0;
    for (const entry of this.entries()) {
      entry.shadow.length = 0;
      if (!volumes.length) continue;
      for (const c of entry.casters) {
        for (const v of volumes) {
          const dx = c.x - v.x, dy = c.y - v.y, dz = c.z - v.z;
          const reach = v.radius + c.radius;
          if (dx * dx + dy * dy + dz * dz <= reach * reach) {
            entry.shadow.push(c.data);
            this.casting++;
            break;
          }
        }
      }
    }
  }

  /** Every group with something to draw, in insertion order. */
  *entries() {
    for (const byMaterial of this.groups.values()) yield* byMaterial.values();
  }
}

/**
 * @typedef {{geometry: object, material: object|null, main: Float32Array[], shadow: Float32Array[], casters: object[]}} Group
 */

/** Floats per instance in the GPU buffer: mat4 model, mat3 normal (padded), colour, params. */
export const INSTANCE_FLOATS = 16 + 12 + 4 + 4;

/** Floats per light in the GPU buffer: position+range, colour+intensity, direction+type, cone+shadow. */
export const LIGHT_FLOATS = 16;

/** Lights a frame may hold; beyond it, `addLight` drops the rest. Clustering (R6) lifts this. */
export const MAX_LIGHTS = 256;

const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const GREY = [0.8, 0.8, 0.8];
const WHITE = [1, 1, 1];
const DOWN = { x: 0, y: -1, z: 0 };
