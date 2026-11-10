import { SpriteSheet } from './spriteSheet.js';
import { validate } from './schema.js';
import { constraintParamsSchema } from './sceneSchema.js';
import { Projection } from './projection.js';
import { geometryFor } from './renderers/geometry/primitives.js';
import { StaticBatch } from './renderers/frame3d.js';
import { meshFor, lightFor, placeLight } from './presentation3d.js';
import { lodFor } from './gltf.js';
import { loadModel } from './modelLoader.js';
import { loadHDR } from './hdr.js';
import { Animator3D } from './animator3d.js';
import { Quat } from './math.js';
import * as mat4 from './renderers/geometry/mat4.js';
import { presentationGuard } from './headless.js';
import { Container } from './ui/container.js';
import { MovingPlatform } from '../actors/movingPlatform.js';
import { UIButton } from './ui/button.js';
import { UIText } from './ui/text.js';
import { UIImage } from './ui/Image.js';
import { UIRectangle } from './ui/Rectangle.js';

const ZERO = { x: 0, y: 0, z: 0 };

/** Frames between streaming sweeps; see `frame3D`. */
const STREAM_EVERY = 10;
const UP = { x: 0, y: 1, z: 0 };
const UNIT = { x: 1, y: 1, z: 1 };
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const WHITE = [1, 1, 1];

export class Scene {
  /** @type {Set<string>} */ #streamable;
  /** @type {Set<string>} */ #wanted;
  /** @type {Map<string, Promise>} */ #loading;
  /** @type {Map<string, number[]>} */ #propSpots;
  /** Set once `setupProps` has run; before it there is nothing to add batches to. */ #propsReady = false;
  /** Set by `unload`, so a load still in the air knows not to land. */ #gone = false;

  constructor(game, config) {
    this.game = game;
    this.config = config;
    this.sprites = new Map();
    this.spriteSheets = new Map();
    /** Models from `assets.models`, by key, once loaded. @type {Map<string, import('./gltf.js').Model>} */
    this.models = new Map();
    /** HDR panoramas from `assets.environments`, by key; hand one to `frame.environment`. @type {Map<string, {image: object, intensity: number}>} */
    this.environments = new Map();
    /** One stable material per `mesh.texture` block, by url|size, so the renderer groups instances that share one. @type {Map<string, object>} */
    this.meshMaterials = new Map();
    /** The level's props as resident instance batches, built at load; see `setupProps`. @type {StaticBatch[]} */
    this.batches = [];
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
    this.#streamable = new Set();
    /** Of those, the ones the camera currently wants. @type {Set<string>} */
    this.#wanted = new Set();
    /** In-flight loads by key, so two asks share one fetch. @type {Map<string, Promise>} */
    this.#loading = new Map();
    /** Every prop instance position per model key, as flat xyz, for the distance test. @type {Map<string, number[]>} */
    this.#propSpots = new Map();
    /** The props' static bodies, removed with the scene. */
    this.propBodies = [];
    /** Lights the level's props carry, fixed at load; `frame3D` adds them each frame. */
    this.propLights = [];
    /**
     * Entities placed by the scene file, by their object `id`. Lets one
     * placed object refer to another — the gate a lever opens, the point a
     * patrol walks to — without searching by name or position, and is what
     * an editor's selection resolves against. Entities spawned during play
     * are not in it: they come from `game.spawn` and have no scene object.
     * @type {Map<string, import('./entity.js').Entity>}
     */
    this.entitiesById = new Map();
    // A headless game has no UI; a scene hook that reaches for it fails by name.
    this.ui = game.headless ? presentationGuard('scene.ui') : new Container(game);
  }

  /**
   * Build the scene, then call `onEnter` and, with a display, `onShow`.
   *
   * `onEnter` is the scene's simulation setup and runs headless too.
   * `onShow` is its presentation: camera, lights, post effects, HUD. A
   * headless game loads no assets, builds no tile layers and runs no
   * presentation hook; a UI scene cannot load headless at all.
   */
  async load() {
    const headless = this.game.headless;
    if (headless && this.config.type !== 'level') {
      throw new Error(`M2D headless: scene '${this.config.name}' is a UI scene, and a headless game has no UI`);
    }
    if (!headless) await this.loadAssets();
    this.setupScene();

    if (!headless) {
      // A scene registers no input listeners of its own: it hands its UI to
      // the router, which hit-tests it between the overlay and world bands.
      // Except in edit mode: an edited scene's UI is drawn but never hears a
      // click, so a materialized menu cannot fire its actions.
      if (!this.game.editMode) this.game.input.setUIContainer(this.ui);
      this.game.camera.init(this);
    }

    if (this.config.type === 'level') {
      console.debug('Setting up level scene');
      await this.setupLevelScene();
    } else {
      console.debug('Setting up UI scene');
      await this.setupUIScene();
    }

    this.game.markSceneBuilt?.();

    // A replica shows a world the server simulates: a level's simulation
    // hooks are the server's to run. A UI scene has no simulation, so a
    // menu's hooks run as ever. In edit mode no hook runs at all — the
    // scene is the document materialized, with no game code against it.
    if (!this.#serverRuns && !this.game.editMode) this.config.onEnter?.();
    if (!headless && !this.game.editMode) this.config.onShow?.();
  }

  async loadAssets() {
    // Before anything is fetched: what may stream, and where it stands.
    this.indexProps();
    await Promise.all([this.#loadSpriteSheets(), this.#loadModels(), this.#loadEnvironments(), this.#loadMeshTextures()]);
  }

  /**
   * The scene's models, in parallel. `onLoadProgress({ loaded, total,
   * name })` on the config hears each arrive, for a loading screen; a
   * level with hundreds of megabytes of scans takes a while.
   */
  /**
   * The images named by the prefabs' `mesh.texture` blocks, decoded once
   * each and wrapped as materials. The material object is stable for the
   * scene's life — the renderer caches bind groups by its identity and
   * `Frame3D` groups instances by it.
   */
  async #loadMeshTextures() {
    if (this.game.headless || typeof createImageBitmap !== 'function') return;
    const wanted = new Map();
    for (const prefab of Object.values(this.config.prefabs ?? {})) {
      const texture = prefab.mesh?.texture;
      if (!texture) continue;
      const key = `${texture.url}|${texture.size ?? 1}`;
      if (!wanted.has(key)) wanted.set(key, texture);
    }
    await Promise.all([...wanted.entries()].map(async ([key, texture]) => {
      const response = await fetch(this.game.options.basePath + texture.url);
      if (!response.ok) throw new Error(`M2D: could not fetch texture ${texture.url} (${response.status})`);
      const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      this.meshMaterials.set(key, {
        name: texture.url,
        baseColor: [1, 1, 1, 1],
        baseColorTexture: image,
        metallic: 1,
        roughness: 1,
        worldScale: texture.size ?? 1
      });
    }));
  }

  /** The stable material for a mesh block's `texture`, or null without one. */
  meshMaterial(mesh) {
    const texture = mesh?.texture;
    if (!texture) return null;
    return this.meshMaterials.get(`${texture.url}|${texture.size ?? 1}`) ?? null;
  }

  async #loadEnvironments() {
    const environments = this.config.assets?.environments;
    if (!environments) return;
    await Promise.all(Object.entries(environments).map(async ([key, environment]) => {
      this.environments.set(key, {
        image: await loadHDR(this.game.options.basePath + environment.url),
        intensity: environment.intensity ?? 1
      });
    }));
  }

  async #loadModels() {
    const models = this.config.assets?.models;
    if (!models) return;
    const entries = Object.entries(models);
    // What the first frame cannot do without: every model an entity wears,
    // and every model whose nearest prop stands inside the stream radius of
    // where the camera starts. The rest arrive while the level is played.
    const required = entries.filter(([key]) => !this.#streamable.has(key) || this.#near(key, this.#startPoint()));
    let loaded = 0;
    this.config.onLoadProgress?.({ loaded, total: required.length, name: null });
    await Promise.all(required.map(async ([key]) => {
      await this.#loadModel(key);
      loaded++;
      this.config.onLoadProgress?.({ loaded, total: required.length, name: key });
    }));
  }

  /**
   * One model in, with its prop batches built if it has any.
   *
   * Loads of the same key share a promise, so the streamer asking twice
   * while the bytes are in flight costs one fetch; a key that finished
   * resolves at once.
   */
  #loadModel(key) {
    if (this.models.has(key)) return Promise.resolve(this.models.get(key));
    let pending = this.#loading.get(key);
    if (pending) return pending;
    const url = this.config.assets.models[key].url;
    // Off the main thread where there is a worker: parsing and transcoding
    // a scan is a dropped frame otherwise, and streaming does it mid-game.
    pending = loadModel(this.game.options.basePath + url, { transcodeTarget: this.game.renderer?.transcodeTarget }).then((model) => {
      this.#loading.delete(key);
      // The scene may have unloaded, or the streamer changed its mind,
      // while this was in the air; dropping it here is cheaper than
      // uploading a model nothing will draw.
      if (this.#gone || !this.#wanted.has(key)) return null;
      this.models.set(key, model);
      this.#addModelBatches(key);
      return model;
    }, (error) => {
      this.#loading.delete(key);
      throw error;
    });
    this.#loading.set(key, pending);
    return pending;
  }

  /** Where the level is seen from before a camera exists: the player's start, else the origin. */
  #startPoint() {
    for (const layer of this.config.layers ?? []) {
      for (const object of layer.objects ?? []) {
        if (this.config.prefabs?.[object.prefab]?.actor === 'Hero' || object.id === 'player' || object.id === 'hero') {
          return { x: object.x, y: object.y, z: object.z ?? 0 };
        }
      }
    }
    return { x: 0, y: 0, z: 0 };
  }

  /** Whether any instance of `key`'s props stands within the load radius of `eye`. */
  #near(key, eye, radius = this.streamIn) {
    const spots = this.#propSpots.get(key);
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
   * its batches dropped, its GPU memory released. The two radii differ so
   * a camera sitting on the boundary does not load and unload every
   * frame. At most `streamBudget` fetches are in the air at once, so a
   * sweep of the view does not open two hundred connections.
   *
   * Only models used by props stream: an entity's model is worn by
   * something the simulation owns and has to be there whatever the
   * camera does.
   *
   * @param {{x: number, y: number, z: number}} eye - Usually the camera
   */
  streamModels(eye) {
    if (this.game.headless || !this.#streamable.size) return;
    for (const key of this.#streamable) {
      const near = this.#near(key, eye);
      if (near) this.#wanted.add(key);
      else if (!this.#near(key, eye, this.streamOut)) this.#wanted.delete(key);
    }
    for (const key of this.#streamable) {
      if (this.#wanted.has(key)) {
        if (!this.models.has(key) && !this.#loading.has(key) && this.#loading.size < this.streamBudget) {
          this.#loadModel(key).catch((error) => console.warn(`M2D: streaming '${key}' failed: ${error.message}`));
        }
      } else if (this.models.has(key)) {
        this.#dropModel(key);
      }
    }
  }

  /** Let go of a streamed model: its batches, its bodies stay, its GPU memory goes. */
  #dropModel(key) {
    const model = this.models.get(key);
    if (!model) return;
    this.models.delete(key);
    this.batches = this.batches.filter((batch) => batch.modelKey !== key);
    this.game.renderer?.unloadModel?.(model);
  }

  async #loadSpriteSheets() {
    if (!this.config.assets?.spritesheets) return;

    const loadPromises = Object.entries(this.config.assets.spritesheets).map(([key, spritesheet]) => 
      new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          const sheet = new SpriteSheet(img, spritesheet.frameWidth, spritesheet.frameHeight, this.game);
          this.sprites.set(key, img);
          this.spriteSheets.set(key, sheet);

          if (spritesheet.animations) {
            Object.entries(spritesheet.animations).forEach(([name, anim]) => {
              sheet.defineAnimation(name, anim.frames, { fps: anim.fps ?? 0, loop: anim.loop ?? true });
            });
          } else {
            sheet.define('default', 0, 0);
          }
          resolve();
        };
        img.onerror = (error) => {
          console.error(`Failed to load sprite: ${spritesheet.url}`, error);
          reject(error);
        };
        img.src = this.game.options.basePath + spritesheet.url;
      })
    );

    try {
      await Promise.all(loadPromises);
    } catch (error) {
      console.error('Error loading sprites:', error);
      throw error;
    }
  }

  setupScene() {
    // The engine builds its physics world once, at the dimension the game
    // was constructed with, so a scene cannot quietly ask for the other
    // one. Saying so here beats a level half-building into the wrong
    // solver and failing on the first shape it cannot make.
    const wanted = this.config.world?.dimensions ?? 2;
    if (wanted !== this.game.physics.dimensions) {
      throw new Error(`M2D scene '${this.config.name}': the scene is ${wanted}D ` +
        `but the game runs ${this.game.physics.dimensions}D physics — ` +
        `construct M2D with { dimensions: ${wanted} } and await ` +
        `initPhysics({ dimensions: ${wanted} })`);
    }

    this.game.entities.clear();
    this.game.resetNetIds?.();
    this.game.trackedState?.clear();
    // Listeners belong to the entities and the scene that registered them.
    // Cleared before anything is built, so an entity's constructor and the
    // scene's onShow can register straight away.
    this.game.events?.clear();
    // A fresh world, not an emptied one: Rapier keeps freed handles and
    // broad-phase state across removals, and a level entered a second time
    // in a reused world steps differently in the last bits.
    this.game.physics.reset();
    this.game.player = null;
    if (!this.game.headless) {
      this.game.layers.clear();
      this.ui.clear();
    }
    // A fresh scene starts its random sequence over, so the same level with
    // the same seed plays the same every time it is entered.
    this.game.rng?.reseed(this.game.options.seed ?? this.game.rng.seed);

    if (this.config.world) {
      if (this.config.world.gravity) {
        this.game.physics.setGravity(this.config.world.gravity);
      }
    }

    // Draw order among entities: `depth` sorts by the feet so whatever
    // stands lower is in front, which every 3/4 and isometric game wants;
    // `insertion` keeps scene order, for a game that layers by hand.
    this.sortMode = this.config.world?.sort ?? 'depth';
    // How the ground plane is seen. Null is straight down; isometric draws
    // every position through the projection while physics stays flat.
    this.game.projection = Projection.fromConfig(this.config.world?.projection);

    // Tile layers are drawn and nothing else; the simulation never sees them.
    if (this.game.headless) return;
    if (this.config.background) {
      this.setupBackground(this.config.background);
    }
    for (const layer of this.config.tileLayers ?? []) {
      this.setupTileLayer(layer);
    }
  }

  /**
   * Tile one spritesheet frame across the world as the background layer, at
   * zIndex -1 so it sits under the entities.
   *
   * @param {Object} background - `{ spritesheet, tileX, tileY }`; the loader
   *   has already checked the spritesheet exists.
   */
  setupBackground({ spritesheet, tileX = 0, tileY = 0 }) {
    this.setupTileLayer({ name: 'background', spritesheet, tileX, tileY, zIndex: -1 });
  }

  /**
   * One tiled layer from the scene's `tileLayers`: a frame repeated across
   * the world at its own depth and parallax. See LayerManager.
   *
   * @param {Object} layer - `{ name, spritesheet, tileX, tileY, zIndex,
   *   parallax, repeat, tileSize, scale, cells }`, validated by the loader.
   */
  setupTileLayer({ name, spritesheet, tileX = 0, tileY = 0, zIndex = -1, parallax = 1, repeat, tileSize, scale = 1, cells, stretch = false }) {
    const spriteSheet = this.spriteSheets.get(spritesheet);
    // The ground size of one tile. Flat views tile at the frame's size;
    // an isometric diamond covers a ground square half its drawn width.
    tileSize ??= this.game.projection && !stretch
      ? (this.config.assets.spritesheets[spritesheet].frameWidth * scale) / 2
      : this.config.assets.spritesheets[spritesheet].frameWidth;

    // Each layer gets a frame of its own on the shared sheet, so two layers
    // drawn from one sheet can show different tiles.
    const anim = `tileLayer:${name}`;
    spriteSheet.define(anim, tileX, tileY);
    // The layer's tiles live at fixed world coordinates and draw under the
    // camera, so the layer tiles the *world* — a size in world units,
    // independent of the display, the render resolution and resizes.
    const tileCountX = Math.ceil(this.game.options.worldWidth / tileSize);
    const tileCountY = Math.ceil(this.game.options.worldHeight / tileSize);

    const built = this.game.layers.constructLayer(spriteSheet, tileCountX, tileCountY, tileSize, { anim });
    if (cells) {
      // Only the listed cells exist; the rest of the grid is empty. A
      // dungeon's floor stops at its walls rather than filling the rock.
      const keep = new Set(cells.map(([i, j]) => i * tileCountY + j));
      built.tiles = built.tiles.map((tile, index) => (keep.has(index) ? tile : null));
    }
    this.game.layers.addLayer(name, built, { zIndex, parallax, repeat, scale, stretch });
  }

  async setupLevelScene() {
    if (!this.config.layers) {
      return
    }

    if (this.game.physics.dimensions === 3) this.setupProps();

    this.config.layers.forEach(layer => {
      layer.objects.forEach(object => {
        const base = this.config.prefabs[object.prefab];
        if (!base) {
          console.error(`Prefab not found: ${object.prefab}`);
          return;
        }
        // What this one object makes of the prefab. `physics` merges field
        // by field so an override can change the friction without
        // restating the body type.
        const prefab = object.overrides
          ? {
            ...base,
            ...object.overrides,
            physics: { ...base.physics, ...object.overrides.physics },
            mesh: { ...base.mesh, ...object.overrides.mesh },
            ...((base.light || object.overrides.light) && { light: { ...base.light, ...object.overrides.light } })
          }
          : base;

        const entity = this.createPrefabInstance({
          type: prefab.actor,
          x: object.x,
          y: object.y,
          z: object.z,
          width: object.width,
          height: object.height,
          depth: object.depth,
          sprite: prefab.spritesheet,
          animation: prefab.defaultAnimation,
          mesh: prefab.mesh,
          light: prefab.light,
          // Placement is the object's, material is the prefab's: an object
          // may rotate its instance (a ramp is a tilted platform) without
          // the prefab having to know.
          physics: object.angle !== undefined
            ? { ...prefab.physics, angle: object.angle }
            : prefab.physics,
          options: object.properties
        });

        if (entity) {
          // After the actor's own constructor, so a scene can retune what
          // the actor set up rather than race it.
          this.#applyConstraints(entity, prefab.constraints, object.constraints,
            `object '${object.id}'`);
          entity.sceneId = object.id;
          this.entitiesById.set(object.id, entity);
          if (object.zIndex !== undefined) entity.zIndex = object.zIndex;
          if (entity.name === 'Player') {
            this.game.player = entity;
            if (!this.game.headless) this.game.camera.follow(entity);
          }
          this.game.entities.add(entity);
          this.game.physics.add(entity.body);
        }
      });
    });
  }

  /**
   * The layers' `props` as static batches: one per geometry and material,
   * with every placement of every prop that draws that pair written in as
   * an instance record. A primitive prop is its prefab's shape at the
   * prop's size; a model prop is each part of the model under the mesh
   * block's scale and offset, with the file's own materials. Built once;
   * `frame3D` hands the batches to every frame.
   */
  setupProps() {
    const headless = this.game.headless;
    const batches = new Map();
    const batchFor = (geometry, material, lod = null) => {
      let byMaterial = batches.get(geometry);
      if (!byMaterial) batches.set(geometry, byMaterial = new Map());
      let batch = byMaterial.get(material);
      if (!batch) byMaterial.set(material, batch = new StaticBatch(geometry, material, 64, lod));
      return batch;
    };
    for (const layer of this.config.layers) {
      for (const prop of layer.props ?? []) {
        const prefab = this.config.prefabs[prop.prefab];
        // A prop may carry a light — a lantern head, a window glow — at
        // each instance, turned with its yaw and scaled with its size.
        if (prefab?.light) {
          // Through `lightFor` and `placeLight`, exactly as an entity's
          // light goes: the block's CSS colour becomes linear light and
          // the offset is turned and scaled with the instance. Spread
          // raw, the colour string would reach the light buffer as NaN.
          const light = lightFor(prefab.light);
          for (const [x, y, z, yaw = 0, scale = 1] of prop.instances) {
            this.propLights.push(placeLight(light, { x, y, z }, yaw, scale));
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
          const model = this.models.get(mesh.model);
          // Colliders stand whether or not the model is here to draw: a
          // headless game loads no models and still needs the walls, and
          // a streamed-out model's props must not become walkable.
          this.#propColliders(prop, model ? modelBounds(model, mesh) : null, mesh.offset ?? ZERO);
          // The drawing is `#addModelBatches`'s, below, so that a model's
          // batches are built in one place and stamped with its key
          // whether it arrived with the scene or streamed in later —
          // `#dropModel` has to be able to find them again.
          continue;
        }
        const shape = mesh.shape ?? prefab.physics?.shape ?? 'box';
        this.#propColliders(prop, { min: { x: -size.x / 2, y: -size.y / 2, z: -size.z / 2 }, max: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } }, ZERO, shape);
        if (headless) continue;
        const { geometry, scale: shapeScale } = geometryFor(shape, size);
        const batch = batchFor(geometry, this.meshMaterial(mesh));
        for (const [x, y, z, yaw, scale] of prop.instances) {
          batch.push({
            position: { x, y, z }, rotation: Quat.fromAxisAngle(UP, yaw),
            scale: { x: shapeScale.x * scale, y: shapeScale.y * scale, z: shapeScale.z * scale },
            color: mesh.color, metallic: mesh.metallic, roughness: mesh.roughness,
            emissive: mesh.emissive, checker: mesh.checker, castShadow
          });
        }
      }
    }
    this.batches = [...batches.values()].flatMap((byMaterial) => [...byMaterial.values()]);
    this.#propsReady = true;
    for (const key of this.models.keys()) this.#addModelBatches(key);
  }

  /** One model prop's instances into batches, at every level of detail. */
  #pushModelProp(prop, mesh, model, castShadow, batchFor) {
    if (model.skinned) throw new Error(`M2D: prop '${prop.id}' uses skinned model '${mesh.model}'; a prop has no joints to pose`);
    const s = mesh.scale ?? 1;
    const local = mat4.fromTRS(mesh.offset ?? ZERO, IDENTITY_Q, { x: s, y: s, z: s });
    // Every level of detail gets every instance; the cull draws one
    // level per instance from the ranges the levels tile.
    const ranges = lodRanges(model);
    for (const [x, y, z, yaw, scale] of prop.instances) {
      const base = mat4.fromTRS({ x, y, z }, Quat.fromAxisAngle(UP, yaw), { x: scale, y: scale, z: scale });
      mat4.multiply(base, local, base);
      model.lods.forEach((level, i) => {
        for (const part of level.parts) {
          batchFor(part.geometry, part.material, ranges[i]).push({
            model: mat4.multiply(base, part.matrix), material: part.material,
            color: WHITE, metallic: 1, roughness: 1, emissive: mesh.emissive ?? 0, castShadow
          });
        }
      });
    }
  }

  /**
   * The batches for one model key, built when a streamed model lands and
   * appended to the level's. Each is stamped with the key so `#dropModel`
   * knows which to take away again.
   */
  #addModelBatches(key) {
    if (this.game.headless || !this.#propsReady) return;
    const model = this.models.get(key);
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
    for (const layer of this.config.layers) {
      for (const prop of layer.props ?? []) {
        const prefab = this.config.prefabs[prop.prefab];
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
   * Which models only props use, and where those props stand.
   *
   * Called by `loadAssets` before anything is fetched: `#loadModels` needs to know what may
   * wait, and `streamModels` needs the positions to measure against. A
   * model any entity wears is not streamable — the simulation owns that
   * entity wherever the camera goes.
   */
  indexProps() {
    const models = this.config.assets?.models;
    if (!models || this.game.headless) return;
    const worn = new Set();
    for (const layer of this.config.layers ?? []) {
      for (const object of layer.objects ?? []) {
        const mesh = { ...this.config.prefabs?.[object.prefab]?.mesh, ...object.overrides?.mesh };
        if (mesh?.model) worn.add(mesh.model);
      }
      for (const prop of layer.props ?? []) {
        const key = this.config.prefabs?.[prop.prefab]?.mesh?.model;
        if (!key) continue;
        let spots = this.#propSpots.get(key);
        if (!spots) this.#propSpots.set(key, spots = []);
        for (const [x, y, z] of prop.instances) spots.push(x, y, z ?? 0);
      }
    }
    for (const key of Object.keys(models)) {
      if (this.#propSpots.has(key) && !worn.has(key)) this.#streamable.add(key);
      else this.#wanted.add(key);
    }
    for (const key of this.#streamable) {
      if (this.#near(key, this.#startPoint())) this.#wanted.add(key);
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
  #propColliders(prop, bounds, offset, boundsShape = 'box') {
    const collider = prop.collider ?? 'none';
    if (collider === 'none') return;
    if (collider === 'bounds' && !bounds) return;
    const physics = this.game.physics;
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
      this.propBodies.push(body);
    }
  }

  /**
   * Attach and tune the constraints a prefab and a placed object declare.
   *
   * One rule: an entry whose slot is already filled — by the actor's
   * constructor, or by the prefab — retunes what is there through
   * `configure`, and an entry for an empty slot constructs it. An
   * object's entry merges over the prefab's, so one guard can patrol
   * faster without a prefab of its own.
   *
   * Params are validated here as well as in the loader, which can only
   * check the entries whose `type` the document names. An entry that
   * retunes names no type, and until the entity exists nothing says which
   * class fills that slot.
   *
   * @param {import('./entity.js').Entity} entity
   * @param {Object} [fromPrefab]
   * @param {Object} [fromObject]
   * @param {string} where - For error messages.
   */
  #applyConstraints(entity, fromPrefab, fromObject, where) {
    if (!fromPrefab && !fromObject) return;

    const slots = new Set([...Object.keys(fromPrefab ?? {}), ...Object.keys(fromObject ?? {})]);
    for (const slot of slots) {
      const declared = fromPrefab?.[slot];
      const override = fromObject?.[slot];
      const type = override?.type ?? declared?.type;
      const existing = entity.getConstraint(slot);
      const problem = (message) => {
        throw new Error(`M2D scene '${this.config.name}': ${where}, constraint '${slot}': ${message}`);
      };

      if (!type && !existing) {
        problem('nothing attached one and no type was given');
      }

      const ConstraintClass = type ? this.game.constraintTypes.get(type) : existing.constructor;
      if (type && !ConstraintClass) problem(`constraint type '${type}' is not registered`);
      // Naming a different type for a slot something else already fills
      // would either discard that constraint and the callbacks its actor
      // wired up, or quietly configure the wrong object. Neither is a
      // thing to guess at.
      if (existing && ConstraintClass !== existing.constructor) {
        problem(`type '${type}' conflicts with the ${existing.constructor.name} already attached; ` +
          'omit the type to retune it, or use a different slot');
      }

      const params = this.#constraintParams(
        ConstraintClass, { ...declared?.params, ...override?.params }, problem);

      if (existing) existing.configure(params);
      else entity.addConstraint(slot, new ConstraintClass(entity, params));
    }
  }

  /** Validated params for one constraint entry. */
  #constraintParams(ConstraintClass, params, problem) {
    return validate(constraintParamsSchema(ConstraintClass), params, {
      fail: (path, message) => problem(`${path ? `${path}: ` : ''}${message}`)
    });
  }

  /**
   * One entity from a prefab: `game.createEntity` with the scene's sprite
   * sheet resolved from its name and the prefab's animation started.
   *
   * @param {object} spec - As `game.createEntity`, but `sprite` names one
   *   of this scene's sheets and `animation` is the one to start in.
   * @returns {import('./entity.js').Entity|null}
   */
  createPrefabInstance({ sprite, animation, ...spec }) {
    const entity = this.game.createEntity({
      ...spec,
      spritesheet: this.spriteSheets.get(sprite)
    });
    if (!entity) return null;

    entity.setAnimation(animation || 'default');
    return entity;
  }

  /**
   * What a scene-JSON button does when clicked.
   *
   * `"action"` names a behaviour rather than a scene: `'settings'` opens the
   * mounted settings menu (`game.settings`), anything else is handed to the
   * scene config's `onAction(action)` hook. `"onClick"` switches scenes, as
   * before — but a missing scene now logs an error instead of surfacing as an
   * unhandled rejection inside a click handler, which is how the platformer's
   * Settings button sat broken without anything saying so.
   */
  #runButtonAction({ action, onClick }) {
    if (action) {
      if (action === 'settings' && this.game.settings) {
        this.game.settings.open();
      } else if (this.config.onAction) {
        this.config.onAction(action);
      } else {
        console.warn(`Scene button action '${action}' has no handler` +
          (action === 'settings' ? ' (no SettingsMenu mounted)' : ''));
      }
      return;
    }
    if (onClick) {
      Promise.resolve(this.game.sceneManager.switchTo(onClick))
        .catch(error => console.error(`Scene button: cannot switch to scene '${onClick}'`, error));
    }
  }

  async setupUIScene() {
    if (!this.config.elements) return;

    this.config.elements.forEach(element => {
      const common = { x: element.x, y: element.y, anchor: element.anchor };
      const properties = element.properties ?? {};

      switch (element.type) {
        case 'button':
          this.ui.add(new UIButton({
            ...common,
            width: properties.width ?? 200,
            height: properties.height ?? 44,
            text: properties.text,
            onClick: () => this.#runButtonAction(properties),
            variant: properties.variant,
            background: properties.background,
            textColor: properties.textColor,
            fontSize: properties.fontSize,
            fontFamily: properties.fontFamily,
            fontWeight: properties.fontWeight,
            fontStyle: properties.fontStyle
          }));
          break;

        case 'text':
          this.ui.add(new UIText({
            ...common,
            text: properties.text,
            color: properties.color,
            fontSize: properties.fontSize,
            fontFamily: properties.fontFamily,
            fontWeight: properties.fontWeight,
            fontStyle: properties.fontStyle,
            align: properties.align
          }));
          break;

        case 'image':
          if (element.sprite) {
            this.ui.add(new UIImage({
              ...common,
              image: this.sprites.get(element.sprite),
              width: properties.width,
              height: properties.height,
              imageScale: properties.scale
            }));
          }
          break;

        case 'rect':
          this.ui.add(new UIRectangle({
            ...common,
            width: element.width,
            height: element.height,
            color: element.color,
            fill: element.fill ?? false,
            interactive: properties.interactive ?? false
          }));
          break;
      }
    });
  }

  /** Whether this is a level a server simulates for this replica. */
  get #serverRuns() {
    return this.game.replica && this.config.type === 'level';
  }

  /**
   * What the streamer is doing, for the debug readout and for a test:
   * which model keys may come and go, which the camera wants, which are
   * in the air, and which are resident.
   */
  get streaming() {
    return {
      streamable: [...this.#streamable],
      wanted: [...this.#wanted].filter((key) => this.#streamable.has(key)),
      loading: [...this.#loading.keys()],
      resident: [...this.models.keys()]
    };
  }

  /** `onHide` (with a display), then `onExit`, then tear down. */
  unload() {
    const headless = this.game.headless;
    if (!headless && !this.game.editMode) this.config.onHide?.();
    if (!this.#serverRuns && !this.game.editMode) this.config.onExit?.();

    // Those entities are gone with the scene; holding them here would keep
    // every body of every scene ever loaded alive. onExit runs first so it
    // can still look one up.
    this.entitiesById.clear();
    // A load still in the air must not land in a scene that has gone, and
    // every model this scene brought in gives its GPU memory back — which
    // is what used to leak a level's worth on each scene change.
    this.#gone = true;
    this.#propsReady = false;
    this.#wanted.clear();
    for (const model of this.models.values()) this.game.renderer?.unloadModel?.(model);
    this.models.clear();
    this.batches = [];
    this.propBodies = [];

    // Headless there is no camera, UI or cursor to reset, only the scene's
    // timers (see the end of this method).
    if (headless) {
      this.game.time?.clear();
      return;
    }

    // Camera setup is scene state: the mode, bounds, zoom or rotation follow
    // this scene chose must not leak into the next one. onExit runs first so
    // it can still read the camera it configured.
    this.game.camera.resetConfig();

    this.sprites.clear();
    this.spriteSheets.clear();
    this.ui.clear();

    // Reset cursor style
    this.game.renderer.setCursor('default');

    // The elements the router was hit-testing no longer exist.
    this.game.input.setUIContainer(null);

    // Nor do the entities a scheduled callback would have reached into.
    // Timers belong to the scene that armed them; one meant to outlive a
    // switch is armed again by the next scene's onEnter.
    this.game.time?.clear();
  }

  /**
   * One simulation tick, before the physics step. Entities and the scene's
   * `onFixedUpdate` hook run here with the constant dt; it is the only
   * place scene-level code should change the game's state.
   * @param {number} dt - Seconds; always `game.time.fixedTimestep`.
   */
  fixedUpdate(dt) {
    if (this.config.type === 'level') {
      if (this.game.player &&
          this.game.player.body.position.y > this.game.options.worldHeight + 50) {
        console.log('Game Over!');
        this.game.gameOver();
        return;
      }

      // A copy: a tick may remove entities (a death, a projectile hit) or
      // add them (a spawner), and the set must not change under the loop.
      for (const entity of [...this.game.entities]) entity.fixedUpdate(dt);
    }

    // Scene-level simulation that is not an entity: a director spawning
    // waves, a win condition.
    if (this.config.onFixedUpdate) {
      this.config.onFixedUpdate(dt);
    }
  }

  /**
   * One frame of presentation, after the ticks and before drawing: entity
   * animation and the scene's `onUpdate` hook, with the frame's game-time
   * delta. Skipped while paused.
   * @param {number} deltaTime - Seconds of game time this frame.
   */
  update(deltaTime) {
    if (this.config.type === 'level') {
      this.game.entities.forEach(entity => entity.update(deltaTime));
    }

    // Scene-level presentation that is not an entity (a sky, a particle
    // layer). Simulation goes in onFixedUpdate.
    if (this.config.onUpdate) {
      this.config.onUpdate(deltaTime);
    }
  }

  /**
   * Tick the UI tree.
   *
   * Separate from `update` because the engine loop calls it every frame,
   * including while `game.paused` holds the simulation still. A menu drawn
   * over a frozen game still has to animate, measure its text and respond —
   * freezing it along with the physics is the one thing that would make the
   * pause obvious for the wrong reason.
   *
   * @param {number} deltaTime - Seconds since the last frame
   */
  updateUI(deltaTime) {
    this.ui.updateTree(deltaTime);
  }

  draw(deltaTime) {
    // In edit mode the scene's own draw hooks are game code and stay out of
    // the pass; what the document declares (layers, entities, props) still
    // draws, which is the entities' own `draw` below.
    const hooks = !this.game.editMode;

    // World-space drawing that everything else sits on — a sky, parallax
    // scenery. Runs inside the world pass, before the background layer and
    // the entities, with the camera transform applied.
    if (hooks && this.config.onDrawBackground) {
      this.config.onDrawBackground(deltaTime);
    }

    if (this.config.type === 'level') {
      this.drawWorld(deltaTime);
    }

    // World-space drawing that does not belong to an entity. Runs inside the
    // world pass, after entities, with the camera transform applied.
    if (hooks && this.config.onDraw) {
      this.config.onDraw(deltaTime);
    }
  }

  /**
   * Tile layers and entities in one ascending order: by `zIndex`, then by
   * `depth` among entities sharing one. A layer draws as a whole at its
   * `zIndex`, before the entities at that index. The sort is stable, so
   * entities that tie keep scene order, as they always did.
   */
  drawWorld(deltaTime) {
    const entities = this.#orderedEntities();
    const layers = this.game.layers.layers;
    let next = 0;
    for (const entity of entities) {
      while (next < layers.length && layers[next][1].zIndex <= entity.zIndex) {
        this.game.layers.drawOne(layers[next][1]);
        next++;
      }
      entity.draw(deltaTime);
    }
    while (next < layers.length) {
      this.game.layers.drawOne(layers[next][1]);
      next++;
    }
  }

  /**
   * The entities in draw order. The array is rebuilt every frame: the set
   * changes under spawning and death, and depth moves with every body.
   */
  #orderedEntities() {
    const list = [...this.game.entities];
    if (this.sortMode === 'insertion') {
      return list.sort((a, b) => a.zIndex - b.zIndex);
    }
    return list.sort((a, b) => (a.zIndex - b.zIndex) || (a.depth - b.depth));
  }

  drawUI(deltaTime) {
    this.ui.drawTree(deltaTime);
  }

  /**
   * What a 3D renderer draws this frame: the camera, every visible entity
   * as its mesh at its body's blended transform, and whatever the scene's
   * `onRender(frame, deltaTime)` hook adds or changes — the sun, the fog,
   * extra geometry. The 2D `draw` path and its entity draw calls are not
   * used in 3D. See `Frame3D`.
   * @param {number} deltaTime
   */
  frame3D(deltaTime) {
    const game = this.game;
    // Models in and out with the camera, before the frame is filled, so
    // what arrived this frame is drawn this frame. Every few frames is
    // often enough: the radii have tens of metres of slack in them and
    // the test walks every prop position.
    if ((game.time?.frame ?? 0) % STREAM_EVERY === 0) this.streamModels(game.camera.position ?? game.camera);
    const frame = game.renderer.createFrame();
    frame.setCamera(game.camera);

    if (this.config.type === 'level') {
      for (const batch of this.batches) frame.addBatch(batch);
      for (const light of this.propLights) frame.addLight(light);
      for (const entity of game.entities) {
        const mesh = entity.mesh;
        if (!mesh || mesh.visible === false || !entity.visible || entity.dead) continue;
        const body = entity.body;
        if (entity.light) frame.addLight(placeLight(entity.light, body.renderPosition));
        if (mesh.model) {
          this.#addModel(frame, mesh, body, deltaTime);
          continue;
        }
        const { geometry, scale } = geometryFor(mesh.shape ?? body.shape, body.size);
        // Last frame's matrix comes back as this frame's previous, for
        // motion vectors; it lives on the entity because the frame does not.
        entity.lastModel = frame.add(geometry, {
          position: body.renderPosition,
          rotation: body.renderRotation,
          scale,
          color: mesh.color,
          metallic: mesh.metallic,
          roughness: mesh.roughness,
          emissive: mesh.emissive,
          checker: mesh.checker,
          castShadow: mesh.castShadow,
          material: this.meshMaterial(mesh),
          previousModel: entity.lastModel ?? undefined
        });
      }
    }
    // The game's chance to light and grade the frame — its sun, sky and
    // post look. Edit mode skips it like every other hook; the editor sets
    // its own frame environment.
    if (!this.game.editMode) this.config.onRender?.(frame, deltaTime);
    return frame;
  }

  /**
   * A model at a body: each part's node matrix under the body's transform,
   * scaled and offset as the mesh block says. The model's own materials
   * draw it; the mesh block's `emissive` adds to them.
   */
  #addModel(frame, mesh, body, deltaTime) {
    const model = this.models.get(mesh.model);
    if (!model) return;
    const entity = body.entity;
    const s = mesh.scale ?? 1;
    const offset = mesh.offset ?? ZERO;
    // The body's rotation, then the entity's own heading about the up axis,
    // which a character that does not tumble steers its model with.
    const rotation = entity?.heading
      ? Quat.multiply(Quat.fromAxisAngle(UP, entity.heading), body.renderRotation)
      : body.renderRotation;
    const base = mat4.fromTRS(body.renderPosition, rotation, UNIT, this.#scratchBase);
    // Offset and scale in the body's frame, before the parts' own matrices.
    const local = mat4.fromTRS(offset, IDENTITY_Q, { x: s, y: s, z: s }, this.#scratchLocal);
    mat4.multiply(base, local, base);

    // A skinned or animated model gets an animator on first sight, playing
    // what the mesh block asked for; it advances on the frame, never the tick.
    let animator = entity?.animator ?? null;
    if (!animator && entity && (model.skinned || model.animations.length)) {
      animator = entity.animator = new Animator3D(model);
      const first = mesh.animation?.clip ?? model.animations[0]?.name;
      if (first) animator.play(first, { fade: 0, loop: mesh.animation?.loop ?? true, speed: mesh.animation?.speed ?? 1 });
    }
    animator?.update(deltaTime);

    // An entity picks its level here, by the same coverage the cull uses
    // for props: there are few entities and this keeps one record each.
    let parts = model.parts;
    if (model.lods.length > 1 && !animator) {
      const camera = frame.camera;
      const p = body.renderPosition;
      const distance = Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z);
      const b = model.bounds;
      const radius = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * 0.5 * s;
      parts = model.lods[lodFor(model, radius / (Math.max(distance, 1e-3) * Math.tan(camera.fov / 2)))].parts;
    }
    const previous = entity?.lastModels ?? [];
    const current = [];
    parts.forEach((part, i) => {
      // A skinned part is placed by its joints, in model space; a rigid part
      // rides its node, animated or at its bind pose.
      const skinned = part.skin !== null && animator;
      const partMatrix = skinned ? null : (animator ? animator.nodeMatrix(part.node) : part.matrix);
      current[i] = frame.add(part.geometry, {
        model: partMatrix ? mat4.multiply(base, partMatrix) : Float32Array.from(base),
        material: part.material,
        color: WHITE, metallic: 1, roughness: 1,
        emissive: mesh.emissive ?? 0,
        previousModel: previous[i],
        castShadow: mesh.castShadow,
        skin: skinned ? animator.jointMatrices(part.skin) : undefined,
        previousSkin: skinned ? animator.previousJointMatrices(part.skin) : undefined,
        // Morph weights: the animator's when one drives them, else the
        // file's own resting weights.
        morphWeights: part.geometry.morphs ? (animator?.morphWeights(part.node) ?? part.weights) : undefined,
        previousMorphWeights: part.geometry.morphs ? (animator?.previousMorphWeights(part.node) ?? undefined) : undefined
      });
    });
    if (entity) entity.lastModels = current;
  }

  #scratchBase = new Float32Array(16);
  #scratchLocal = new Float32Array(16);
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