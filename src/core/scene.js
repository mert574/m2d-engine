import Matter from 'matter-js';
import { SpriteSheet } from './spriteSheet.js';
import { Container } from './ui/Container.js';

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

  async loadAssets() {
    if (!this.config.sprites) return;

    const loadPromises = this.config.sprites.map(([path, tileSize]) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.sprites.set(path, img);
          resolve();
        };
        img.onerror = () => reject(new Error(`Failed to load sprite: ${path}`));
        img.src = path;
      });
    });

    try {
      await Promise.all(loadPromises);
      this.config.sprites.forEach(([path, tileSize]) => {
        const img = this.sprites.get(path);
        if (img) {
          this.spriteSheets.set(path, new SpriteSheet(img, tileSize, tileSize));
        }
      });
    } catch (error) {
      console.error('Error loading assets:', error);
      throw error;
    }
  }

  async load() {
    await this.loadAssets();

    this.game.entities.clear();
    Matter.Composite.clear(this.game.engine.world);
    this.game.layers.clear();
    this.game.player = null;
    this.ui.clear();

    this.game.canvas.addEventListener('mousemove', this._handleMouseMove);
    this.game.canvas.addEventListener('mousedown', this._handleMouseDown);

    if (this.config.type === 'level') {
      await this._loadLevelScene();
      if (this.game.player) {
        this.game.camera.follow(this.game.player);
      }
    } else {
      await this._loadNormalScene();
    }

    if (this.config.onEnter) {
      this.config.onEnter();
    }
  }

  async _loadLevelScene() {
    let levelData;
    
    if (typeof this.config.levelData === 'string') {
      levelData = await this.game.sceneManager.loadLevelData(this.config.levelData);
    } else if (typeof this.config.levelData === 'object') {
      levelData = this.config.levelData;
    }

    if (!levelData) {
      console.error('Failed to load level data');
      return;
    }

    this._setPhysics(levelData.gameType);
    this.config.sprites = levelData.sprites;
    await this.loadAssets();

    if (levelData.background) {
      this._loadBackground(levelData.background);
    }

    if (levelData.entities) {
      this._loadEntities(levelData.entities);
    }

    if (levelData.player) {
      const player = this.createEntity(levelData.player);
      if (player) {
        this.game.player = player;
        Matter.Composite.add(this.game.engine.world, player.body);
      }
    }
  }

  async _loadNormalScene() {
    this._setPhysics(this.config.gameType);

    if (this.config.background) {
      this._loadBackground(this.config.background);
    }

    if (this.config.entities) {
      this._loadEntities(this.config.entities);
    }
  }

  _setPhysics(gameType) {
    this.game.engine.world.gravity.y = gameType === 'topDown' ? 0 : 2;
  }

  _loadBackground([spriteIndex, x, y]) {
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

  _loadEntities(entities) {
    for (const entityData of entities) {
      const entity = this.createEntity(entityData);
      if (entity) {
        this.game.entities.add(entity);
        Matter.Composite.add(this.game.engine.world, entity.body);
      }
    }
  }

  createEntity(data) {
    const { type, position: [x, y], size: [w, h], sprite: spriteIndex, animations = [], options = {} } = data;
    const ActorClass = this.game.actors.get(type);
    if (!ActorClass) {
      console.error(`Actor type "${type}" not registered`);
      return null;
    }

    const [imagePath, tileSize] = this.config.sprites[spriteIndex];
    const spriteSheet = this.spriteSheets.get(imagePath);
    if (!spriteSheet) {
      console.error(`Sprite not found: ${imagePath}`);
      return null;
    }

    const entitySprite = new SpriteSheet(spriteSheet.image, tileSize, tileSize, w, h);

    const category = this.game.collisionCategories[type] || this.game.collisionCategories.default;
    let mask;

    switch (type) {
      case 'platform':
      case 'movingPlatform':
        mask = this.game.collisionCategories.player | this.game.collisionCategories.enemy;
        break;
      case 'bee':
        mask = this.game.collisionCategories.platform | 
              this.game.collisionCategories.movingPlatform | 
              this.game.collisionCategories.player;
        break;
      case 'player':
        mask = this.game.collisionCategories.platform | 
              this.game.collisionCategories.movingPlatform | 
              this.game.collisionCategories.enemy | 
              this.game.collisionCategories.coin |
              this.game.collisionCategories.trigger;
        break;
      case 'coin':
      case 'trigger':
        mask = this.game.collisionCategories.player;
        break;
      default:
        mask = -1;
    }

    const bodyOptions = {
      frictionAir: 0.01,
      friction: 0.1,
      restitution: 0.1,
      collisionFilter: { category, mask },
      ...options
    };

    const body = this.game.Bodies.rectangle(x, y, w, h, bodyOptions);
    const entity = new ActorClass(this.game.context, body, entitySprite, this.game, options);

    body.entity = entity;
    console.debug(`Created ${type} entity:`, body.entity);

    for (const [name, tileX, tileY, isDefault] of animations) {
      entity.sprite.define(name, tileX, tileY);
      if (isDefault) {
        entity.currentAnim = name;
      }
    }

    return entity;
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
    }

    if (this.game.player?.update) {
      this.game.player.update(deltaTime);
    }

    for (let entity of this.game.entities) {
      if (entity.update) {
        entity.update(deltaTime);
      }
    }

    this.ui.update(deltaTime);
  }

  draw(deltaTime) {
    this.game.renderer.drawWorld(ctx => {
      ctx.fillStyle = this.config.backgroundColor || '#000';
      ctx.fillRect(
        this.game.camera.x,
        this.game.camera.y,
        this.game.camera.width,
        this.game.camera.height
      );

      this.game.layers.draw(deltaTime);
      
      if (this.game.player) {
        this.game.player.draw(deltaTime);
      }

      for (let elem of this.game.entities) {
        const pos = elem.body.position;
        const bounds = elem.body.bounds;
        const width = bounds.max.x - bounds.min.x;
        const height = bounds.max.y - bounds.min.y;
        
        if (this.game.camera.isVisible(pos.x - width/2, pos.y - height/2, width, height)) {
          elem.draw(deltaTime);
        }
      }
    });

    this.game.renderer.drawScreen(ctx => {
      this.ui.draw(ctx);
    });
  }

  unload() {
    if (this.config.onExit) {
      this.config.onExit();
    }

    this.spriteSheets.clear();
    this.ui.clear();

    this.game.canvas.removeEventListener('mousemove', this._handleMouseMove);
    this.game.canvas.removeEventListener('mousedown', this._handleMouseDown);
  }
}