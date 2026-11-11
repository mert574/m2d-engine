/**
 * A level's props: prefabs placed many times as scenery, resident on the
 * GPU as instance batches, with their colliders, their lights and the
 * streaming of the models only they use.
 *
 * One instance is `[x, y, z, yaw, scale]` and owns no entity — nothing
 * can find or move it at play time, it only draws and (if its group asks)
 * stops things. Everything about props lives here; `Scene` delegates its
 * public surface (`batches`, `propBodies`, `propLights`, `streaming`,
 * `setupProps`, `streamModels`, `rebuildProps`) to one of these.
 *
 * Streaming: a model only props use may come and go with the camera.
 * `index` decides which models those are and records every instance
 * position per key; `streamModels` measures the camera against them and
 * fetches or drops models over the two radii. Models an entity wears are
 * not streamable — the simulation owns that entity wherever the camera
 * goes — and load with the scene.
 *
 * `rebuild` (the editor's, E7b) tears the props' state down and builds it
 * again from the scene's config: the same batches, bodies, lights and
 * spots a fresh load would make, without touching the entities, the
 * assets or the physics world around them. An edit to one instance is a
 * rebuild of all of them — coarse, but it runs once per gesture, not per
 * frame, and it is the only path that cannot drift from a load.
 */

import { StaticBatch } from './renderers/frame3d.js';
import { geometryFor } from './renderers/geometry/primitives.js';
import { meshFor, lightFor, placeLight, instanceEmissive } from './presentation3d.js';
import { loadModel } from './modelLoader.js';
import { Quat } from './math.js';
import * as mat4 from './renderers/geometry/mat4.js';

const ZERO = { x: 0, y: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const WHITE = [1, 1, 1];

export class SceneProps {
  /** @param {import('./scene.js').Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** The level's props as resident instance batches, built at load; see `setup`. @type {StaticBatch[]} */
    this.batches = [];
    /** The props' static bodies, removed with the scene. */
    this.bodies = [];
    /** Lights the level's props carry, fixed at load; `frame3D` adds them each frame. */
    this.lights = [];
    /**
     * Streaming: metres from the camera at which a model's props pull it
     * in, and the longer reach at which they let it go. The gap is
     * hysteresis — equal radii would load and unload a model every frame
     * for a camera sitting on the line. `streamBudget` caps the fetches
     * in the air at once.
     */
    this.streamIn = 120;
    this.streamOut = 180;
    this.streamBudget = 4;
    /** Model keys only props use, which may come and go; see `streamModels`. @type {Set<string>} */
    this.streamable = new Set();
    /** Of the scene's models, the ones currently asked for. @type {Set<string>} */
    this.wanted = new Set();
    /** In-flight loads by key, so two asks share one fetch. @type {Map<string, Promise>} */
    this.loading = new Map();
    /**
     * Streamable models that failed to load, which are not asked for again
     * this scene: the streamer runs every frame, and retrying a missing
     * file each time is a fetch and a parse a frame for nothing.
     * @type {Set<string>}
     */
    this.failed = new Set();
    /** Every prop instance position per model key, as flat xyz, for the distance test. @type {Map<string, number[]>} */
    this.spots = new Map();
    /** Set once `setup` has run; before it there is nothing to add batches to. */
    this.ready = false;
    /** Set by `unload`, so a load still in the air knows not to land. */
    this.gone = false;
    /** The editor's isolate mode: true leaves every prop out of the frame. */
    this.hidden = false;
  }

  /**
   * Which models only props use, and where those props stand.
   *
   * Called before anything is fetched: `loadModels` needs to know what may
   * wait, and `streamModels` needs the positions to measure against.
   */
  index() {
    const scene = this.scene;
    const models = scene.config.assets?.models;
    if (!models || scene.game.headless) return;
    const worn = new Set();
    for (const layer of scene.config.layers ?? []) {
      for (const object of layer.objects ?? []) {
        const mesh = { ...scene.config.prefabs?.[object.prefab]?.mesh, ...object.overrides?.mesh };
        if (mesh?.model) worn.add(mesh.model);
      }
      for (const prop of layer.props ?? []) {
        const key = scene.config.prefabs?.[prop.prefab]?.mesh?.model;
        if (!key) continue;
        let spots = this.spots.get(key);
        if (!spots) this.spots.set(key, spots = []);
        for (const [x, y, z] of prop.instances) spots.push(x, y, z ?? 0);
      }
    }
    for (const key of Object.keys(models)) {
      if (this.spots.has(key) && !worn.has(key)) this.streamable.add(key);
      else this.wanted.add(key);
    }
    for (const key of this.streamable) {
      if (this.near(key, this.startPoint())) this.wanted.add(key);
    }
  }

  /**
   * The scene's models, in parallel — every model an entity wears, and
   * every model whose nearest prop stands inside the stream radius of
   * where the camera starts. The rest arrive while the level is played.
   * `onLoadProgress({ loaded, total, name })` on the config hears each
   * arrive, for a loading screen.
   */
  async loadModels() {
    const config = this.scene.config;
    const models = config.assets?.models;
    if (!models) return;
    const entries = Object.entries(models);
    const required = entries.filter(([key]) => !this.streamable.has(key) || this.near(key, this.startPoint()));
    let loaded = 0;
    config.onLoadProgress?.({ loaded, total: required.length, name: null });
    await Promise.all(required.map(async ([key]) => {
      try {
        await this.loadModel(key);
      } catch (error) {
        // A model only props draw is scenery: the level plays without it,
        // its props simply absent, as a streamed model that fails mid-game
        // is. One an entity wears is the level's to have, and stops it.
        if (!this.streamable.has(key)) throw error;
        this.failed.add(key);
        console.warn(`M2D: model '${key}' failed to load; its props are not drawn: ${error.message}`);
      }
      loaded++;
      config.onLoadProgress?.({ loaded, total: required.length, name: key });
    }));
  }

  /**
   * One model in, with its prop batches built if it has any.
   *
   * Loads of the same key share a promise, so the streamer asking twice
   * while the bytes are in flight costs one fetch; a key that finished
   * resolves at once.
   */
  loadModel(key) {
    const scene = this.scene;
    if (scene.models.has(key)) return Promise.resolve(scene.models.get(key));
    let pending = this.loading.get(key);
    if (pending) return pending;
    const url = scene.config.assets.models[key].url;
    // Off the main thread where there is a worker: parsing and transcoding
    // a scan is a dropped frame otherwise, and streaming does it mid-game.
    pending = loadModel(scene.game.options.basePath + url, { transcodeTarget: scene.game.renderer?.transcodeTarget }).then((model) => {
      this.loading.delete(key);
      // The scene may have unloaded, or the streamer changed its mind,
      // while this was in the air; dropping it here is cheaper than
      // uploading a model nothing will draw.
      if (this.gone || !this.wanted.has(key)) return null;
      scene.models.set(key, model);
      this.addModelBatches(key);
      return model;
    }, (error) => {
      this.loading.delete(key);
      throw error;
    });
    this.loading.set(key, pending);
    return pending;
  }

  /** Where the level is seen from before a camera exists: the player's start, else the origin. */
  startPoint() {
    const config = this.scene.config;
    for (const layer of config.layers ?? []) {
      for (const object of layer.objects ?? []) {
        if (config.prefabs?.[object.prefab]?.actor === 'Hero' || object.id === 'player' || object.id === 'hero') {
          return { x: object.x, y: object.y, z: object.z ?? 0 };
        }
      }
    }
    return { x: 0, y: 0, z: 0 };
  }

  /** Whether any instance of `key`'s props stands within the load radius of `eye`. */
  near(key, eye, radius = this.streamIn) {
    const spots = this.spots.get(key);
    if (!spots) return true;
    for (let i = 0; i < spots.length; i += 3) {
      const dx = spots[i] - eye.x, dy = spots[i + 1] - eye.y, dz = spots[i + 2] - eye.z;
      if (dx * dx + dy * dy + dz * dz <= radius * radius) return true;
    }
    return false;
  }

  /**
   * Bring the level's models in and out as the camera moves.
   *
   * A model whose nearest prop is inside `streamIn` metres is fetched;
   * one whose nearest prop has fallen outside `streamOut` is let go —
   * its batches dropped, its GPU memory released. At most `streamBudget`
   * fetches are in the air at once, so a sweep of the view does not open
   * two hundred connections.
   *
   * @param {{x: number, y: number, z: number}} eye - Usually the camera
   */
  streamModels(eye) {
    if (this.scene.game.headless || !this.streamable.size) return;
    for (const key of this.streamable) {
      const near = this.near(key, eye);
      if (near) this.wanted.add(key);
      else if (!this.near(key, eye, this.streamOut)) this.wanted.delete(key);
    }
    for (const key of this.streamable) {
      if (this.wanted.has(key)) {
        if (!this.scene.models.has(key) && !this.loading.has(key) && !this.failed.has(key) && this.loading.size < this.streamBudget) {
          this.loadModel(key).catch((error) => {
            this.failed.add(key);
            console.warn(`M2D: streaming '${key}' failed, and is not asked for again: ${error.message}`);
          });
        }
      } else if (this.scene.models.has(key)) {
        this.dropModel(key);
      }
    }
  }

  /** Let go of a streamed model: its batches go, its bodies stay, its GPU memory is released. */
  dropModel(key) {
    const scene = this.scene;
    const model = scene.models.get(key);
    if (!model) return;
    scene.models.delete(key);
    this.batches = this.batches.filter((batch) => batch.modelKey !== key);
    scene.game.renderer?.unloadModel?.(model);
  }

  /**
   * The layers' `props` as static batches: one per geometry and material,
   * with every placement of every prop that draws that pair written in as
   * an instance record. A primitive prop is its prefab's shape at the
   * prop's size; a model prop is each part of the model under the mesh
   * block's scale and offset, with the file's own materials. Built once;
   * `frame3D` hands the batches to every frame.
   */
  setup() {
    const scene = this.scene;
    const headless = scene.game.headless;
    const batches = new Map();
    const batchFor = (geometry, material, lod = null) => {
      let byMaterial = batches.get(geometry);
      if (!byMaterial) batches.set(geometry, byMaterial = new Map());
      let batch = byMaterial.get(material);
      if (!batch) byMaterial.set(material, batch = new StaticBatch(geometry, material, 64, lod));
      return batch;
    };
    for (const layer of scene.config.layers) {
      for (const prop of layer.props ?? []) {
        const prefab = scene.config.prefabs[prop.prefab];
        // A prop may carry a light — a lantern head, a window glow — at
        // each instance, turned with its yaw and scaled with its size.
        if (prefab?.light) {
          // Through `lightFor` and `placeLight`, exactly as an entity's
          // light goes: the block's CSS colour becomes linear light and
          // the offset is turned and scaled with the instance. Spread
          // raw, the colour string would reach the light buffer as NaN.
          const light = lightFor(prefab.light);
          for (const [x, y, z, yaw = 0, scale = 1] of prop.instances) {
            this.lights.push(placeLight(light, { x, y, z }, yaw, scale));
          }
        }
        if (!prefab?.mesh) continue;
        const mesh = meshFor(prefab.mesh);
        // Either side can turn casting off: the prop, or the prefab's mesh
        // as an entity's would. A lantern's glowing shell is the case that
        // matters — drawn into its own light's shadow cube it would put
        // everything the lamp reaches in shadow.
        const castShadow = prop.castShadow !== false && mesh.castShadow !== false;
        const size = { x: prop.width ?? 1, y: prop.height ?? 1, z: prop.depth ?? prop.width ?? 1 };
        if (mesh.model) {
          const model = scene.models.get(mesh.model);
          // Colliders stand whether or not the model is here to draw: a
          // headless game loads no models and still needs the walls, and
          // a streamed-out model's props must not become walkable.
          this.#colliders(prop, model ? modelBounds(model, mesh) : null, mesh.offset ?? ZERO);
          // The drawing is `addModelBatches`'s, below, so that a model's
          // batches are built in one place and stamped with its key
          // whether it arrived with the scene or streamed in later —
          // `dropModel` has to be able to find them again.
          continue;
        }
        const shape = mesh.shape ?? prefab.physics?.shape ?? 'box';
        this.#colliders(prop, { min: { x: -size.x / 2, y: -size.y / 2, z: -size.z / 2 }, max: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } }, ZERO, shape);
        if (headless) continue;
        const { geometry, scale: shapeScale } = geometryFor(shape, size);
        const batch = batchFor(geometry, scene.meshMaterial(mesh));
        for (const [x, y, z, yaw, scale] of prop.instances) {
          batch.push({
            position: { x, y, z }, rotation: Quat.fromAxisAngle(UP, yaw),
            scale: { x: shapeScale.x * scale, y: shapeScale.y * scale, z: shapeScale.z * scale },
            color: mesh.color, metallic: mesh.metallic, roughness: mesh.roughness,
            emissive: instanceEmissive(mesh), checker: mesh.checker, castShadow
          });
        }
      }
    }
    this.batches = [...batches.values()].flatMap((byMaterial) => [...byMaterial.values()]);
    this.ready = true;
    for (const key of scene.models.keys()) this.addModelBatches(key);
  }

  /** One model prop's instances into batches, at every level of detail. */
  #pushModelProp(prop, mesh, model, castShadow, batchFor) {
    if (model.skinned) throw new Error(`M2D: prop '${prop.id}' uses skinned model '${mesh.model}'; a prop has no joints to pose`);
    const s = mesh.scale ?? 1;
    const local = mat4.fromTRS(mesh.offset ?? ZERO, IDENTITY_Q, { x: s, y: s, z: s });
    // Every level of detail gets every instance; the cull draws one
    // level per instance from the ranges the levels tile.
    const ranges = lodRanges(model);
    // The model's sphere, in its own space: one per instance, for every part and level.
    const { min, max } = model.bounds;
    const centre = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
    for (const [x, y, z, yaw, scale] of prop.instances) {
      const base = mat4.fromTRS({ x, y, z }, Quat.fromAxisAngle(UP, yaw), { x: scale, y: scale, z: scale });
      mat4.multiply(base, local, base);
      const at = mat4.transformPoint(base, centre);
      const sphere = { x: at.x, y: at.y, z: at.z, radius: radius * scale * s };
      model.lods.forEach((level, i) => {
        for (const part of level.parts) {
          batchFor(part.geometry, part.material, ranges[i]).push({
            model: mat4.multiply(base, part.matrix), material: part.material, sphere,
            color: WHITE, metallic: 1, roughness: 1, emissive: mesh.emissive ?? 0, castShadow
          });
        }
      });
    }
  }

  /**
   * The batches for one model key, built when a streamed model lands and
   * appended to the level's. Each is stamped with the key so `dropModel`
   * knows which to take away again.
   */
  addModelBatches(key) {
    const scene = this.scene;
    if (scene.game.headless || !this.ready) return;
    const model = scene.models.get(key);
    if (!model) return;
    const batches = new Map();
    const batchFor = (geometry, material, lod = null) => {
      let byMaterial = batches.get(geometry);
      if (!byMaterial) batches.set(geometry, byMaterial = new Map());
      let batch = byMaterial.get(material);
      if (!batch) byMaterial.set(material, batch = new StaticBatch(geometry, material, 64, lod));
      return batch;
    };
    let any = false;
    for (const layer of scene.config.layers) {
      for (const prop of layer.props ?? []) {
        const prefab = scene.config.prefabs[prop.prefab];
        const mesh = prefab?.mesh && meshFor(prefab.mesh);
        if (mesh?.model !== key) continue;
        const castShadow = prop.castShadow !== false && mesh.castShadow !== false;
        this.#pushModelProp(prop, mesh, model, castShadow, batchFor);
        any = true;
      }
    }
    if (!any) return;
    for (const byMaterial of batches.values()) {
      for (const batch of byMaterial.values()) {
        batch.modelKey = key;
        this.batches.push(batch);
      }
    }
  }

  /**
   * Static bodies for a prop's instances, as its `collider` asks: the
   * model's bounds (scaled, turned and placed like the instance), or a
   * shape standing on the instance's origin. No entity: nothing can find
   * or move these, they only stop things.
   * @param {object} prop
   * @param {{min, max}|null} bounds - The drawn thing's bounds about the instance origin, before scale
   * @param {{x,y,z}} offset - The mesh block's offset, part of the bounds' placement
   * @param {string} [boundsShape='box'] - The collider shape for `bounds` on a primitive prop
   */
  #colliders(prop, bounds, offset, boundsShape = 'box') {
    const collider = prop.collider ?? 'none';
    if (collider === 'none') return;
    if (collider === 'bounds' && !bounds) return;
    const physics = this.scene.game.physics;
    for (const [x, y, z, yaw, scale] of prop.instances) {
      const rotation = Quat.fromAxisAngle(UP, yaw);
      let shape, width, height, depth, centre;
      if (collider === 'bounds') {
        shape = boundsShape;
        width = (bounds.max.x - bounds.min.x) * scale;
        height = (bounds.max.y - bounds.min.y) * scale;
        depth = (bounds.max.z - bounds.min.z) * scale;
        // The bounds' centre in the instance's frame, turned with it.
        const cx = ((bounds.min.x + bounds.max.x) / 2 + offset.x) * scale;
        const cy = ((bounds.min.y + bounds.max.y) / 2 + offset.y) * scale;
        const cz = ((bounds.min.z + bounds.max.z) / 2 + offset.z) * scale;
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        centre = { x: x + c * cx + sn * cz, y: y + cy, z: z - sn * cx + c * cz };
      } else {
        shape = collider.shape;
        width = collider.width * scale;
        height = collider.height * scale;
        depth = (collider.depth ?? collider.width) * scale;
        centre = { x, y: y + height / 2, z };
      }
      const spec = { ...centre, bodyType: 'static', rotation };
      const body = shape === 'sphere'
        ? physics.createSphere({ ...spec, radius: Math.max(width, height, depth) / 2 })
        : shape === 'cylinder'
          ? physics.createCylinder({ ...spec, radius: Math.max(width, depth) / 2, height })
          : physics.createBox({ ...spec, width, height, depth });
      physics.add(body);
      this.bodies.push(body);
    }
  }

  /**
   * Build the props again from the scene's config, in place: the editor's
   * path for any change to a layer's `props` (an instance moved, a group
   * scattered or erased) without rebuilding the game around them. The
   * bodies come out of the physics world and go back in; the batches,
   * lights, spots and streaming sets are remade exactly as a load makes
   * them; a newly referenced model is fetched and its batches land when
   * it does. Runs once per gesture — a drag previews on the overlay and
   * commits here on release.
   */
  rebuild() {
    const scene = this.scene;
    const physics = scene.game.physics;
    for (const body of this.bodies) physics.remove(body);
    this.bodies = [];
    this.lights = [];
    this.batches = [];
    this.spots.clear();
    this.streamable.clear();
    this.wanted.clear();
    this.ready = false;
    this.index();
    this.setup();
    // Models the rebuilt props want that are not resident yet; their
    // batches arrive with them, as a streamed model's do.
    for (const key of this.wanted) {
      if (!scene.models.has(key) && !this.failed.has(key) && scene.config.assets?.models?.[key]) {
        this.loadModel(key).catch((error) => {
          this.failed.add(key);
          console.warn(`M2D: model '${key}' failed to load; its props are not drawn: ${error.message}`);
        });
      }
    }
    scene.game.invalidate?.();
  }

  /**
   * What the streamer is doing, for the debug readout and for a test:
   * which model keys may come and go, which the camera wants, which are
   * in the air, which are resident, and which failed and are not asked
   * for again.
   */
  get streaming() {
    return {
      streamable: [...this.streamable],
      wanted: [...this.wanted].filter((key) => this.streamable.has(key)),
      loading: [...this.loading.keys()],
      resident: [...this.scene.models.keys()],
      failed: [...this.failed]
    };
  }

  /** The scene is going: nothing in the air may land, and the batches go with it. */
  unload() {
    this.gone = true;
    this.ready = false;
    this.wanted.clear();
    this.batches = [];
    this.bodies = [];
    this.lights = [];
  }
}

/** A model's bounds in the mesh block's frame: the file's, times the block's scale. */
function modelBounds(model, mesh) {
  const s = mesh.scale ?? 1;
  const b = model.bounds;
  return {
    min: { x: b.min.x * s, y: b.min.y * s, z: b.min.z * s },
    max: { x: b.max.x * s, y: b.max.y * s, z: b.max.z * s }
  };
}

/** The coverage ranges a model's levels tile, finest first: [threshold, previous threshold). */
function lodRanges(model) {
  return model.lods.map((level, i) => [level.coverage, i === 0 ? Infinity : model.lods[i - 1].coverage]);
}
