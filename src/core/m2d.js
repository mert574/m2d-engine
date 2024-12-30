import Matter from 'matter-js';
import { KeyStates } from './keyStates.js';
import { LayerManager } from './layerManager.js';
import { CollisionCategories } from './constants.js';
import { SceneManager } from './sceneManager.js';
import { Camera } from './camera.js';
import { SoundManager } from './soundManager.js';
import { KEY_R, KEY_M, KEY_D } from './keyCodes.js';
import { CanvasRenderer } from './renderers/canvasRenderer.js';
import { CanvasUIRenderer } from './renderers/canvasUIRenderer.js';

const defaultOptions = {
  basePath: '',
  levelNames: [],
  currentLevel: null,
  levelsPath: './levels/',
  initialScene: null,
  width: 1280,
  height: 720,
  worldWidth: 1920,
  worldHeight: 1080,
  sounds: {},
  music: {}
};

export class M2D {
  constructor(canvas, options = {}) {
    this.options = { ...defaultOptions, ...options };
    
    // Initialize renderers
    this.renderer = new CanvasRenderer();
    this.uiRenderer = new CanvasUIRenderer();
    this.renderer.init(canvas, {
      width: this.options.width,
      height: this.options.height
    });
    this.uiRenderer.init(canvas, {
      width: this.options.width,
      height: this.options.height
    });
    
    // For backward compatibility
    this.canvas = canvas;
    this.context = this.renderer.getContext();
    
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    
    this.camera = new Camera(this.options.width, this.options.height, {
      worldWidth: this.options.worldWidth,
      worldHeight: this.options.worldHeight,
      smoothing: 0.1
    });

    this.engine = Matter.Engine.create();
    this.collisionCategories = CollisionCategories;
    this.Body = Matter.Body;
    this.Bodies = Matter.Bodies;

    this.entities = new Set();
    this.player = null;
    this.actors = new Map();
    this.isGameOver = false;

    this.keys = new KeyStates();
    this.layers = new LayerManager();
    this.layers.setGame(this);
    this.sceneManager = new SceneManager(this);
    this.soundManager = new SoundManager();

    this.keys.addKey(KEY_R);
    this.keys.addKey(KEY_M);
    this.keys.addKey(KEY_D);

    this.update = this.update.bind(this);
    this.lastTime = 0;
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.resize(width, height);
    this.uiRenderer.resize(width, height);
  }

  registerActor(type, ActorClass) {
    this.actors.set(type, ActorClass);
  }

  createEntity(type, x, y, width, height, spritesheet, options = {}, physics = {}) {
    const ActorClass = this.actors.get(type);
    if (!ActorClass) {
      console.error(`Actor type not registered: ${type}`);
      return null;
    }

    console.debug(`Creating ${type} at ${x}, ${y} with size ${width}x${height}`);

    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: physics.bodyType === 'static',
      isSensor: physics.isSensor || false,
      friction: physics.friction || 0.1,
      frictionStatic: physics.frictionStatic || 0.5,
      frictionAir: physics.frictionAir || 0.01,
      restitution: physics.restitution || 0
    });

    body.entity = null;  // Will be set in the constructor

    const entity = new ActorClass(
      body,
      spritesheet,
      this,
      options
    );

    body.entity = entity;
    return entity;
  }

  gameOver() {
    this.isGameOver = true;
    this.soundManager.playSound('gameOver');
  }

  drawUIBackground() {
    this.uiRenderer.drawRect({
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height,
      fillStyle: 'rgba(0, 0, 0, 0.7)'
    });
  }

  drawUIText(text, y, fontSize = 24, isBold = false) {
    this.uiRenderer.drawText({
      text,
      x: this.canvas.width / 2,
      y,
      fillStyle: '#fff',
      fontSize: `${fontSize}px`,
      fontFamily: 'system-ui',
      fontWeight: isBold ? 'bold' : 'normal',
      textAlign: 'center',
      textBaseline: 'middle'
    });
  }

  drawGameOver() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground();
    this.drawUIText('Game Over', this.canvas.height / 2 - 40, 48, true);
    this.drawUIText('Press R to restart', this.canvas.height / 2 + 20);
    this.drawUIText('Press M for menu', this.canvas.height / 2 + 60);
    this.uiRenderer.endFrame();
  }

  drawLoading() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground('rgb(0, 0, 0)');
    this.drawUIText('Loading...', this.canvas.height / 2, 64);
    this.uiRenderer.endFrame();
    console.debug('drawing loading');
  }

  drawWorld(currentScene) {
    this.renderer.beginFrame();
    this.renderer.applyCamera(this.camera);
    currentScene.draw();
    this.renderer.endFrame();
  }

  drawUI(currentScene) {
    this.uiRenderer.beginFrame();
    currentScene.drawUI();
    this.uiRenderer.endFrame();
  }

  update(currentTime) {
    if (!this.lastTime) {
      this.lastTime = currentTime;
      requestAnimationFrame(this.update);
      return;
    }

    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.renderer.clear('#000');

    if (this.keys.isJustPressed(KEY_D)) {
      this.renderer.setDebugEnabled(!this.renderer.isDebugEnabled());
    }

    if (this.sceneManager.loading) {
      this.drawLoading();
      requestAnimationFrame(this.update);
      return;
    }

    Matter.Engine.update(this.engine, deltaTime * 1000, 1);
    const currentScene = this.sceneManager.getCurrentScene();

    if (!this.isGameOver) {
      if (currentScene) {
        this.camera.update();
        currentScene.update(deltaTime);
        this.drawWorld(currentScene);
        this.drawUI(currentScene);
      }
    } else {
      if (currentScene) {
        this.drawWorld(currentScene);
      }
      this.drawGameOver();

      if (this.keys.pressedKeys().has(KEY_R)) {
        this.isGameOver = false;
        this.reset();
        currentScene.load();
      } else if (this.keys.pressedKeys().has(KEY_M)) {
        this.isGameOver = false;
        this.reset();
        this.sceneManager.switchTo('mainMenu');
      }
    }

    // Update key states at the end of the frame
    this.keys.update();

    requestAnimationFrame(this.update);
  }

  async start() {
    this.drawLoading();

    Object.entries(this.options.sounds || {}).forEach(
      ([key, file]) => this.soundManager.loadSound(key, file)
    );
    Object.entries(this.options.music || {}).forEach(
      ([key, file]) => this.soundManager.loadMusic(key, file)
    );

    if (this.options.initialScene) {
      await this.sceneManager.switchTo(this.options.initialScene);
    } else if (this.options.currentLevel) {
      await this.sceneManager.switchTo(this.options.currentLevel);
    }

    this.setupCollisionHandlers();
    this.update();
  }

  reset() {
    Matter.Events.off(this.engine);
    Matter.World.clear(this.engine.world);
    Matter.Engine.clear(this.engine);
    Matter.Composite.clear(this.engine.world);

    this.engine.world = Matter.World.create();
    this.engine = null;
    this.engine = Matter.Engine.create();

    this.entities.clear();
    this.layers.clear();
    this.player = null;
    this.lastTime = 0;

    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.target = null;

    this.setupCollisionHandlers();
    this.soundManager.stopMusic();
  }

  setupCollisionHandlers() {
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
  }

  getMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return this.camera.screenToWorld(
      screenX * scaleX,
      screenY * scaleY
    );
  }
} 