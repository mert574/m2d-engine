import { SpriteSheet } from './spriteSheet.js';
import { Projection } from './projection.js';
import { Container } from './ui/container.js';
import { MovingPlatform } from '../actors/movingPlatform.js';
import { UIButton } from './ui/button.js';
import { UIText } from './ui/text.js';
import { UIImage } from './ui/Image.js';
import { UIRectangle } from './ui/Rectangle.js';

export class Scene {
  constructor(game, config) {
    this.game = game;
    this.config = config;
    this.sprites = new Map();
    this.spriteSheets = new Map();
    this.ui = new Container(game);
  }

  async load() {
    await this.loadAssets();
    this.setupScene();

    // A scene registers no input listeners of its own: it hands its UI to
    // the router, which hit-tests it between the overlay and world bands.
    this.game.input.setUIContainer(this.ui);

    this.game.camera.init(this);

    if (this.config.type === 'level') {
      console.debug('Setting up level scene');
      await this.setupLevelScene();
    } else {
      console.debug('Setting up UI scene');
      await this.setupUIScene();
    }

    if (this.config.onEnter) {
      this.config.onEnter();
    }
  }

  async loadAssets() {
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
    this.game.entities.clear();
    this.game.physics.clear();
    this.game.layers.clear();
    this.game.player = null;
    this.ui.clear();
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
        const prefab = this.config.prefabs[object.prefab];
        if (!prefab) {
          console.error(`Prefab not found: ${object.prefab}`);
          return;
        }
        const entity = this.createPrefabInstance({
          type: prefab.actor,
          position: [object.x, object.y],
          size: [object.width, object.height],
          sprite: prefab.spritesheet,
          defaultAnimation: prefab.defaultAnimation,
          // Placement is the object's, material is the prefab's: an object
          // may rotate its instance (a ramp is a tilted platform) without
          // the prefab having to know.
          physics: object.angle !== undefined
            ? { ...prefab.physics, angle: object.angle }
            : prefab.physics,
          options: object.properties,
        });

        if (entity) {
          if (object.zIndex !== undefined) entity.zIndex = object.zIndex;
          if (entity.name === 'Player') {
            this.game.player = entity;
            this.game.camera.follow(entity);
          }
          this.game.entities.add(entity);
          this.game.physics.add(entity.body);
        }
      });
    });
  }

  createPrefabInstance(data) {
    const spritesheet = this.spriteSheets.get(data.sprite);
    const entity = this.game.createEntity(
      data.type,
      data.position[0],
      data.position[1],
      data.size[0],
      data.size[1],
      spritesheet,
      data.options,
      data.physics,
    );

    if (!entity) return null;

    entity.setAnimation(data.defaultAnimation || 'default');

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

  unload() {
    // Call onExit callback if defined
    if (this.config.onExit) {
      this.config.onExit();
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
}