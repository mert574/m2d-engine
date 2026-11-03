import { createPhysicsWorld } from './physics/index.js';
import { InputManager } from './input/index.js';
import { LayerManager } from './layerManager.js';
import { CollisionCategories } from './constants.js';
import { SceneManager } from './sceneManager.js';
import { Camera } from './camera.js';
import { SoundManager } from './soundManager.js';
import { createRenderer, UIRenderer, DEFAULT_RENDERER, FALLBACK_RENDERER } from './renderers/index.js';
import { computeViewport, sameViewport, viewToUI } from './viewport.js';
import { WorldOverlay } from './ui/worldOverlay.js';
import { Theme, createTheme } from './ui/theme.js';
import { loadUIFonts } from './ui/fonts.js';
import { ScreenStack } from './ui/screenStack.js';
import { MotionManager } from './ui/motion.js';
import { CVarRegistry } from './console/cvars.js';
import { CommandRegistry, registerBuiltins } from './console/commands.js';
import { DevConsole } from './console/devConsole.js';
import { PerformanceStats } from './ui/performanceStats.js';

/** Restart and menu keys on the game-over screen, by physical key code. */
const KEY_RESTART = 'KeyR';
const KEY_MENU = 'KeyM';



const defaultOptions = {
  renderer: DEFAULT_RENDERER,
  basePath: '',
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
   * Confine the pointer to the canvas and draw a virtual cursor instead of
   * the system one. Off by default; a full-screen game that wants the
   * pointer kept inside the play area opts in. Locking needs a user
   * gesture, so the engine acquires it on a press and re-acquires after the
   * player presses Escape. See core/input/cursor.js.
   */
  pointerLock: false,
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
  /**
   * Show the frame-rate and draw-call readout in the engine's debug layer.
   * Turn it off for a game that draws its own HUD or embeds in a page.
   */
  performanceStats: true,
  /**
   * Physical key code that expands the readout into the full counter list.
   * F3 by convention, and the engine suppresses the browser's own handling
   * of it (find-in-page) because it consumes the press. `null` binds no key.
   */
  performanceStatsHotkey: 'F3',
  /**
   * Mount the developer console, toggled with backquote: cvars, commands,
   * history, completion, and the engine's own logs. `false` for a release
   * that should not ship a console; the cvar and command registries exist
   * either way, since the settings menu is a view onto them.
   */
  devConsole: true,
  /**
   * Scope for persisted settings (cvars with `persist`), so two games on one
   * origin keep separate values. Defaults to the page's pathname.
   */
  saveId: null,
  /**
   * Design tokens for every piece of UI — colours, type, spacing, radii,
   * motion. A partial token tree is merged over the engine's default, so
   * `{ color: { accent: { default: '#f60' } } }` restyles every button,
   * panel and readout without touching a component. Pass a `Theme` to
   * share one instance across games. See `ui/theme.js`.
   */
  theme: null,
  sounds: {},
  music: {}
};

/** `game.resolution` as console text: 'native', a scale, or 'WxH'. */
function serializeResolution(resolution) {
  if (resolution === 'native' || resolution == null) return 'native';
  if (typeof resolution === 'object') return `${resolution.width ?? '?'}x${resolution.height}`;
  return String(resolution);
}

/** Console text back into what `setResolution` takes. Throws on nonsense. */
function parseResolution(text) {
  const value = String(text).trim().toLowerCase();
  if (value === 'native') return 'native';
  const preset = value.match(/^(\d+)x(\d+)$/);
  if (preset) return { width: Number(preset[1]), height: Number(preset[2]) };
  const scale = Number(value);
  if (Number.isFinite(scale) && scale > 0 && scale <= 2) return scale;
  throw new Error(`r_resolution: expected native, a scale (0..2], or WxH — got '${text}'`);
}

/** Settings scope when the game gives none: the page, not the whole origin. */
function defaultSaveId() {
  return typeof location !== 'undefined' ? location.pathname : '';
}

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
     * Scene-independent UI drawn above everything: the screen stack and the
     * debug layer. Set up after the renderer, since it needs UI sizes.
     * @type {ScreenStack|null}
     */
    this.ui = null;
    /** Set by a resize event, applied at the top of the next frame. */
    this.pendingResize = false;

    this.viewport = this.#computeViewport();
    this.renderer = this.#initRenderer(canvas, rendererOverrideFromURL() || this.options.renderer);
    this.uiRenderer = new UIRenderer(this.renderer);

    /**
     * Design tokens every UI element resolves against. Elements reach it by
     * walking to the root rather than holding a copy, so replacing this
     * restyles the whole game on the next frame.
     * @type {Theme}
     */
    this.theme = this.options.theme instanceof Theme
      ? this.options.theme
      : createTheme(this.options.theme);

    /**
     * UI tweens: screen transitions, staggered menus, per-state micro
     * animation. Ticked outside the pause gate, so a menu over a frozen
     * game still animates. See `ui/motion.js`.
     */
    this.motion = new MotionManager(this);

    /**
     * Engine-level UI above the scene: a stack of screens (pause, settings,
     * dialogs) plus a debug layer that outlives scene switches. Push a
     * screen over a live game rather than switching to a menu scene, which
     * would unload it. See `ui/screenStack.js`.
     */
    this.ui = new ScreenStack(this);

    if (this.options.performanceStats !== false) {
      // The debug layer, not the scene's container: a readout cleared and
      // rebuilt on every scene switch, and hit-tested alongside game UI,
      // was never what anyone wanted.
      this.stats = this.ui.debug.add(new PerformanceStats({
        x: 16, y: -16, anchor: 'bottom-left', pivot: 'bottom-left'
      }));
    }

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
     * The mounted settings menu, if the game created one. Set by the menu's
     * constructor; scene UI reaches it through the 'settings' button action.
     * @type {import('./ui/settingsMenu.js').SettingsMenu|null}
     */
    this.settings = null;

    /**
     * Keyboard, mouse, touch and pen, and everything derived from them:
     * gestures, hit testing and the pointer-lock cursor. The engine
     * registers no other input listener anywhere. See core/input/.
     */
    this.input = new InputManager(this, {
      pointerLock: this.options.pointerLock,
      preventDefault: this.options.preventDefaultKeys
    });

    /**
     * Console variables: every engine knob with a name, a type and a
     * description, plus whatever the game registers. The settings menu reads
     * and writes these; so does the developer console. See console/cvars.js.
     */
    this.cvars = new CVarRegistry({
      saveId: this.options.saveId ?? defaultSaveId()
    });
    /** Console commands over those cvars and the engine. */
    this.commands = new CommandRegistry(this.cvars);
    registerBuiltins(this.commands, this);
    this.#registerEngineCvars();

    /**
     * The developer console, mounted in the debug layer. Opens with
     * backquote. @type {DevConsole|null}
     */
    this.console = this.options.devConsole !== false ? new DevConsole(this) : null;

    // The readout's own hotkey, registered once the input system exists.
    // Consuming the press is also what keeps the browser from acting on it:
    // bare F3 opens the find bar otherwise. See core/input/keyboard.js.
    const statsKey = this.options.performanceStatsHotkey;
    if (this.stats && statsKey) {
      this.statsHotkey = this.input.on('keydown', (event) => {
        if (event.code !== statsKey) return;
        this.stats.toggle();
        event.consume();
      }, { band: 'overlay' });
    }

    this.layers = new LayerManager();
    this.layers.setGame(this);
    this.sceneManager = new SceneManager(this);
    this.soundManager = new SoundManager();

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

  /**
   * The engine's own cvars. Each is an accessor over live state, so reading
   * asks the engine rather than a copy that can drift, and writing goes
   * through the same methods a menu would call. Prefixes follow the Quake
   * convention the completion is built around: `r_` render, `g_` game,
   * `cl_` client-side presentation.
   */
  #registerEngineCvars() {
    const cvars = this.cvars;

    cvars.register('r_resolution', {
      type: 'string',
      default: 'native',
      persist: true,
      description: 'World render resolution: native, a scale (0.5), or WxH (960x540)',
      get: () => serializeResolution(this.resolution),
      set: (value) => this.setResolution(parseResolution(value))
    });

    cvars.register('r_aspect', {
      type: 'string',
      choices: ['letterbox', 'expand'],
      default: this.options.aspectMode,
      persist: true,
      description: 'Letterbox keeps the designed view; expand reveals more world',
      get: () => this.aspectMode,
      set: (value) => this.setAspectMode(value)
    });

    cvars.register('r_worldfilter', {
      type: 'string',
      choices: ['linear', 'nearest'],
      default: this.options.worldFilter,
      persist: true,
      description: 'How the world is filtered when upscaled; nearest keeps pixel art crisp',
      get: () => this.worldFilter,
      set: (value) => this.setWorldFilter(value)
    });

    cvars.register('r_fullscreen', {
      type: 'boolean',
      default: false,
      description: 'Fullscreen on the canvas',
      get: () => this.isFullscreen,
      set: (value) => { value ? this.requestFullscreen() : this.exitFullscreen(); }
    });

    cvars.register('r_debug', {
      type: 'boolean',
      default: false,
      description: "The renderer's debug overlay (entity annotations)",
      get: () => this.renderer.isDebugEnabled(),
      set: (value) => this.renderer.setDebugEnabled(value)
    });

    cvars.register('r_renderer', {
      type: 'string',
      choices: ['webgl', 'canvas'],
      default: DEFAULT_RENDERER,
      description: 'Rendering backend. Setting it reloads the page with ?renderer=',
      get: () => this.renderer.constructor.name.replace(/Renderer$/, '').toLowerCase(),
      set: (value) => {
        const params = new URLSearchParams(location.search);
        params.set('renderer', value);
        location.search = params.toString();
      }
    });

    cvars.register('g_paused', {
      type: 'boolean',
      default: false,
      description: 'Freeze the simulation; drawing and UI keep running',
      get: () => this.paused,
      set: (value) => { this.paused = value; }
    });

    cvars.register('g_timescale', {
      type: 'number',
      min: 0,
      max: 10,
      default: this.options.physicsTimeScale,
      description: 'Multiplier on simulated time: 0.5 is slow motion',
      get: () => this.physics.timeScale,
      set: (value) => { this.physics.timeScale = value; }
    });

    if (this.stats) {
      cvars.register('cl_showfps', {
        type: 'boolean',
        default: true,
        persist: true,
        description: 'The frame-rate readout',
        get: () => this.stats.visible,
        set: (value) => { this.stats.visible = value; }
      });

      cvars.register('cl_statsexpanded', {
        type: 'boolean',
        default: false,
        persist: true,
        description: 'Expand the readout into the full counter list (F3)',
        get: () => this.stats.expanded,
        set: (value) => { this.stats.expanded = value; }
      });
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
    // UI space just changed size; a virtual cursor parked at the old right
    // edge would otherwise sit outside the new one.
    this.input?.onResize();

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
    // UI first: screens unregister their own input subscriptions, which
    // means reaching back into this.input while it still exists.
    this.statsHotkey?.();
    this.console?.destroy();
    this.settings?.destroy();
    this.ui?.destroy();
    this.motion?.destroy();
    this.worldOverlay.destroy();
    this.input.destroy();
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

  /**
   * The engine's own full-screen messages (loading, game over).
   *
   * These bypass the UI element tree on purpose: they have to draw before a
   * scene exists and after one has been torn down, which is exactly when
   * there is no container to put an element in. They do go through the
   * theme, so they match the rest of the UI. The screen stack replaces them
   * with real screens.
   */
  drawUIBackground(fillStyle = '$color.bg.scrim') {
    this.uiRenderer.drawRect({
      x: 0,
      y: 0,
      width: this.uiRenderer.width,
      height: this.uiRenderer.height,
      fillStyle: this.theme.resolve(fillStyle)
    });
  }

  drawUIText(text, y, size = '$font.size.heading', weight = '$font.weight.regular') {
    this.uiRenderer.drawText({
      text,
      x: this.uiRenderer.width / 2,
      y,
      fillStyle: this.theme.resolve('$color.text.primary'),
      fontSize: this.theme.resolve(size),
      fontFamily: this.theme.get('font.family'),
      fontWeight: this.theme.resolve(weight),
      textAlign: 'center',
      textBaseline: 'middle'
    });
  }

  drawGameOver() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground();
    const midY = this.uiRenderer.height / 2;
    this.drawUIText('Game Over', midY - 48, '$font.size.title', '$font.weight.bold');
    this.drawUIText('Press R to restart', midY + 24, '$font.size.subheading');
    this.drawUIText('Press M for menu', midY + 60, '$font.size.subheading');
    this.uiRenderer.endFrame();
  }

  drawLoading() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground('$color.bg.base');
    this.drawUIText('Loading', this.uiRenderer.height / 2, '$font.size.display', '$font.weight.light');
    this.uiRenderer.endFrame();
  }

  drawWorld(currentScene, deltaTime = 0) {
    // Overlay annotations are per-frame submissions made during the world
    // pass below; clearing here (not when they are drawn) means a game loop
    // that never reaches drawOverlays cannot accumulate them across frames.
    this.worldOverlay.clear();
    this.renderer.beginFrame();
    this.renderer.applyCamera(this.camera);
    currentScene.draw(deltaTime);
    this.renderer.endFrame();
  }

  drawUI(currentScene, deltaTime = 0) {
    this.uiRenderer.beginFrame();
    currentScene.drawUI(deltaTime);
    this.uiRenderer.endFrame();
  }

  /**
   * Draw scene-independent overlays (e.g. the settings menu) and the pointer
   * cursor above everything else. The engine loop calls this last every
   * frame; a game that replaces the loop must call it at the end of its own
   * frame — otherwise, under pointer lock, there is no cursor on screen at
   * all, since the system one is hidden while the canvas holds the lock.
   */
  drawOverlays(deltaTime = 0) {
    const hasOverlay = this.worldOverlay.hasSubmissions;
    if (this.ui.isEmpty && !hasOverlay && !this.input.cursor.locked) return;
    this.uiRenderer.beginFrame();
    // World annotations first: they belong to the game, so a menu pushed
    // over it covers them rather than the other way round.
    this.worldOverlay.draw();
    this.ui.draw(deltaTime);
    this.input.draw();
    this.uiRenderer.endFrame();
  }

  update(currentTime) {
    // Display events are coalesced and applied here, between frames, so a
    // resize can never land in the middle of a draw.
    if (this.pendingResize) this.resize();

    // Deliver pointer movement buffered since the last frame, coalesced into
    // one update per pointer, and let time-based gestures fire. Presses and
    // key events were already delivered inside their own DOM handler — they
    // have to be, or the browser refuses the fullscreen and pointer-lock
    // requests they trigger. See core/input/inputManager.js.
    this.input.beginFrame(currentTime);

    if (!this.lastTime) {
      this.lastTime = currentTime;
      this.input.endFrame();
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }

    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.renderer.clear('#000');

    if (this.sceneManager.loading) {
      this.drawLoading();
      this.input.endFrame();
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
        // UI ticks even while paused. A pause menu that froze along with the
        // game could not animate itself in, and the thing the player is
        // looking at would be the one thing not responding.
        currentScene.updateUI(deltaTime);
        this.drawWorld(currentScene, deltaTime);
        this.drawUI(currentScene, deltaTime);
      }
    } else {
      if (currentScene) {
        this.drawWorld(currentScene, deltaTime);
      }
      this.drawGameOver();

      if (this.input.isDown(KEY_RESTART)) {
        this.isGameOver = false;
        this.reset();
        currentScene.load();
      } else if (this.input.isDown(KEY_MENU)) {
        this.isGameOver = false;
        this.reset();
        this.sceneManager.switchTo('mainMenu');
      }
    }

    // Engine UI ticks every frame, paused or not, and after the scene so a
    // screen pushed this frame is laid out before it is drawn. Motion runs
    // first: a tween writes the values this frame's layout reads.
    this.motion.update(deltaTime);
    this.ui.update(deltaTime);
    this.drawOverlays(deltaTime);

    // Retire this frame's input edges (justPressed / justReleased).
    this.input.endFrame();

    this.frameHandle = requestAnimationFrame(this.update);
  }

  async start() {
    // Before the first label is drawn, not alongside it. Both backends
    // rasterize text through the browser and the WebGL one caches the
    // result as a texture keyed by text and style, so a label drawn in the
    // fallback face stays in the fallback face. See ui/fonts.js.
    this.fonts = await loadUIFonts();

    this.drawLoading();

    Object.entries(this.options.sounds || {}).forEach(
      ([key, file]) => this.soundManager.loadSound(key, file)
    );
    Object.entries(this.options.music || {}).forEach(
      ([key, file]) => this.soundManager.loadMusic(key, file)
    );

    if (this.options.initialScene) {
      await this.sceneManager.switchTo(this.options.initialScene);
    }

    this.setupCollisionHandlers();
    this.running = true;
    this.update();
  }

  reset() {
    // Collision handlers survive the reset — they belong to the engine, not
    // to the scene being torn down.
    this.physics.reset();

    // Constraints that registered with an engine-wide service (input hit
    // testing) have to hand it back before the entities are dropped.
    for (const entity of this.entities) entity.destroy?.();
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
   * Project a world position into UI coordinates: where that point sits in
   * the space UI elements are drawn and hit-tested in. The opposite
   * direction from pointer input (which arrives already carrying both
   * spaces on every event), for pinning screen-space content — labels,
   * markers, off-screen indicators — to a world object.
   * @param {number} x - World X
   * @param {number} y - World Y
   * @returns {{x: number, y: number}}
   */
  worldToUI(x, y) {
    const view = this.camera.worldToScreen(x, y);
    return viewToUI({ x: view.x, y: view.y, viewport: this.viewport });
  }
} 