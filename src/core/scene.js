import Matter from 'matter-js';
import { SpriteSheet } from './spriteSheet.js';
import { Container } from './ui/container.js';

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
    const rect = this.game.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.game.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.game.canvas.height / rect.height);
    this.ui.onMouseMove(x, y);
  }

  _handleMouseDown(event) {
    const rect = this.game.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.game.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.game.canvas.height / rect.height);
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
        const img = new Image();
        img.onload = () => {
          const sheet = new SpriteSheet(img, spritesheet.frameWidth, spritesheet.frameHeight);
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
          reject(new Error(`Failed to load sprite: ${spritesheet.url}`));
        };
        img.src = spritesheet.url;
      })
    );

    try {
      await Promise.all(loadPromises);
    } catch (error) {
      console.error('Error loading sprites:', error);
    }
  }

  setupScene() {
    this.game.entities.clear();
    Matter.Composite.clear(this.game.engine.world);
    this.game.layers.clear();
    this.game.player = null;
    this.ui.clear();

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
          if (prefab.actor === 'Player') {
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
          this.ui.addButton(element.x, element.y, element.properties.text, () => {
            if (element.properties.onClick) {
              this.game.sceneManager.switchTo(element.properties.onClick);
            }
          });
          break;

        case 'text':
          this.ui.addText(element.x, element.y, element.properties.text, {
            fontSize: element.properties.fontSize,
            color: element.properties.color,
            align: element.properties.align
          });
          break;

        case 'image':
          if (element.sprite) {
            const sprite = this.sprites.get(element.sprite);
            this.ui.addImage(element.x, element.y, sprite);
          }
          break;

        case 'rect':
          this.ui.addRect(element.x, element.y, element.width, element.height, element.color);
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

    // Remove event listeners
    this.game.canvas.removeEventListener('mousemove', this._handleMouseMove);
    this.game.canvas.removeEventListener('mousedown', this._handleMouseDown);
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
      this.game.renderer.drawWorld(ctx => {
        ctx.fillStyle = '#000';

        ctx.save();
        ctx.translate(
          -this.game.camera.x + this.game.camera.width / 2,
          -this.game.camera.y + this.game.camera.height / 2
        );

        this.game.layers.draw(ctx, deltaTime);

        this.game.entities.forEach(entity => {
          if (entity !== this.game.player) {
            entity.draw(ctx, deltaTime);
          }
        });

        if (this.game.player) {
          this.game.player.draw(ctx, deltaTime);
        }

        ctx.restore();
      });
    } else {
      this.game.renderer.drawWorld(ctx => {
        ctx.fillStyle = this.config.backgroundColor || '#000';
        ctx.fillRect(0, 0, this.game.renderer.worldBuffer.width, this.game.renderer.worldBuffer.height);
      });
    }

    this.game.renderer.drawScreen(ctx => {
      this.ui.draw(ctx);
    });
  }
}