import { createPhysicsWorld } from './physics/index.js';
import { KeyStates } from './keyStates.js';
import { LayerManager } from './layerManager.js';
import { CollisionCategories } from './constants.js';
import { SceneManager } from './sceneManager.js';
import { Camera } from './camera.js';
import { SoundManager } from './soundManager.js';
import { KEY_R, KEY_M } from './keyCodes.js';
import { createRenderer, UIRenderer, DEFAULT_RENDERER, FALLBACK_RENDERER } from './renderers/index.js';
import { computeViewport, mapPointer, sameViewport, viewToUI } from './viewport.js';
import { WorldOverlay } from './ui/worldOverlay.js';

const defaultOptions = {
  renderer: DEFAULT_RENDERER,
  basePath: '',
  levelNames: [],
  currentLevel: null,
  levelsPath: './levels/',
  initialScene: null,
  width: 1280,
  height: 720,
  worldWidth: 1920,
  worldHeight: 1080,
  /**
   * What happens when the display's aspect ratio differs from width:height.
   * 'letterbox' keeps the designed view and adds bars, so nothing past the
   * edge of the designed view is ever revealed; 'expand' widens the view to
   * fill the display, showing more world. The UI fills the display either way.
   * @type {import('./viewport.js').AspectMode}
   */
  aspectMode: 'letterbox',
  /**
   * World render resolution — a fidelity/performance setting, like a game's
   * resolution menu. 'native' matches the display. A `{width, height}` or a
   * scale factor renders the world coarser or finer *without* changing how
   * much world is visible. See `setResolution`.
   */
  resolution: 'native',
  /** 'nearest' keeps pixel art crisp when the world is upscaled. */
  worldFilter: 'linear',
  /** Track the canvas's displayed size and follow it automatically. */
  autoResize: true,
  /**
   * Seconds per physics step. The solver always sees exactly this dt no
   * matter how long a frame took, which is what keeps resting contacts from
   * jittering; the loop runs as many steps as the elapsed time paid for.
   */
  fixedTimestep: 1 / 60,
  /**
   * Most physics steps one frame may run. Bounds catch-up work after a stall
   * so a slow frame cannot cascade into slower ones. Six steps of 1/60s is
   * 0.1s — exactly the cap the loop already clamps a frame's delta to, so an
   * ordinary frame, however slow, is always simulated in full.
   */
  maxSubSteps: 6,
  /**
   * Multiplier on simulated time — 0.5 is slow motion, 2 runs physics at
   * double speed. A game tuned against a faster simulation can set this
   * instead of re-tuning every speed constant.
   */
  physicsTimeScale: 1,
  /**
   * Draw bodies blended between physics steps instead of snapping to the
   * latest one. Without this, a display faster than `fixedTimestep` shows
   * each solver position for several frames and motion visibly stair-steps.
   * Costs up to one step of render latency.
   */
  interpolatePhysics: true,
  sounds: {},
  music: {}
};

function rendererOverrideFromURL() {
  if (typeof location === 'undefined' || !location.search) return null;
  return new URLSearchParams(location.search).get('renderer');
}

export class M2D {
  constructor(canvas, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.constructorOptions = options;
    
    // Initialize renderer backend and its screen-space (UI) view.
    // A `?renderer=<name>` query parameter overrides the option so any
    // example can be viewed with another backend without code changes.
    this.canvas = canvas;
    this.resolution = this.options.resolution;
    this.aspectMode = this.options.aspectMode;
    /** Listeners registered on window/document, torn down by destroy(). */
    this.resizeListeners = [];
    /** Callbacks invoked after every viewport change. */
    this.onResizeHandlers = new Set();
    /**
     * Scene-independent UI drawn above everything each frame (settings menu,
     * debug consoles). Members implement draw() and optionally destroy().
     */
    this.overlays = new Set();
    /** Set by a resize event, applied at the top of the next frame. */
    this.pendingResize = false;

    this.viewport = this.#computeViewport();
    this.renderer = this.#initRenderer(canvas, rendererOverrideFromURL() || this.options.renderer);
    this.uiRenderer = new UIRenderer(this.renderer);

    this.camera = new Camera(this.viewport.viewWidth, this.viewport.viewHeight, {
      worldWidth: this.options.worldWidth,
      worldHeight: this.options.worldHeight,
      lerp: 0.1
    });

    /**
     * Annotations drawn *on* the world rather than in it: debug geometry
     * (ranges, target dots, facing vectors) and world-anchored readouts.
     * Submitted in world coordinates, rasterized in the overlay pass at
     * display resolution, so they stay sharp however coarse the world's
     * render resolution is. See ui/worldOverlay.js.
     */
    this.worldOverlay = new WorldOverlay(this);

    if (this.options.autoResize) this.#watchDisplaySize();

    /**
     * The simulation. Games and actors reach physics only through this; see
     * core/physics/index.js for the contract it implements.
     */
    this.physics = createPhysicsWorld({
      fixedTimestep: this.options.fixedTimestep,
      maxSubSteps: this.options.maxSubSteps,
      timeScale: this.options.physicsTimeScale,
      interpolate: this.options.interpolatePhysics
    });
    this.collisionCategories = CollisionCategories;

    this.entities = new Set();
    this.player = null;
    this.actors = new Map();
    this.isGameOver = false;
    /**
     * While true the engine loop stops simulating — no physics, no entity or
     * camera updates — but keeps drawing, so the frozen frame stays visible
     * under overlays like the settings menu. Toggle it directly; the settings
     * menu's Paused row does. A game that replaces the engine loop honours it
     * itself.
     */
    this.paused = false;
    /**
     * The mounted SettingsMenu, if the game created one. Set by the menu's
     * constructor; scene UI reaches it through the 'settings' button action.
     * @type {import('./ui/settingsMenu.js').SettingsMenu|null}
     */
    this.settings = null;

    this.keys = new KeyStates();
    this.layers = new LayerManager();
    this.layers.setGame(this);
    this.sceneManager = new SceneManager(this);
    this.soundManager = new SoundManager();

    this.keys.addKey(KEY_R);
    this.keys.addKey(KEY_M);

    this.update = this.update.bind(this);
    this.lastTime = 0;
    /** rAF handle, so the loop can be cancelled by destroy(). */
    this.frameHandle = null;
    this.running = false;
  }

  /**
   * Create and initialise the backend. When the *default* backend cannot
   * start (typically no WebGL2), fall back to the Canvas backend with a
   * warning; an explicitly requested backend that fails is an error.
   */
  #initRenderer(canvas, selection) {
    const size = {
      width: this.options.width,
      height: this.options.height,
      viewport: this.viewport,
      worldFilter: this.options.worldFilter
    };
    let renderer = createRenderer(selection);
    try {
      renderer.init(canvas, size);
      return renderer;
    } catch (error) {
      if (selection !== DEFAULT_RENDERER || 'renderer' in (this.constructorOptions || {})) throw error;
      console.warn(`M2D: '${DEFAULT_RENDERER}' renderer unavailable (${error.message}); falling back to '${FALLBACK_RENDERER}'`);
      renderer = createRenderer(FALLBACK_RENDERER);
      renderer.init(canvas, size);
      return renderer;
    }
  }

  // === Display lifecycle ===

  /** Resolve the current display state into a viewport. */
  #computeViewport() {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    return computeViewport({
      displayWidth: this.canvas.clientWidth,
      displayHeight: this.canvas.clientHeight,
      designWidth: this.options.width,
      designHeight: this.options.height,
      pixelRatio: dpr,
      aspectMode: this.aspectMode,
      resolution: this.resolution
    });
  }

  /**
   * Follow the canvas's displayed size, the device pixel ratio and fullscreen
   * transitions.
   *
   * A ResizeObserver is the precise signal (it catches layout changes that
   * never touch the window), with window `resize` as the fallback where it is
   * unavailable. `fullscreenchange` is observed too because entering
   * fullscreen can change the pixel ratio without changing the CSS size.
   */
  #watchDisplaySize() {
    if (typeof window === 'undefined') return;

    const schedule = () => { this.pendingResize = true; };

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(schedule);
      observer.observe(this.canvas);
      this.resizeListeners.push(() => observer.disconnect());
    } else {
      window.addEventListener('resize', schedule);
      this.resizeListeners.push(() => window.removeEventListener('resize', schedule));
    }

    document.addEventListener('fullscreenchange', schedule);
    this.resizeListeners.push(() => document.removeEventListener('fullscreenchange', schedule));

    // A matchMedia query on the current ratio fires exactly when the ratio
    // leaves it (moving the window to another monitor, zooming the page).
    if (typeof window.matchMedia === 'function') {
      let query = null;
      const watchRatio = () => {
        query?.removeEventListener?.('change', onChange);
        const dpr = window.devicePixelRatio || 1;
        query = window.matchMedia(`(resolution: ${dpr}dppx)`);
        query.addEventListener?.('change', onChange);
      };
      const onChange = () => { schedule(); watchRatio(); };
      watchRatio();
      this.resizeListeners.push(() => query?.removeEventListener?.('change', onChange));
    }
  }

  /**
   * Recompute the viewport and push it through the renderer and camera.
   *
   * Safe to call at any time; the engine coalesces display events and calls
   * this at the top of a frame so a resize never lands mid-draw.
   */
  resize(force = false) {
    this.pendingResize = false;
    const viewport = this.#computeViewport();
    // Dropping no-op resizes also breaks the feedback loop a ResizeObserver
    // would otherwise form with the canvas attributes this sets.
    if (!force && sameViewport(viewport, this.viewport)) return;
    this.viewport = viewport;
    this.renderer.setViewport(viewport);
    // The camera's size is the *view* in world units, so it only moves when
    // the aspect ratio does — never when the render resolution changes.
    this.camera.resize(viewport.viewWidth, viewport.viewHeight);

    const scene = this.sceneManager?.getCurrentScene();
    scene?.config?.onResize?.(viewport.viewWidth, viewport.viewHeight, viewport);
    for (const handler of this.onResizeHandlers) {
      handler(viewport.viewWidth, viewport.viewHeight, viewport);
    }
  }

  /**
   * Subscribe to viewport changes, for HUD and layout code that has to
   * recompute positions itself.
   * @param {(width: number, height: number, viewport: object) => void} handler
   * @returns {() => void} Unsubscribe
   */
  onResize(handler) {
    this.onResizeHandlers.add(handler);
    return () => this.onResizeHandlers.delete(handler);
  }

  /**
   * Set the world render resolution — the settings-menu knob.
   *
   * This changes only how many pixels the world is rasterized into. It does
   * *not* change how much world is visible: the camera's view is fixed by the
   * game's design size, so lowering the resolution makes the world coarser,
   * never wider. The UI is unaffected and stays at display resolution.
   *
   * @param {'native'|number|{width?: number, height: number}} resolution -
   *   'native' to match the display, a `{width, height}` preset, or a scale
   *   factor (0.5 renders at half linear resolution).
   */
  setResolution(resolution) {
    this.resolution = resolution;
    this.resize(true);
  }

  /**
   * Choose how the world is filtered when it is upscaled from its render
   * resolution to the screen. `'nearest'` keeps pixel art crisp; `'linear'`
   * (the default) smooths it. Only visible below `'native'`, where there is
   * something to upscale.
   * @param {'linear'|'nearest'} filter
   */
  setWorldFilter(filter) {
    this.options.worldFilter = filter;
    this.renderer.setWorldFilter(filter);
  }

  /** The filter the world is upscaled with. @type {'linear'|'nearest'} */
  get worldFilter() {
    return this.renderer.worldFilter;
  }

  /**
   * Choose what happens when the display's aspect ratio differs from the
   * design aspect: 'letterbox' (bars, nothing extra revealed) or 'expand'
   * (the view widens and more world becomes visible).
   * @param {import('./viewport.js').AspectMode} mode
   */
  setAspectMode(mode) {
    this.aspectMode = mode;
    this.resize(true);
  }

  /** Whether the canvas is currently the fullscreen element. */
  get isFullscreen() {
    return typeof document !== 'undefined' && document.fullscreenElement === this.canvas;
  }

  /**
   * Enter fullscreen on the canvas. The resize lifecycle handles the rest.
   * @returns {Promise<void>}
   */
  async requestFullscreen() {
    await this.canvas.requestFullscreen?.();
  }

  /** Leave fullscreen if this canvas is the fullscreen element. */
  async exitFullscreen() {
    if (this.isFullscreen) await document.exitFullscreen?.();
  }

  /** Enter fullscreen if not in it, otherwise leave. */
  async toggleFullscreen() {
    if (this.isFullscreen) await this.exitFullscreen();
    else await this.requestFullscreen();
  }

  /**
   * Stop the loop and release everything this instance registered: display
   * and input listeners, audio, the renderer's GPU resources and the current
   * scene. After this the instance is inert and holds nothing global.
   */
  destroy() {
    if (this.frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.running = false;
    for (const remove of this.resizeListeners) remove();
    this.resizeListeners = [];
    this.onResizeHandlers.clear();
    // Overlays first: they unregister their own key bindings and listeners,
    // which means reaching back into this.keys while it still exists.
    for (const overlay of [...this.overlays]) overlay.destroy?.();
    this.overlays.clear();
    this.keys.destroy();
    this.soundManager.destroy();
    this.physics.destroy();
    this.sceneManager?.getCurrentScene()?.unload?.();
    this.renderer.destroy();
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

    // Prefabs size every actor as a box, so `shape` only changes which
    // collider that box is filled with: a circle takes its diameter from the
    // width, a capsule is the box it fits inside. Width and height are left
    // off the circle spec on purpose — `createCircle` derives both from the
    // radius, and passing them too would let a non-square prefab end up with
    // a size that disagrees with its collider.
    const material = {
      bodyType: physics.bodyType || 'dynamic',
      angle: physics.angle || 0,
      lockRotation: physics.lockRotation || false,
      isSensor: physics.isSensor || false,
      friction: physics.friction || 0.1,
      frictionAir: physics.frictionAir || 0.01,
      restitution: physics.restitution || 0
    };
    let body;
    if (physics.shape === 'circle') {
      body = this.physics.createCircle({ x, y, radius: width / 2, ...material });
    } else if (physics.shape === 'capsule') {
      body = this.physics.createCapsule({ x, y, width, height, ...material });
    } else {
      body = this.physics.createBox({ x, y, width, height, ...material });
    }

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
      width: this.uiRenderer.width,
      height: this.uiRenderer.height,
      fillStyle: 'rgba(0, 0, 0, 0.7)'
    });
  }

  drawUIText(text, y, fontSize = 24, isBold = false) {
    this.uiRenderer.drawText({
      text,
      x: this.uiRenderer.width / 2,
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
    const midY = this.uiRenderer.height / 2;
    this.drawUIText('Game Over', midY - 40, 48, true);
    this.drawUIText('Press R to restart', midY + 20);
    this.drawUIText('Press M for menu', midY + 60);
    this.uiRenderer.endFrame();
  }

  drawLoading() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground('rgb(0, 0, 0)');
    this.drawUIText('Loading...', this.uiRenderer.height / 2, 64);
    this.uiRenderer.endFrame();
    console.debug('drawing loading');
  }

  drawWorld(currentScene) {
    // Overlay annotations are per-frame submissions made during the world
    // pass below; clearing here (not when they are drawn) means a game loop
    // that never reaches drawOverlays cannot accumulate them across frames.
    this.worldOverlay.clear();
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

  /**
   * Draw scene-independent overlays (e.g. the settings menu) above everything
   * else. The engine loop calls this last every frame; a game that replaces
   * the loop must call it at the end of its own frame.
   */
  drawOverlays() {
    if (this.overlays.size === 0) return;
    this.uiRenderer.beginFrame();
    for (const overlay of this.overlays) overlay.draw();
    this.uiRenderer.endFrame();
  }

  update(currentTime) {
    // Display events are coalesced and applied here, between frames, so a
    // resize can never land in the middle of a draw.
    if (this.pendingResize) this.resize();

    if (!this.lastTime) {
      this.lastTime = currentTime;
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }

    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.renderer.clear('#000');

    if (this.sceneManager.loading) {
      this.drawLoading();
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }

    // Paused: freeze the simulation but keep presenting the frame, so the
    // game stays visible (and crisp at the current settings) behind overlays.
    //
    // Physics advances on its own fixed-step clock, decoupled from the frame
    // rate; entity and camera updates stay per-frame on the real delta, since
    // animation and timers want elapsed wall time, not solver ticks.
    if (!this.paused) this.physics.advance(deltaTime);
    const currentScene = this.sceneManager.getCurrentScene();

    if (!this.isGameOver) {
      if (currentScene) {
        if (!this.paused) {
          this.camera.update();
          currentScene.update(deltaTime);
        }
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

    this.drawOverlays();

    // Update key states at the end of the frame
    this.keys.update();

    this.frameHandle = requestAnimationFrame(this.update);
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
    this.running = true;
    this.update();
  }

  reset() {
    // Collision handlers survive the reset — they belong to the engine, not
    // to the scene being torn down.
    this.physics.reset();

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

  /** Route collisions to the entities involved. Idempotent — it replaces. */
  setupCollisionHandlers() {
    this.physics.setCollisionHandlers({
      onStart: (a, b) => {
        a.entity?.onCollisionStart(b);
        b.entity?.onCollisionStart(a);
      },
      onEnd: (a, b) => {
        a.entity?.onCollisionEnd(b);
        b.entity?.onCollisionEnd(a);
      }
    });
  }

  /**
   * Map a pointer event into both coordinate spaces at once.
   *
   * Mapping through the canvas's bounding rect alone is wrong: CSS letterboxes
   * the canvas (`object-fit: contain`), so the rect can be larger than the
   * drawn pixels, and the world occupies only its content rect inside those.
   * @param {MouseEvent} event
   */
  #mapPointer(event) {
    return mapPointer({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: this.canvas.getBoundingClientRect(),
      viewport: this.viewport
    });
  }

  /**
   * Pointer position in world coordinates.
   * @param {MouseEvent} event
   * @returns {{x: number, y: number}}
   */
  getMousePosition(event) {
    const { view } = this.#mapPointer(event);
    return this.camera.screenToWorld(view.x, view.y);
  }

  /**
   * Pointer position in UI coordinates — the space UI elements and hit
   * testing use.
   * @param {MouseEvent} event
   * @returns {{x: number, y: number}}
   */
  getUIPosition(event) {
    return this.#mapPointer(event).ui;
  }

  /**
   * Project a world position into UI coordinates: where that point sits in
   * the space UI elements are drawn and hit-tested in. The inverse direction
   * of `getMousePosition`, for pinning screen-space content (labels, markers,
   * off-screen indicators) to a world object.
   * @param {number} x - World X
   * @param {number} y - World Y
   * @returns {{x: number, y: number}}
   */
  worldToUI(x, y) {
    const view = this.camera.worldToScreen(x, y);
    return viewToUI({ x: view.x, y: view.y, viewport: this.viewport });
  }
} 