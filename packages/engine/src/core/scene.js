import { SpriteSheet } from './spriteSheet.js';
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
              anim.frames.forEach(([tileX, tileY]) => {
                sheet.define(name, tileX, tileY);
              });
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

    if (this.config.world) {
      if (this.config.world.gravity) {
        this.game.physics.setGravity(this.config.world.gravity);
      }
    }

    if (this.config.background) {
      this.setupBackground(this.config.background);
    }
  }

  /**
   * Tile one spritesheet frame across the world as a background layer.
   *
   * @param {Object} background - `{ spritesheet, tileX, tileY }`; the loader
   *   has already checked the spritesheet exists.
   */
  setupBackground({ spritesheet, tileX = 0, tileY = 0 }) {
    const spriteSheet = this.spriteSheets.get(spritesheet);
    const tileSize = this.config.assets.spritesheets[spritesheet].frameWidth;

    spriteSheet.define('default', tileX, tileY);
    // The layer's tiles live at fixed world coordinates and draw under the
    // camera, so the background tiles the *world* — a size in world units,
    // independent of the display, the render resolution and resizes.
    const tileCountX = Math.ceil(this.game.options.worldWidth / tileSize);
    const tileCountY = Math.ceil(this.game.options.worldHeight / tileSize);

    const bgLayer = this.game.layers.constructLayer(spriteSheet, tileCountX, tileCountY, tileSize, { anim: 'default' });
    this.game.layers.addLayer('background', bgLayer);
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

    this.sprites.clear();
    this.spriteSheets.clear();
    this.ui.clear();

    // Reset cursor style
    this.game.renderer.setCursor('default');

    // The elements the router was hit-testing no longer exist.
    this.game.input.setUIContainer(null);
  }

  update(deltaTime) {
    if (this.config.type === 'level') {
      // Physics is stepped once per frame by the engine loop, on its own
      // fixed-step clock. This runs the entity-side update that follows it.
      if (this.game.player && 
          this.game.player.body.position.y > this.game.options.worldHeight + 50) {
        console.log('Game Over!');
        this.game.gameOver();
        return;
      }

      // The camera is updated by the engine loop before this runs.
      this.game.entities.forEach(entity => entity.update(deltaTime));
    }

    // Scene-level simulation that is not an entity (bulk effects, directors).
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
    if (this.config.type === 'level') {
      // Draw background
      this.game.layers.drawLayer('background');

      // Draw entities
      this.game.entities.forEach(entity => entity.draw(deltaTime));
    }

    // World-space drawing that does not belong to an entity. Runs inside the
    // world pass, after entities, with the camera transform applied.
    if (this.config.onDraw) {
      this.config.onDraw(deltaTime);
    }
  }

  drawUI(deltaTime) {
    this.ui.drawTree(deltaTime);
  }
}