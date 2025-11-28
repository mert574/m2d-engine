import Matter from 'matter-js';
import { SpriteSheet } from './spriteSheet.js';
import { Container } from './ui/container.js';
import { MovingPlatform } from '../actors/movingPlatform.js';
import { UIButton } from './ui/Button.js';
import { UIText } from './ui/Text.js';
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
    const rect = this.game.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.ui.onMouseMove(x, y);
  }

  _handleMouseDown(event) {
    const rect = this.game.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.ui.onMouseDown(x, y);
  }

  async load() {
    await this.loadAssets();
    this.setupScene();
    
    this.game.container.addEventListener('mousemove', this._handleMouseMove);
    this.game.container.addEventListener('mousedown', this._handleMouseDown);

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
    Matter.Composite.clear(this.game.engine.world);
    this.game.layers.clear();
    this.game.player = null;
    this.ui.clear();

    const stats = new PerformanceStats(this.game, 20, 20, { textColor: '#00ff00', show: true });
    this.ui.addElement(stats);

    if (this.config.world) {
      Matter.Engine.clear(this.game.engine);
      Matter.Engine.update(this.game.engine, 0);
      
      if (this.config.world.gravity) {
        this.game.engine.gravity = this.config.world.gravity;
      }
    }

    if (this.config.background) {
      this.setupBackground(this.config.background);
    }
  }

  setupBackground([spriteIndex, x, y]) {
    const [imagePath, tileSize] = this.config.sprites[spriteIndex];
    const spriteSheet = this.spriteSheets.get(imagePath);
    if (!spriteSheet) {
      console.error(`Sprite not found: ${imagePath}`);
      return;
    }

    spriteSheet.define('default', x, y);
    const tileCountX = Math.ceil(this.game.width / tileSize);
    const tileCountY = Math.ceil(this.game.height / tileSize);

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
          Matter.Composite.add(this.game.engine.world, entity.body);
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
            () => {
              if (element.properties.onClick) {
                this.game.sceneManager.switchTo(element.properties.onClick);
              }
            },
            {
              backgroundColor: element.properties.backgroundColor,
              hoverColor: element.properties.hoverColor,
              textColor: element.properties.textColor,
              fontSize: element.properties.fontSize,
              fontFamily: element.properties.fontFamily
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
              align: element.properties.align
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
                scale: element.properties.scale
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
              interactive: element.properties?.interactive || false
            }
          );
          rect.setGame(this.game);
          this.ui.addElement(rect);
          break;
      }
    });
  }

  unload() {
    this.game.container.removeEventListener('mousemove', this._handleMouseMove);
    this.game.container.removeEventListener('mousedown', this._handleMouseDown);

    if (this.config.onExit) {
      this.config.onExit();
    }

    this.sprites.clear();
    this.spriteSheets.clear();
    this.ui.clear();

    // Reset cursor style
    this.game.renderer.setCursor('default');
  }

  update(deltaTime) {
    if (this.config.type === 'level') {
      Matter.Engine.update(this.game.engine, deltaTime * 1000);

      if (this.game.player && 
          this.game.player.body.position.y > this.game.options.worldHeight + 50) {
        console.log('Game Over!');
        this.game.gameOver();
        return;
      }

      this.game.camera.update();
      this.game.entities.forEach(entity => entity.update(deltaTime));
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
  }

  drawUI(deltaTime) {
    this.ui.draw(deltaTime);
  }
}