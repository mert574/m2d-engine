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
 * Nothing is culled here. Every instance record carries its world
 * bounding sphere and whether it casts a shadow, and the renderer tests
 * them on the GPU against every pass's frustum — the camera's and each
 * shadow map's — in one compute pass, then draws each group through
 * indirect arguments the cull wrote. `setCamera` still matters: it is the
 * camera the renderer culls and draws with.
 *
 * Two kinds of instance. `add` takes one that changes every frame — an
 * entity following its body. `addBatch` takes a `StaticBatch`: records a
 * scene built once at load for things that never move (a level's props),
 * which the renderer keeps resident on the GPU and copies into the frame
 * without the CPU touching a record again.
 *
 * Levels of detail are groups with a `lod` range: the coverage (the
 * fraction of the view's height the instance's sphere spans) at which the
 * cull draws the group's instances. A model with three levels is three
 * groups holding the same instances with ranges that tile 0..infinity,
 * and the cull picks one per instance per frame.
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
    /** The sun: the direction its light travels, its colour and intensity. */
    this.sun = { direction: [0.4, -1, 0.3], color: [1, 0.96, 0.9], intensity: 3 };
    /** Hemisphere ambient: light from the sky above and the ground below. */
    this.ambient = { sky: [0.35, 0.45, 0.6], ground: [0.12, 0.1, 0.08], intensity: 1 };
    /** Distance fog toward `color`; `density` 0 turns it off. */
    this.fog = { color: [0.55, 0.65, 0.8], density: 0.012 };
    /** Exposure applied before tonemapping. */
    this.exposure = 1;
    /**
     * Bloom: a share `intensity` of the light scatters into a wide glow;
     * `threshold` (after exposure) keeps only what is brighter, or 0 lets
     * everything scatter a little, as a lens does. `intensity` 0 skips it.
     */
    this.bloom = { threshold: 0, intensity: 0.05 };
    /**
     * Shadows. The sun's cascades cover the view out to `distance` metres;
     * `normalOffset` is how far, in shadow texels, a surface is pushed along
     * its normal before the lookup, the trade between acne and peter-panning;
     * `bias` is the depth tolerance in metres. `enabled: false` turns every
     * shadow off.
     */
    this.shadow = { distance: 60, normalOffset: 1.5, bias: 0.03, enabled: true };
    /**
     * Post-processing, as the scene wants it. The player's `r_*` settings
     * decide which stages run at all; these are the strengths. `dof` is a
     * thin lens: `focus` distance in metres (null leaves it off), a
     * `focalLength` in millimetres and an `fStop`, on a 24 mm sensor, with
     * `maxBlur` capping the circle in pixels; `autoExposure.enabled` false
     * keeps the scene's `exposure` as is; `lut` is a 256x16 grading strip.
     */
    this.post = {
      taa: { blend: 0.1 },
      ao: { radius: 0.8, intensity: 1 },
      dof: { focus: null, focalLength: 50, fStop: 2.8, maxBlur: 16 },
      motionBlur: { strength: 0.5 },
      autoExposure: { enabled: false, key: 0.18, min: 0.25, max: 4, speed: 1.5 },
      grade: { saturation: 1, contrast: 1, temperature: 0, lut: null },
      vignette: 0,
      grain: 0
    };
    /**
     * An HDR environment panorama to use as the sky instead of the
     * procedural one: `{ image, intensity }`, where `image` is what
     * `hdr.js` decoded. It lights the scene through the same prefilter
     * and irradiance bakes, and the camera sees the same panorama, so
     * a reflection and the background agree. Null for the built-in sky.
     * @type {{image: object, intensity?: number}|null}
     */
    this.environment = null;
    /** Joint matrix arrays of the skinned instances this frame, in order; the renderer packs them. @type {Float32Array[]} */
    this.skins = [];
    this.jointCount = 0;
    /** Point and spot lights, as packed records; see `addLight`. @type {Float32Array[]} */
    this.lights = [];
    /** The same lights as given, for the renderer to pick shadow casters from. */
    this.lightInfo = [];
    /** @type {Map<object, Map<object|null, Group>>} geometry -> material -> group */
    this.groups = new Map();
    /** Instances submitted this frame, per-frame and resident alike. */
    this.added = 0;
  }

  /** Take the camera's matrices, eye and lens from a `Camera3D`. */
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
   * @param {Float32Array} [instance.previousModel] - Last frame's model matrix, for motion vectors; this one if omitted
   * @param {Float32Array} [instance.skin] - Joint matrices (16 floats each, model space) for a skinned geometry
   * @param {Float32Array} [instance.previousSkin] - Last frame's joint matrices, so limbs carry their own motion; `skin` stands in without it
   * @param {[number, number]} [instance.lod] - The coverage range this geometry is drawn within; everything if omitted
   * @returns {Float32Array} The model matrix used, to hand back as next frame's `previousModel`
   */
  add(geometry, instance = {}) {
    const data = new Float32Array(INSTANCE_FLOATS);
    const model = writeInstance(data, 0, geometry, instance);
    this.added++;
    if (instance.skin && geometry.skinned) {
      data[52] = this.jointCount;
      data[53] = 1;
      this.skins.push(instance.skin);
      this.jointCount += instance.skin.length / 16;
      // Last frame's pose goes in beside this one, and the instance
      // keeps where it starts, so the vertex shader can place a vertex
      // where its own limb was rather than only where the body was.
      // Without one, the current pose stands in and the limb reports
      // no motion of its own — which is what it did before.
      data[54] = this.jointCount;
      this.skins.push(instance.previousSkin ?? instance.skin);
      this.jointCount += instance.skin.length / 16;
    }
    this.#entry(geometry, instance.material ?? null, instance.lod).instances.push(data);
    return model;
  }

  /**
   * Draw a resident batch of instances this frame. The batch was built
   * once (`StaticBatch`); the renderer keeps its records on the GPU.
   * @param {StaticBatch} batch
   */
  addBatch(batch) {
    if (!batch.count) return;
    this.added += batch.count;
    this.#entry(batch.geometry, batch.material, batch.lod).batches.push(batch);
  }

  #entry(geometry, material, lod) {
    let group = this.groups.get(geometry);
    if (!group) this.groups.set(geometry, group = new Map());
    let entry = group.get(material);
    if (!entry) group.set(material, entry = { geometry, material, lod: lod ?? ALL_COVERAGE, instances: [], batches: [] });
    return entry;
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

  /** Every group with something to draw, in insertion order. */
  *entries() {
    for (const byMaterial of this.groups.values()) yield* byMaterial.values();
  }
}

/**
 * Instances of one geometry and material that never move, as records the
 * renderer uploads once. A scene builds these at load for its props;
 * `push` one instance at a time, then hand the batch to every frame with
 * `Frame3D.addBatch`. Records are the same shape `Frame3D.add` writes, so
 * the GPU does not know which kind it is drawing.
 */
export class StaticBatch {
  /**
   * @param {object} geometry
   * @param {object|null} material
   * @param {number} [capacity=64] - Grows as needed
   * @param {[number, number]} [lod] - The coverage range the batch is drawn within
   */
  constructor(geometry, material = null, capacity = 64, lod = null) {
    this.geometry = geometry;
    this.material = material;
    this.lod = lod ?? ALL_COVERAGE;
    this.data = new Float32Array(capacity * INSTANCE_FLOATS);
    this.count = 0;
    /** Bumped by `push`; the renderer re-uploads a batch whose version it has not seen. */
    this.version = 0;
  }

  /** One more instance; the same options as `Frame3D.add` minus `skin` and `previousModel`. */
  push(instance) {
    if ((this.count + 1) * INSTANCE_FLOATS > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    writeInstance(this.data, this.count * INSTANCE_FLOATS, this.geometry, instance);
    this.count++;
    this.version++;
  }

  /** The records in use, for upload. */
  get records() {
    return this.data.subarray(0, this.count * INSTANCE_FLOATS);
  }
}

/**
 * Write one instance record at `offset` in `data`, from the options
 * `Frame3D.add` documents, and return the model matrix used.
 */
export function writeInstance(data, offset, geometry, instance) {
  let model = instance.model;
  if (!model) {
    const s = instance.scale ?? 1;
    const scale = typeof s === 'number' ? { x: s, y: s, z: s } : s;
    model = mat4.fromTRS(instance.position ?? ZERO, instance.rotation ?? IDENTITY_Q, scale);
  }
  data.set(model, offset);
  mat4.normalMatrix(model, data.subarray(offset + 16, offset + 28));
  const color = instance.color ?? GREY;
  data[offset + 28] = color[0]; data[offset + 29] = color[1]; data[offset + 30] = color[2]; data[offset + 31] = 1;
  data[offset + 32] = instance.metallic ?? 0;
  data[offset + 33] = instance.roughness ?? 0.6;
  data[offset + 34] = instance.emissive ?? 0;
  data[offset + 35] = instance.checker ?? 0;
  data.set(instance.previousModel ?? model, offset + 36);
  // skin: x first joint, y skinned, z first joint of last frame's pose,
  // w casts a shadow.
  // A BLEND surface does not: the shadow pass has no blending, so glass
  // would cast the opaque shadow of its whole pane. A MASK surface still
  // casts, cut out at its cutoff — that is what foliage wants.
  data[offset + 52] = 0; data[offset + 53] = 0; data[offset + 54] = 0;
  const blended = instance.material?.alphaMode === 'blend';
  data[offset + 55] = (instance.castShadow === false || blended) ? 0 : 1;

  // The geometry's bounding sphere carried through the model matrix.
  // A skinned mesh moves well outside its bind pose; give the sphere room.
  const sphere = boundingSphere(geometry);
  const slack = geometry.skinned ? 1.5 : 1;
  data[offset + 56] = model[0] * sphere.x + model[4] * sphere.y + model[8] * sphere.z + model[12];
  data[offset + 57] = model[1] * sphere.x + model[5] * sphere.y + model[9] * sphere.z + model[13];
  data[offset + 58] = model[2] * sphere.x + model[6] * sphere.y + model[10] * sphere.z + model[14];
  const maxScale = Math.sqrt(Math.max(
    model[0] * model[0] + model[1] * model[1] + model[2] * model[2],
    model[4] * model[4] + model[5] * model[5] + model[6] * model[6],
    model[8] * model[8] + model[9] * model[9] + model[10] * model[10]));
  data[offset + 59] = sphere.radius * maxScale * slack;
  return model;
}

/**
 * @typedef {{geometry: object, material: object|null, lod: number[], instances: Float32Array[], batches: StaticBatch[]}} Group
 */

/** The coverage range of a group drawn at every distance. */
export const ALL_COVERAGE = Object.freeze([0, Infinity]);

/**
 * Floats per instance in the GPU buffer: mat4 model, mat3 normal (padded),
 * colour, params, mat4 previous model, skin (first joint, skinned, unused,
 * casts shadow), bounds (world sphere centre and radius).
 */
export const INSTANCE_FLOATS = 16 + 12 + 4 + 4 + 16 + 4 + 4;

/** Floats per light in the GPU buffer: position+range, colour+intensity, direction+type, cone+shadow. */
export const LIGHT_FLOATS = 16;

/**
 * Lights a frame may hold; beyond it, `addLight` drops the rest.
 *
 * A fragment shades with its own cluster's lights, never the whole set
 * (see `LIGHT_CLUSTER_SHADER`), so this bounds the clustering pass and
 * the buffer rather than the cost of a pixel — which is why it is 1024
 * and not the 256 a per-fragment loop over every light could afford.
 * What a pixel pays is `CLUSTER_CAPACITY`.
 */
export const MAX_LIGHTS = 1024;

const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const GREY = [0.8, 0.8, 0.8];
const WHITE = [1, 1, 1];
const DOWN = { x: 0, y: -1, z: 0 };
