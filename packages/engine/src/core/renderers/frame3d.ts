import * as mat4 from './geometry/mat4.ts';
import { boundingSphere, type Geometry } from './geometry/primitives.ts';
import type { Quaternion, Vector3 } from '../math.ts';
import type { Material } from '../gltf.ts';

/**
 * A mesh the 3D renderer draws: a primitive's geometry, or one glTF
 * decoded, which carries the flags a skinned or morphed mesh needs.
 */
export interface Geometry3D extends Geometry {
  /** Whether the mesh has joints, and so reads the frame's skin matrices. */
  skinned?: boolean;
  /** Morph targets, when the mesh has them. */
  morphs?: { count: number; vertices: number; deltas: Float32Array } | null;
  /** A glTF mesh's extras; a primitive has none and the shader reads zeros/white. */
  tangents?: Float32Array | null;
  colors?: Uint8Array | null;
  joints?: Uint16Array | null;
  weights?: Float32Array | null;
}

/**
 * A glTF material (`gltf.ts`), or a hand-built one naming only what it
 * sets. The frame only reads how it blends; the renderer reads the rest.
 */
export interface Material3D extends Partial<Material> {
  /** Metres per texture tile for world-planar mapping; 0 keeps the mesh's own uvs. A scene sets it. */
  worldScale?: number;
  /** 'own' keeps planar mapping in the instance's own frame. A scene sets it. */
  planarFrame?: string;
}

/** Three linear colour channels, 0..1. */
export type Color3 = readonly [number, number, number] | readonly number[];

/** The camera a frame is drawn through. */
export interface FrameCamera {
  viewProjection: Float32Array | null;
  inverseViewProjection: Float32Array | null;
  view: Float32Array | null;
  position: Vector3;
  fov: number;
  aspect: number;
  near: number;
  far: number;
}

/** What `setCamera` reads off a `Camera3D`. */
export interface Camera3DLike {
  viewProjection: Float32Array | null;
  inverseViewProjection: Float32Array | null;
  view: Float32Array | null;
  position: Vector3;
  fov: number;
  width: number;
  height: number;
  near: number;
  far: number;
}

/** One instance of a geometry, as `Frame3D.add` and `StaticBatch.push` take it. */
export interface Instance3D {
  /** A model matrix; or give position, rotation and scale below. */
  model?: Float32Array;
  position?: Vector3;
  /** A unit quaternion. */
  rotation?: Quaternion;
  scale?: Vector3 | number;
  /** A glTF material; textures and factors. None for a plain surface. */
  material?: Material3D | null;
  /** Linear base colour, multiplied into the material's. */
  color?: Color3;
  /** Multiplied into the material's. */
  metallic?: number;
  /** Multiplied into the material's. */
  roughness?: number;
  /** Self-illumination, as a multiple of the base colour. */
  emissive?: number;
  /** Size in metres of a two-tone checker on the surface; 0 for none. */
  checker?: number;
  castShadow?: boolean;
  /** Last frame's model matrix, for motion vectors; this one if omitted. */
  previousModel?: Float32Array;
  /** Joint matrices (16 floats each, model space) for a skinned geometry. */
  skin?: Float32Array;
  /** Last frame's joint matrices; `skin` stands in without it. */
  previousSkin?: Float32Array;
  /** Morph target weights, for an unskinned mesh that has targets. */
  morphWeights?: Float32Array;
  /** Last frame's morph weights; `morphWeights` stands in without it. */
  previousMorphWeights?: Float32Array;
  /** The coverage range this geometry is drawn within; everything if omitted. */
  lod?: readonly [number, number] | readonly number[];
  /** A world bounding sphere that wins over the geometry's own. */
  sphere?: { x: number; y: number; z: number; radius: number };
}

/** A point or spot light, as `addLight` takes it. */
export interface Light3D {
  type?: 'point' | 'spot';
  position: Vector3;
  /** Linear. */
  color?: Color3;
  /** Radiance at one metre, before falloff. */
  intensity?: number;
  /** Metres; the light ends smoothly here. */
  range?: number;
  /** Where a spot points. */
  direction?: Vector3;
  /** Radians, full brightness inside. */
  innerCone?: number;
  /** Radians, dark outside. */
  outerCone?: number;
  /** Whether a spot casts a shadow map (the nearest few do). */
  shadow?: boolean;
}

/** Instances of one geometry and material, drawn as one group. */
export interface Group {
  geometry: Geometry3D;
  material: Material3D | null;
  lod: readonly number[];
  instances: Float32Array[];
  batches: StaticBatch[];
}

/** A particle field over the scene; see PARTICLE_SHADER. */
export interface ParticleField {
  kind: string;
  /** Centre the field on the camera (motes); false pins it at `center`. */
  follow?: boolean;
  count?: number;
  center?: readonly number[];
  extent?: readonly number[];
  radius?: number;
  color?: Color3;
  opacity?: number;
  emissive?: number;
  speed?: number;
}

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
  /** The camera, from `setCamera` or hand-built. `view`, `fov`, `aspect`, `near` and `far` fit the shadow cascades. */
  camera: FrameCamera;
  /** The sun: the direction its light travels, its colour and intensity. */
  sun: { direction: number[]; color: number[]; intensity: number };
  /** Hemisphere ambient: light from the sky above and the ground below. */
  ambient: { sky: number[]; ground: number[]; intensity: number };
  /**
   * The wind over the scene's foliage: `direction` along x and z,
   * `strength` (0 is still air, 1 a stiff breeze; a ten-metre crown
   * sways about half a metre), `gust` how much of it comes in waves.
   */
  wind: { direction: number[]; strength: number; gust: number };
  /** Particle fields, at most `MAX_PARTICLE_FIELDS`. Stateless: see PARTICLE_SHADER. */
  particles: ParticleField[];
  /** Distance fog toward `color`; `density` 0 turns it off. */
  fog: { color: number[]; density: number };
  /** Exposure applied before tonemapping. */
  exposure: number;
  /** Bloom; `intensity` 0 skips the passes. */
  bloom: { threshold: number; intensity: number; scatter: number };
  /** Shadows; `enabled: false` turns every shadow off. */
  shadow: { distance: number; normalOffset: number; bias: number; enabled: boolean };
  /** Metres from the camera past which a light is faded out and dropped; see `addLight`. */
  lightDistance: number;
  /** Post-processing, as the scene wants it. */
  post: {
    taa: { blend: number };
    ao: { radius: number; intensity: number };
    dof: { focus: number | null; focalLength: number; fStop: number; maxBlur: number };
    motionBlur: { strength: number };
    autoExposure: { enabled: boolean; key: number; min: number; max: number; speed: number };
    grade: { saturation: number; contrast: number; temperature: number; lut: unknown };
    vignette: number;
    grain: number;
  };
  /**
   * An HDR environment panorama to use as the sky instead of the
   * procedural one, where `image` is what `hdr.js` decoded.
   */
  environment: { image: object; intensity?: number } | null;
  /** Joint matrix arrays of the skinned instances this frame, in order; the renderer packs them. */
  skins: Float32Array[];
  jointCount: number;
  /** Morph weight arrays of the morphed instances this frame, in order. */
  morphWeights: Float32Array[];
  morphCount: number;
  /** Point and spot lights, as packed records; see `addLight`. */
  lights: Float32Array[];
  /** The same lights as given, for the renderer to pick shadow casters from. */
  lightInfo: Light3D[];
  /** geometry -> material -> group */
  groups: Map<Geometry3D, Map<Material3D | null, Group>>;
  /** Instances submitted this frame, per-frame and resident alike. */
  added: number;

  constructor() {
    this.camera = {
      viewProjection: null, inverseViewProjection: null, view: null,
      position: { x: 0, y: 0, z: 0 }, fov: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 500
    };
    this.sun = { direction: [0.4, -1, 0.3], color: [1, 0.96, 0.9], intensity: 3 };
    this.ambient = { sky: [0.35, 0.45, 0.6], ground: [0.12, 0.1, 0.08], intensity: 1 };
    /**
     * The wind over the scene's foliage: `direction` along x and z,
     * `strength` (0 is still air, 1 a stiff breeze; a ten-metre crown
     * sways about half a metre), `gust` how much of it comes in waves.
     */
    this.wind = { direction: [1, 0], strength: 0, gust: 0.5 };
    /**
     * Particle fields, at most `MAX_PARTICLE_FIELDS`: `{ kind: 'motes' |
     * 'smoke', count, center: [x, y, z], extent: [x, y, z] (half sizes;
     * smoke: the column's spread and half its height), radius, color
     * (linear), opacity, emissive, speed }`. Stateless: see PARTICLE_SHADER.
     */
    this.particles = [];
    this.fog = { color: [0.55, 0.65, 0.8], density: 0.012 };
    this.exposure = 1;
    /**
     * Bloom: light brighter than `threshold` (after exposure; 0 lets
     * everything glow a little) scatters into a glow laid over the frame
     * at `intensity`. `scatter` is how far it reaches — each upsample's
     * blend toward the wider level, so low values keep a tight core and
     * high ones a long soft tail — and the glow carries the light's own
     * energy whatever it is set to. `intensity` 0 skips the passes.
     */
    this.bloom = { threshold: 1, intensity: 0.8, scatter: 0.75 };
    /**
     * Shadows. The sun's cascades cover the view out to `distance` metres;
     * `normalOffset` is how far, in shadow texels, a surface is pushed along
     * its normal before the lookup, the trade between acne and peter-panning;
     * `bias` is the depth tolerance in metres. `enabled: false` turns every
     * shadow off.
     */
    this.shadow = { distance: 60, normalOffset: 1.5, bias: 0.03, enabled: true };
    this.lightDistance = 120;
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
    this.skins = [];
    this.jointCount = 0;
    this.morphWeights = [];
    this.morphCount = 0;
    this.lights = [];
    this.lightInfo = [];
    this.groups = new Map();
    this.added = 0;
  }

  /** Take the camera's matrices, eye and lens from a `Camera3D`. */
  setCamera(camera: Camera3DLike): void {
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
   * Draw `geometry` once, at a transform and in a material. See
   * `Instance3D` for what an instance carries.
   * @returns The model matrix used, to hand back as next frame's `previousModel`.
   */
  add(geometry: Geometry3D, instance: Instance3D = {}): Float32Array {
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
    } else if (instance.morphWeights && geometry.morphs) {
      // An unskinned mesh spends the skin slots on its morph bases
      // instead, one past them so zero still means none.
      data[52] = this.morphCount + 1;
      this.morphWeights.push(instance.morphWeights);
      this.morphCount += instance.morphWeights.length;
      data[54] = this.morphCount + 1;
      this.morphWeights.push(instance.previousMorphWeights ?? instance.morphWeights);
      this.morphCount += instance.morphWeights.length;
    }
    this.#entry(geometry, instance.material ?? null, instance.lod).instances.push(data);
    return model;
  }

  /**
   * Draw a resident batch of instances this frame. The batch was built
   * once (`StaticBatch`); the renderer keeps its records on the GPU.
   */
  addBatch(batch: StaticBatch): void {
    if (!batch.count) return;
    this.added += batch.count;
    this.#entry(batch.geometry, batch.material, batch.lod).batches.push(batch);
  }

  #entry(
    geometry: Geometry3D, material: Material3D | null, lod?: readonly number[]
  ): Group {
    let group = this.groups.get(geometry);
    if (!group) this.groups.set(geometry, group = new Map());
    let entry = group.get(material);
    if (!entry) group.set(material, entry = { geometry, material, lod: lod ?? ALL_COVERAGE, instances: [], batches: [] });
    return entry;
  }

  /**
   * A point or spot light.
   *
   * Lights fade with distance from the camera and are dropped beyond
   * `frame.lightDistance`: four hundred street lamps cannot all shade
   * every pixel, and the far clusters — whose boxes stand over dozens of
   * them at once — would overflow and drop lamps arbitrarily instead.
   * The fade starts at 80% of the distance, so a lamp dims out rather
   * than popping off; its emissive glow stays visible past it.
   *
   * See `Light3D` for what a light carries.
   */
  addLight(light: Light3D): void {
    if (this.lights.length >= MAX_LIGHTS) return;
    const p = light.position;
    checkLight(light, p);
    let fade = 1;
    const eye = this.camera.position;
    if (eye) {
      const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) - (light.range ?? 10);
      const limit = this.lightDistance;
      if (d >= limit) return;
      if (d > limit * 0.8) fade = 1 - (d - limit * 0.8) / (limit * 0.2);
    }
    const data = new Float32Array(LIGHT_FLOATS);
    data[0] = p.x; data[1] = p.y; data[2] = p.z; data[3] = light.range ?? 10;
    const c = light.color ?? WHITE;
    data[4] = c[0]!; data[5] = c[1]!; data[6] = c[2]!; data[7] = (light.intensity ?? 10) * fade;
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
  *entries(): Generator<Group> {
    for (const byMaterial of this.groups.values()) yield* byMaterial.values();
  }
}

/**
 * Refuse a light that would pack as NaN.
 *
 * Every number here is written straight into a `Float32Array` the GPU
 * reads, and `Number()` of anything unsuitable is NaN. One NaN light
 * poisons the colour of every fragment in its cluster, which the HDR
 * clamp then flattens to black — so a scene lit by many lamps goes dark
 * everywhere rather than showing one bad lamp. The cause has always
 * been a CSS colour string arriving where linear floats belong, from a
 * path that skipped `presentation3d.js`'s `lightFor`. One comparison a
 * light a frame is worth never debugging that again.
 */
function checkLight(light: Light3D, p: Vector3 | undefined): void {
  const bad = (what: string): never => {
    throw new Error(
      `M2D: light ${what}. A light reaches the frame as numbers: ` +
      'linear `color` as [r, g, b], a `position` in metres, numeric `intensity` and `range`. ' +
      'A scene\'s light block goes through `lightFor` (and `placeLight`) first, which is where a CSS colour becomes linear.');
  };
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) bad('has no finite position');
  const c = light.color;
  if (c !== undefined && (!Array.isArray(c) || c.length < 3 || !c.every(Number.isFinite))) {
    bad(`colour is ${typeof c === 'string' ? `the string ${JSON.stringify(c)}` : 'not three finite numbers'}`);
  }
  for (const key of ['intensity', 'range', 'innerCone', 'outerCone'] as const) {
    const value = light[key];
    if (value !== undefined && !Number.isFinite(value)) bad(`${key} is not a number`);
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
   * Derived values the renderer keeps on the batch, each with the version
   * it was computed at, so static records are walked once, not per frame.
   */
  bounds?: { min: number[]; max: number[] };
  boundsVersion?: number;
  centroid?: number[];
  centroidVersion?: number;
  minRadius?: number;
  minRadiusVersion?: number;

  geometry: Geometry3D;
  material: Material3D | null;
  lod: readonly number[];
  data: Float32Array;
  count: number;
  /** Bumped by `push`; the renderer re-uploads a batch whose version it has not seen. */
  version: number;
  /**
   * The model key a level's prop batch came from, set by `Scene`, so
   * streaming can take the batch away again when the model goes. Null
   * for a batch of primitive shapes, which never stream.
   */
  modelKey: string | null;

  /**
   * @param capacity - Grows as needed.
   * @param lod - The coverage range the batch is drawn within.
   */
  constructor(
    geometry: Geometry3D, material: Material3D | null = null, capacity = 64,
    lod: readonly number[] | null = null
  ) {
    this.geometry = geometry;
    this.material = material;
    this.lod = lod ?? ALL_COVERAGE;
    this.data = new Float32Array(capacity * INSTANCE_FLOATS);
    this.count = 0;
    /** Bumped by `push`; the renderer re-uploads a batch whose version it has not seen. */
    this.version = 0;
    this.modelKey = null;
  }

  /** One more instance; the same options as `Frame3D.add` minus `skin` and `previousModel`. */
  push(instance: Instance3D): void {
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
  get records(): Float32Array {
    return this.data.subarray(0, this.count * INSTANCE_FLOATS);
  }
}

/**
 * Write one instance record at `offset` in `data`, from the options
 * `Frame3D.add` documents, and return the model matrix used.
 */
export function writeInstance(
  data: Float32Array, offset: number, geometry: Geometry3D, instance: Instance3D
): Float32Array {
  let model = instance.model;
  if (!model) {
    const s = instance.scale ?? 1;
    const scale = typeof s === 'number' ? { x: s, y: s, z: s } : s;
    model = mat4.fromTRS(instance.position ?? ZERO, instance.rotation ?? IDENTITY_Q, scale);
  }
  data.set(model, offset);
  mat4.normalMatrix(model, data.subarray(offset + 16, offset + 28));
  const color = instance.color ?? GREY;
  data[offset + 28] = color[0]!; data[offset + 29] = color[1]!; data[offset + 30] = color[2]!; data[offset + 31] = 1;
  data[offset + 32] = instance.metallic ?? 0;
  data[offset + 33] = instance.roughness ?? 0.6;
  data[offset + 34] = instance.emissive ?? 0;
  data[offset + 35] = instance.checker ?? 0;
  data.set(instance.previousModel ?? model, offset + 36);
  // skin: x first joint, y skinned, z first joint of last frame's pose,
  // w casts a shadow. An unskinned, morphed instance reuses x and z for
  // its weight bases plus one; `Frame3D.add` writes those.
  // A BLEND surface does not: the shadow pass has no blending, so glass
  // would cast the opaque shadow of its whole pane. A MASK surface still
  // casts, cut out at its cutoff — that is what foliage wants.
  data[offset + 52] = 0; data[offset + 53] = 0; data[offset + 54] = 0;
  const blended = instance.material?.alphaMode === 'blend';
  data[offset + 55] = (instance.castShadow === false || blended) ? 0 : 1;

  // A sphere given in the world wins: every part and level of one model
  // instance carries the model's, so the cull decides that instance's
  // level once. Each part's own sphere would switch a trunk before its
  // canopy, and two levels' slightly different spheres would leave a
  // distance where both draw or neither does.
  if (instance.sphere) {
    data[offset + 56] = instance.sphere.x; data[offset + 57] = instance.sphere.y; data[offset + 58] = instance.sphere.z;
    data[offset + 59] = instance.sphere.radius;
    return model;
  }
  // The geometry's bounding sphere carried through the model matrix.
  // A skinned mesh moves well outside its bind pose; give the sphere room.
  const sphere = boundingSphere(geometry);
  const slack = geometry.skinned || (geometry.morphs && instance.morphWeights) ? 1.5 : 1;
  // A model matrix is sixteen floats; every index here is one of them.
  data[offset + 56] = model[0]! * sphere.x + model[4]! * sphere.y + model[8]! * sphere.z + model[12]!;
  data[offset + 57] = model[1]! * sphere.x + model[5]! * sphere.y + model[9]! * sphere.z + model[13]!;
  data[offset + 58] = model[2]! * sphere.x + model[6]! * sphere.y + model[10]! * sphere.z + model[14]!;
  const maxScale = Math.sqrt(Math.max(
    model[0]! * model[0]! + model[1]! * model[1]! + model[2]! * model[2]!,
    model[4]! * model[4]! + model[5]! * model[5]! + model[6]! * model[6]!,
    model[8]! * model[8]! + model[9]! * model[9]! + model[10]! * model[10]!));
  data[offset + 59] = sphere.radius * maxScale * slack;
  return model;
}

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
