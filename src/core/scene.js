import { SpriteSheet } from './spriteSheet.js';
import { Container } from './ui/container.js';
import { MovingPlatform } from '../actors/movingPlatform.js';
import { UIButton } from './ui/button.js';
import { UIText } from './ui/text.js';
import { UIImage } from './ui/Image.js';
import { UIRectangle } from './ui/Rectangle.js';
import { PerformanceStats } from './ui/performanceStats.js';

export class Scene {
  constructor(game, config) {
    this.game = game;
    this.config = config;
    this.sprites = new Map();
    this.spriteSheets = new Map();
    this.ui = new Container(game);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
  }

  _handleMouseMove(event) {
    const { x, y } = this.game.getUIPosition(event);
    this.ui.onMouseMove(x, y);
  }

  _handleMouseDown(event) {
    const { x, y } = this.game.getUIPosition(event);
    this.ui.onMouseDown(x, y);
  }

  async load() {
    await this.loadAssets();
    this.setupScene();
    
    this.game.canvas.addEventListener('mousemove', this._handleMouseMove);
    this.game.canvas.addEventListener('mousedown', this._handleMouseDown);

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

    // Anchored to the bottom-left so it sits at the *real* screen corner at
    // any aspect ratio, and stays clear of game HUDs, which conventionally
    // occupy the top of the screen.
    const stats = new PerformanceStats(this.game, 20, -34, {
      anchor: 'bottom-left',
      textColor: '#00ff00',
      show: true
    });
    this.ui.addElement(stats);

    if (this.config.world) {
      this.game.physics.clearContacts();

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
          physics: prefab.physics,
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
      switch (element.type) {
        case 'button':
          const button = new UIButton(
            element.x,
            element.y,
            element.properties.width || 200,
            element.properties.height || 40,
            element.properties.text,
            () => this.#runButtonAction(element.properties),
            {
              backgroundColor: element.properties.backgroundColor,
              hoverColor: element.properties.hoverColor,
              textColor: element.properties.textColor,
              fontSize: element.properties.fontSize,
              fontFamily: element.properties.fontFamily,
              anchor: element.anchor
            }
          );
          button.setGame(this.game);
          this.ui.addElement(button);
          break;

        case 'text':
          const text = new UIText(
            element.x,
            element.y,
            element.properties.text,
            {
              fontSize: element.properties.fontSize,
              color: element.properties.color,
              align: element.properties.align,
              anchor: element.anchor
            }
          );
          text.setGame(this.game);
          this.ui.addElement(text);
          break;

        case 'image':
          if (element.sprite) {
            const sprite = this.sprites.get(element.sprite);
            const image = new UIImage(
              element.x,
              element.y,
              sprite,
              {
                width: element.properties.width,
                height: element.properties.height,
                scale: element.properties.scale,
                anchor: element.anchor
              }
            );
            image.setGame(this.game);
            this.ui.addElement(image);
          }
          break;

        case 'rect':
          const rect = new UIRectangle(
            element.x,
            element.y,
            element.width,
            element.height,
            element.color,
            {
              interactive: element.properties?.interactive || false,
              fill: element.fill || false,
              anchor: element.anchor
            }
          );
          rect.setGame(this.game);
          this.ui.addElement(rect);
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

    // Remove event listeners
    this.game.canvas.removeEventListener('mousemove', this._handleMouseMove);
    this.game.canvas.removeEventListener('mousedown', this._handleMouseDown);
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

    this.ui.update(deltaTime);
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
    this.ui.draw(deltaTime);
  }
}