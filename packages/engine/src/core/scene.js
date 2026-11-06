import { SpriteSheet } from './spriteSheet.js';
import { validate } from './schema.js';
import { constraintParamsSchema } from './sceneSchema.js';
import { Projection } from './projection.js';
import { geometryFor } from './renderers/geometry/primitives.js';
import { loadGLB } from './gltf.js';
import * as mat4 from './renderers/geometry/mat4.js';
import { presentationGuard } from './headless.js';
import { Container } from './ui/container.js';
import { MovingPlatform } from '../actors/movingPlatform.js';
import { UIButton } from './ui/button.js';
import { UIText } from './ui/text.js';
import { UIImage } from './ui/Image.js';
import { UIRectangle } from './ui/Rectangle.js';

const ZERO = { x: 0, y: 0, z: 0 };
const UNIT = { x: 1, y: 1, z: 1 };
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const WHITE = [1, 1, 1];

export class Scene {
  constructor(game, config) {
    this.game = game;
    this.config = config;
    this.sprites = new Map();
    this.spriteSheets = new Map();
    /** Models from `assets.models`, by key, once loaded. @type {Map<string, import('./gltf.js').Model>} */
    this.models = new Map();
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
      this.game.input.setUIContainer(this.ui);
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
    // menu's hooks run as ever.
    if (!this.#serverRuns) this.config.onEnter?.();
    if (!headless) this.config.onShow?.();
  }

  async loadAssets() {
    await Promise.all([this.#loadSpriteSheets(), this.#loadModels()]);
  }

  async #loadModels() {
    const models = this.config.assets?.models;
    if (!models) return;
    await Promise.all(Object.entries(models).map(async ([key, model]) => {
      this.models.set(key, await loadGLB(this.game.options.basePath + model.url));
    }));
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
            mesh: { ...base.mesh, ...object.overrides.mesh }
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

  /** `onHide` (with a display), then `onExit`, then tear down. */
  unload() {
    const headless = this.game.headless;
    if (!headless) this.config.onHide?.();
    if (!this.#serverRuns) this.config.onExit?.();

    // Those entities are gone with the scene; holding them here would keep
    // every body of every scene ever loaded alive. onExit runs first so it
    // can still look one up.
    this.entitiesById.clear();

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
    // World-space drawing that everything else sits on — a sky, parallax
    // scenery. Runs inside the world pass, before the background layer and
    // the entities, with the camera transform applied.
    if (this.config.onDrawBackground) {
      this.config.onDrawBackground(deltaTime);
    }

    if (this.config.type === 'level') {
      this.drawWorld(deltaTime);
    }

    // World-space drawing that does not belong to an entity. Runs inside the
    // world pass, after entities, with the camera transform applied.
    if (this.config.onDraw) {
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
    const frame = game.renderer.createFrame();
    frame.setCamera(game.camera);

    if (this.config.type === 'level') {
      for (const entity of game.entities) {
        const mesh = entity.mesh;
        if (!mesh || mesh.visible === false || !entity.visible || entity.dead) continue;
        const body = entity.body;
        if (mesh.model) {
          this.#addModel(frame, mesh, body);
          continue;
        }
        const { geometry, scale } = geometryFor(mesh.shape ?? body.shape, body.size);
        frame.add(geometry, {
          position: body.renderPosition,
          rotation: body.renderRotation,
          scale,
          color: mesh.color,
          metallic: mesh.metallic,
          roughness: mesh.roughness,
          emissive: mesh.emissive,
          checker: mesh.checker
        });
      }
    }
    this.config.onRender?.(frame, deltaTime);
    return frame;
  }

  /**
   * A model at a body: each part's node matrix under the body's transform,
   * scaled and offset as the mesh block says. The model's own materials
   * draw it; the mesh block's `emissive` adds to them.
   */
  #addModel(frame, mesh, body) {
    const model = this.models.get(mesh.model);
    if (!model) return;
    const s = mesh.scale ?? 1;
    const offset = mesh.offset ?? ZERO;
    const base = mat4.fromTRS(body.renderPosition, body.renderRotation, UNIT, this.#scratchBase);
    // Offset and scale in the body's frame, before the parts' own matrices.
    const local = mat4.fromTRS(offset, IDENTITY_Q, { x: s, y: s, z: s }, this.#scratchLocal);
    mat4.multiply(base, local, base);
    for (const part of model.parts) {
      frame.add(part.geometry, {
        model: mat4.multiply(base, part.matrix),
        material: part.material,
        color: WHITE, metallic: 1, roughness: 1,
        emissive: mesh.emissive ?? 0
      });
    }
  }

  #scratchBase = new Float32Array(16);
  #scratchLocal = new Float32Array(16);
}