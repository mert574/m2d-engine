import Matter from 'matter-js';
import { KeyStates } from './keyStates.js';
import { LayerManager } from './layerManager.js';
import { LevelManager } from './levelManager.js';
import { Entity } from './entity.js';
import { SpriteSheet } from './spriteSheet.js';
import { CollisionCategories } from './constants.js';

const defaultOptions = {
  levelNames: [],
  currentLevel: null,
  levelsPath: './levels/'
};

const defaultEntityOptions = {
  frictionAir: 0.01,
  friction: 0.1,
  restitution: 0.1
};

export class M2D {
  constructor(canvas, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Create engine with optimized settings
    this.engine = Matter.Engine.create({
      positionIterations: 4,
      velocityIterations: 4,
      constraintIterations: 2,
      enableSleeping: true
    });

    this.collisionCategories = CollisionCategories;

    this.Body = Matter.Body;
    this.Bodies = Matter.Bodies;

    // Set up collision event handling
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        if (bodyA.entity) bodyA.entity.onCollisionStart(bodyB);
        if (bodyB.entity) bodyB.entity.onCollisionStart(bodyA);
      });
    });

    Matter.Events.on(this.engine, 'collisionEnd', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        if (bodyA.entity) bodyA.entity.onCollisionEnd(bodyB);
        if (bodyB.entity) bodyB.entity.onCollisionEnd(bodyA);
      });
    });

    this.entities = new Set();
    this.player = null;
    this.actors = new Map();
    this.currentLevel = null;
    this.isGameOver = false;

    this.keys = new KeyStates();
    this.layers = new LayerManager(this.context);
    this.levelManager = new LevelManager(this);

    // Register restart key
    this.keys.addKey(82); // 'R' key

    this.update = this.update.bind(this);
    this.lastTime = 0;
  }

  registerActor(type, ActorClass) {
    this.actors.set(type, ActorClass);
  }

  createActor(data) {
    const { type, position: [x, y], size: [w, h], sprite: spriteIndex, animations = [], options = {} } = data;
    const ActorClass = this.actors.get(type);
    if (!ActorClass) {
      console.error(`Actor type "${type}" not registered`);
      return null;
    }

    const sprite = this.currentLevel.sprites[spriteIndex];
    const [img, tileSize] = sprite;

    // Set collision filters based on type
    const category = this.collisionCategories[type] || this.collisionCategories.default;
    let mask;

    switch (type) {
      case 'platform':
        mask = this.collisionCategories.player | this.collisionCategories.enemy;
        break;
      case 'bee':
        mask = this.collisionCategories.platform | this.collisionCategories.player;
        break;
      case 'player':
        mask = this.collisionCategories.platform | this.collisionCategories.enemy;
        break;
      default:
        mask = -1; // Collide with everything
    }

    const bodyOptions = {
      ...defaultEntityOptions,
      ...options,
      collisionFilter: {
        category: category,
        mask: mask
      }
    };

    const body = this.Bodies.rectangle(x, y, w, h, bodyOptions);
    const spriteSheet = new SpriteSheet(img, tileSize, tileSize, w, h);

    // Create actor instance
    const entity = new ActorClass(this.context, body, spriteSheet, this);

    // Set up animations
    for (const [name, tileX, tileY, isDefault] of animations) {
      entity.sprite.define(name, tileX, tileY);
      if (isDefault) {
        entity.currentAnim = name;
      }
    }

    // Store reference to entity on the body for collision handling
    body.entity = entity;

    return entity;
  }

  parseLevel(level) {
    this.currentLevel = level;

    if (level.gameType === 'topDown') {
      this.engine.world.gravity.y = 0;
      defaultEntityOptions.frictionAir = 0.2;
    } else {
      this.engine.world.gravity.y = 1;
      defaultEntityOptions.frictionAir = 0.01;
    }

    if (level.background) {
      const [i, x, y] = level.background;
      const image = level.sprites[i][0];
      const tileSize = level.sprites[i][1];
      const tileCountX = Math.ceil(this.width / tileSize);
      const tileCountY = Math.ceil(this.height / tileSize);

      const sprite = new SpriteSheet(image, tileSize, tileSize);
      sprite.define('default', x, y);

      const bgLayer = this.layers.constructLayer(sprite, tileCountX, tileCountY, tileSize, { anim: 'default' });
      this.layers.addLayer('background', bgLayer);
    }

    // Parse entities
    for (const entityData of level.entities) {
      const entity = this.createActor(entityData);
      if (entity) {
        this.entities.add(entity);
        Matter.Composite.add(this.engine.world, entity.body);
      }
    }

    // Parse player
    const player = this.createActor(level.player);
    if (player) {
      this.player = player;
      Matter.Composite.add(this.engine.world, player.body);
    }
  }

  beforeUpdate(deltaTime) { }
  afterUpdate(deltaTime) { }

  gameOver() {
    this.isGameOver = true;
  }

  drawGameOver() {
    this.context.save();
    this.context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.context.fillRect(0, 0, this.width, this.height);

    this.context.fillStyle = '#fff';
    this.context.font = '48px Arial';
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    this.context.fillText('Game Over', this.width / 2, this.height / 2);

    this.context.font = '24px Arial';
    this.context.fillText('Press R to restart', this.width / 2, this.height / 2 + 50);
    this.context.restore();
  }

  update(currentTime) {
    if (!this.lastTime) {
      this.lastTime = currentTime;
      requestAnimationFrame(this.update);
      return;
    }

    // Calculate deltaTime in seconds
    let deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Clamp deltaTime between 1/120 and 1/30 seconds
    deltaTime = Math.max(1 / 120, Math.min(deltaTime, 1 / 30));

    // Clear screen
    this.context.fillStyle = '#000';
    this.context.fillRect(0, 0, this.width, this.height);

    this.beforeUpdate(deltaTime);

    if (!this.isGameOver) {
      if (this.player?.update) {
        this.player.update(deltaTime);
      }
      for (let entity of this.entities) {
        if (entity.update) {
          entity.update(deltaTime);
        }
      }

      Matter.Engine.update(this.engine, deltaTime * 1000);

      // Draw
      this.layers.draw(deltaTime);

      if (this.player) {
        this.player.draw(deltaTime);
      }
      for (let elem of this.entities) {
        elem.draw(deltaTime);
      }
    } else if (this.keys.pressedKeys().has(82)) { // Check for 'R' key
      this.isGameOver = false;
      this.reset();
      return;
    }

    if (this.isGameOver) {
      this.drawGameOver();
    }

    this.afterUpdate(deltaTime);
    requestAnimationFrame(this.update);
  }

  start() {
    const waitUntilLoaded = () => {
      if (this.levelManager.currentLevel) {
        this.levelManager.loadLevel(this.levelManager.currentLevel).then(level => {
          this.parseLevel(level);
          this.update();
        });
      } else {
        requestAnimationFrame(waitUntilLoaded);
      }
    }

    waitUntilLoaded();
  }

  reset() {
    Matter.Composite.clear(this.engine.world);
    Matter.Engine.clear(this.engine);
    this.entities.clear();
    this.layers.clear();
    this.lastTime = 0;
    this.start();
  }
} 