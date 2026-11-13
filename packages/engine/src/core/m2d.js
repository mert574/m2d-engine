import { createPhysicsWorld } from './physics/index.js';
import { Registry, BUILTIN_ACTORS, BUILTIN_CONSTRAINTS } from './builtins.js';

/** A prefab's `category` or `mask` as bits: a name or a list of names from CollisionCategories, or a number. */
function categoryBits(value) {
  if (typeof value === 'number') return value;
  const names = Array.isArray(value) ? value : [value];
  let bits = 0;
  for (const name of names) {
    const bit = CollisionCategories[name];
    if (bit === undefined) throw new Error(`M2D: unknown collision category '${name}' (known: ${Object.keys(CollisionCategories).join(', ')})`);
    bits |= bit;
  }
  return bits;
}
import { Time } from './time.js';
import { Rng } from './rng.js';
import { InputManager } from './input/index.js';
import { LayerManager } from './layerManager.js';
import { AssetDatabase } from './assets.js';
import { CollisionCategories } from './constants.js';
import { SceneManager } from './sceneManager.js';
import { Camera } from './camera.js';
import { Camera3D } from './camera3d.js';
import { meshFor, lightFor } from './presentation3d.js';
import { SoundManager } from './soundManager.js';
import { createRenderer, UIRenderer, DEFAULT_RENDERER, DEFAULT_RENDERER_3D, FALLBACK_RENDERER } from './renderers/index.js';
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
import { presentationGuard, createHeadlessInput, SilentSound } from './headless.js';
import { WorldEvents } from './events.js';
import { baselineOf } from '../net/replication.js';
import { Players } from './players.js';
import { takeSnapshot, restoreSnapshot } from './snapshot.js';

/** Restart and menu keys on the game-over screen, by physical key code. */
const KEY_RESTART = 'KeyR';
const KEY_MENU = 'KeyM';

/**
 * Longest frame the loop will simulate, in seconds. A tab coming back from
 * the background reports one huge delta; clamping it keeps that from
 * becoming a single enormous step. Matches `maxSubSteps` × `fixedTimestep`
 * at the defaults, so an ordinary slow frame is still simulated in full.
 */
const MAX_FRAME_DELTA = 0.1;


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
   * resolution menu. 'native' matches the display. A number is a fraction
   * of native (0.5 is half the linear resolution this display would show);
   * a `{width, height}` names an absolute surface. Either renders the world
   * coarser or finer *without* changing how much world is visible. See
   * `setResolution`.
   */
  resolution: 'native',
  /** 'nearest' keeps pixel art crisp when the world is upscaled. */
  worldFilter: 'linear',
  textureFilter: 'linear',
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
   * Seconds per simulation tick. Every `fixedUpdate` and every physics step
   * sees exactly this dt no matter how long a frame took: the loop runs as
   * many ticks as the elapsed time paid for. That is what makes the game
   * play the same at any frame rate, and what keeps resting contacts from
   * jittering. Live at `game.time.fixedTimestep`.
   */
  fixedTimestep: 1 / 60,
  /**
   * Most ticks one frame may run. Bounds catch-up work after a stall so a
   * slow frame cannot cascade into slower ones. Six ticks of 1/60s is 0.1s —
   * exactly the cap the loop clamps a frame's delta to, so an ordinary
   * frame, however slow, is always simulated in full.
   */
  maxSubSteps: 6,
  /**
   * Seed for `game.rng`, the generator simulation code draws from. The
   * sequence restarts from it on every scene load and `reset()`, so a level
   * plays the same each time it is entered. Pass `Date.now()` for a game
   * that should differ between sessions.
   */
  seed: 1,
  /**
   * Multiplier on game time — 0.5 is slow motion, 2 runs the game at double
   * speed. Physics, entity updates and game-time timers all follow it; UI
   * and screen transitions do not. Live at `game.time.scale`; `g_timescale`
   * in the console. `physicsTimeScale` is accepted as an older spelling.
   */
  timeScale: 1,
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
  music: {},
  /**
   * Edit mode: the scene is presentation without game. The world is built
   * from the scene document exactly as a load builds it — entities,
   * constraints, props, tiles, lights — but no game code runs against it:
   * scene lifecycle and draw hooks (`onEnter`, `onShow`, `onDraw`,
   * `onRender`, `onHide`, `onExit`, ...) are never called, the simulation
   * never ticks (`step` runs nothing, whoever calls it), the scene's UI
   * receives no input, `gameOver` is inert, and cvars do not persist, so
   * an editing session cannot overwrite a player's settings. This is what
   * an editor's viewport runs; playing in an editor is a *fresh* game
   * without this flag. See knowledge-base/projects/editor/editor-e0.md (E0.6).
   */
  editMode: false
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
  /**
   * How often an edit-mode game redraws when nothing invalidated it: often
   * enough that an asset landing or a renderer's history settling shows
   * at once to the eye, a third of a 60 Hz display's work at rest.
   */
  static EDIT_IDLE_FPS = 20;

  constructor(canvas, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.constructorOptions = options;
    /**
     * True for a game with no display: the simulation only. See
     * core/headless.js and `#initHeadless`.
     */
    this.headless = this.options.headless === true;
    /**
     * True when the world is being edited rather than played. One
     * authoritative flag the tick, the hooks, input routing and cvar
     * persistence all consult; see the `editMode` option.
     */
    this.editMode = this.options.editMode === true;
    /**
     * Edit mode draws on demand: when something said the picture changed
     * (`invalidate`), and otherwise at `EDIT_IDLE_FPS`. See `update`.
     */
    this.invalidated = true;
    this.lastEditDraw = -Infinity;
    /**
     * Whether edit mode draws on demand (the default) or every frame like
     * play — an editor's power-saving switch.
     */
    this.drawOnDemand = true;
    if (this.headless) {
      if (canvas) throw new Error('M2D headless: pass null for the canvas; a headless game has no display');
      this.#initSimulation();
      this.#initHeadless();
      return;
    }
    
    // Initialize renderer backend and its screen-space (UI) view.
    // A `?renderer=<name>` query parameter overrides the option so any
    // example can be viewed with another backend without code changes.
    this.canvas = canvas;
    // A 3D frame is many passes over many pixels; half of native is the
    // sane default and the menu is right there for more. 2D keeps native.
    if (!('resolution' in options) && (this.options.dimensions ?? 2) === 3) this.options.resolution = 0.5;
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
    this.renderer = this.#initRenderer(canvas, rendererOverrideFromURL() || this.#rendererOption());
    // A 3D renderer draws the HUD through a 2D backend of its own, on a
    // canvas laid over the world; see WebGPURenderer.
    this.uiRenderer = new UIRenderer(this.renderer.uiBackend ?? this.renderer);

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

    // A 3D game looks through a different camera: an eye and a projection
    // rather than a window onto a plane. Same lifecycle, same call sites.
    this.camera = this.renderer.dimensions === 3
      ? new Camera3D(this.viewport.viewWidth, this.viewport.viewHeight)
      : new Camera(this.viewport.viewWidth, this.viewport.viewHeight, {
        worldWidth: this.options.worldWidth,
        worldHeight: this.options.worldHeight,
        lerp: 0.1
      });

    /**
     * Extra live views of the world from `addView`: an editor's side
     * viewports, each a canvas and a camera of its own over the same
     * running scene. Empty for a game that never asks.
     * @type {Array<{canvas: HTMLCanvasElement, camera: object, dimensions: number}>}
     */
    this.views = [];

    /**
     * Annotations drawn *on* the world rather than in it: debug geometry
     * (ranges, target dots, facing vectors) and world-anchored readouts.
     * Submitted in world coordinates, rasterized in the overlay pass at
     * display resolution, so they stay sharp however coarse the world's
     * render resolution is. See ui/worldOverlay.js.
     */
    this.worldOverlay = new WorldOverlay(this);

    if (this.options.autoResize) this.#watchDisplaySize();

    this.#initSimulation();

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
      saveId: this.options.saveId ?? defaultSaveId(),
      // Editing is not playing: cvar changes made while editing live for
      // the session and never reach the player's persisted settings.
      ...(this.editMode && { storage: null })
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

    this.soundManager = new SoundManager();
  }

  /**
   * Everything the simulation is made of, and nothing that shows it: the
   * clocks, the generator, physics, the entity set and the scenes. Shared
   * by a displayed game and a headless one, so the two cannot drift apart.
   */
  #initSimulation() {
    /**
     * The clocks and the scheduler: game time (pauses, scales) and wall
     * time (does neither), plus `after` / `every` timers measured against
     * them. Ticked once per frame at the top of `update`. See core/time.js.
     * @type {Time}
     */
    this.time = new Time({
      scale: this.constructorOptions.physicsTimeScale ?? this.options.timeScale,
      fixedTimestep: this.options.fixedTimestep,
      maxSubSteps: this.options.maxSubSteps,
      maxDelta: MAX_FRAME_DELTA
    });

    /**
     * Seeded random numbers for simulation code. Reseeded on every scene
     * load and `reset()`. See core/rng.js.
     * @type {Rng}
     */
    this.rng = new Rng(this.options.seed);

    /**
     * The simulation. Games and actors reach physics only through this; see
     * core/physics/index.js for the contract it implements. It shares the
     * engine clock: the step settings, the time scale and the accumulator
     * are `game.time`'s, and the loop steps it once per tick from
     * `fixedUpdate`.
     */
    this.physics = createPhysicsWorld({
      clock: this.time,
      interpolate: this.options.interpolatePhysics,
      dimensions: this.options.dimensions ?? 2
    });
    this.collisionCategories = CollisionCategories;

    this.entities = new Set();
    this.player = null;
    this.actors = new Registry(BUILTIN_ACTORS);
    /**
     * Constraint classes a scene may attach by name: what the game
     * registered with `registerConstraint`, and behind them the engine's own
     * (`core/builtins.js`), so a scene may name `Hover` without the game
     * having to know. The game's registration wins for a shared name.
     * @type {Map<string, typeof import('./constraint.js').Constraint>}
     */
    this.constraintTypes = new Registry(BUILTIN_CONSTRAINTS);
    /**
     * Assets the game owns, by uid. Empty until `loadAssets`; a game whose
     * scenes declare everything inline never needs it. See `assets.js`.
     * @type {AssetDatabase}
     */
    this.assets = new AssetDatabase();
    this.isGameOver = false;
    /**
     * Network ids: one per entity, in creation order, reset with the scene.
     * `entityById` looks one up among the live entities.
     */
    this.nextNetId = 1;
    this.entitiesById = new Map();
    /** A network id the next entity constructed takes instead of the next free one. See `spawn`. */
    this.pendingNetId = null;
    /** Ids a replica hands to entities only it has (negative, so they never meet the server's). */
    this.nextLocalNetId = -1;
    /**
     * The network ids the scene's own objects were built with, and a hash of
     * their actor names in order. A client checks the server's against its
     * own: the same scene module must build the same entities.
     */
    this.sceneNetIds = [];
    this.sceneSignature = 0;
    this.sceneBuilt = false;
    /**
     * Each scene-built entity's replicated state as it was built, by id.
     * A joining client is seeded with it rather than sent the level it has
     * just built itself. @type {Map<number, object>|null}
     */
    this.sceneBaseline = null;
    /**
     * A replica shows a simulation it does not run: a client of a server.
     * Set by `NetClient`. Its ticks sample input and hand it to the
     * connection; entities, scene simulation hooks and physics do not run.
     */
    this.replica = false;
    /** The connection, while this game is a client. @type {import('../net/client.js').NetClient|null} */
    this.net = null;
    /**
     * How much the net layer logs: the `net_log` cvar's home, kept on the
     * game so it survives connecting and disconnecting.
     */
    this.netLogLevel = 1;
    /**
     * The players: the local one, and on a server one per connection. See
     * core/players.js. @type {Players}
     */
    this.players = new Players(this);
    /**
     * Things the simulation says happened that presentation should show: a
     * hit, a death, a footstep. Raised in `fixedUpdate`, delivered after
     * the frame's ticks, and on a server sent to the clients they concern.
     * See core/events.js.
     */
    this.events = new WorldEvents(this);
    /**
     * State outside entities that snapshots carry, by key. Belongs to the
     * scene: cleared whenever one loads. See `trackState`.
     * @type {Map<string, {save: () => any, load: (data: any) => void}>}
     */
    this.trackedState = new Map();
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
     * The scene's ground-to-render projection, or null for a view straight
     * down at the plane. Set from `world.projection` when a scene loads.
     * @type {import('./projection.js').Projection|null}
     */
    this.projection = null;
    this.sceneManager = new SceneManager(this);

    this.update = this.update.bind(this);
    this.fixedUpdate = this.fixedUpdate.bind(this);
    this.lastTime = 0;
    /** rAF handle, so the loop can be cancelled by destroy(). */
    this.frameHandle = null;
    this.running = false;
  }

  /**
   * A headless game's stand-ins for presentation. Each guard throws on
   * first use, naming itself; sound is silent; input is fed by a snapshot
   * source. See core/headless.js.
   */
  #initHeadless() {
    this.canvas = null;
    this.resizeListeners = [];
    this.pendingResize = false;
    for (const name of ['viewport', 'renderer', 'uiRenderer', 'theme', 'motion', 'ui', 'camera',
      'worldOverlay', 'layers', 'cvars', 'commands', 'console', 'onResizeHandlers']) {
      this[name] = presentationGuard(`game.${name}`);
    }
    this.stats = null;
    this.input = createHeadlessInput();
    this.soundManager = new SilentSound();
  }

  /**
   * Create and initialise the backend. When the *default* backend cannot
   * start (typically no WebGL2), fall back to the Canvas backend with a
   * warning; an explicitly requested backend that fails is an error.
   */
  /** The `renderer` option, defaulting by dimension when the game did not choose. */
  #rendererOption() {
    if ('renderer' in (this.constructorOptions || {})) return this.options.renderer;
    return (this.options.dimensions ?? 2) === 3 ? DEFAULT_RENDERER_3D : DEFAULT_RENDERER;
  }

  /**
   * A renderer must draw in the dimension the game simulates: the 2D
   * backends have no mesh and the 3D one has no sprite, so a mismatch is
   * caught here with the line that fixes it rather than at the first draw.
   */
  #checkRendererDimension(renderer) {
    const wanted = this.options.dimensions ?? 2;
    const has = renderer.dimensions ?? 2;
    if (has === wanted) return;
    const name = renderer.constructor.name.replace(/Renderer$/, '').toLowerCase();
    const fix = wanted === 3
      ? `use { renderer: '${DEFAULT_RENDERER_3D}' } and await initWebGPU()`
      : `use { renderer: '${DEFAULT_RENDERER}' } or drop { dimensions: 3 }`;
    throw new Error(`M2D: the '${name}' renderer draws in ${has}D but the game runs ${wanted}D physics — ${fix}`);
  }

  #initRenderer(canvas, selection) {
    const size = {
      width: this.options.width,
      height: this.options.height,
      viewport: this.viewport,
      worldFilter: this.options.worldFilter,
      textureFilter: this.options.textureFilter
    };
    let renderer = createRenderer(selection);
    this.#checkRendererDimension(renderer);
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
   * `cl_` client-side presentation, `net_` the connection.
   */
  #registerEngineCvars() {
    const cvars = this.cvars;

    cvars.register('r_resolution', {
      type: 'string',
      default: serializeResolution(this.options.resolution),
      persist: true,
      description: 'World render resolution: native, a fraction of native (0.5), or WxH (960x540)',
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

    if (this.renderer.effects) {
      // The 3D post stack, one switch each; the scene sets the strengths.
      const effects = this.renderer.effects;
      const toggles = [
        ['r_taa', 'taa', 'Temporal anti-aliasing'],
        ['r_ao', 'ao', 'Ambient occlusion'],
        ['r_dof', 'dof', 'Depth of field, where the scene focuses'],
        ['r_motionblur', 'motionBlur', 'Per-object motion blur'],
        ['r_autoexposure', 'autoExposure', 'Auto exposure, where the scene asks for it'],
        ['r_bloom', 'bloom', 'Bloom'],
        ['r_film', 'film', 'Vignette and film grain']
      ];
      for (const [name, key, description] of toggles) {
        cvars.register(name, {
          type: 'boolean', default: true, persist: true, description,
          get: () => effects[key],
          set: (value) => { effects[key] = value; }
        });
      }
    }

    if (typeof this.renderer.setShadowQuality === 'function') {
      cvars.register('r_shadows', {
        type: 'string',
        choices: ['off', 'low', 'medium', 'high'],
        default: 'medium',
        persist: true,
        description: 'Shadow quality: cascades and map sizes for the sun, how many spot lights cast',
        get: () => this.renderer.shadowQuality,
        set: (value) => this.renderer.setShadowQuality(value)
      });
    }

    cvars.register('r_renderer', {
      type: 'string',
      choices: ['webgl', 'canvas', 'webgpu'],
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
      default: this.time.scale,
      description: 'Multiplier on game time: 0.5 is slow motion',
      get: () => this.time.scale,
      set: (value) => { this.time.scale = value; }
    });

    // The connection's knobs. They are registered whether or not this game
    // is online, so they can be set before connecting and read afterwards;
    // each one that needs a connection says so when there is none.
    cvars.register('net_log', {
      type: 'number',
      min: 0,
      max: 2,
      default: 1,
      persist: true,
      description: 'Net logging: 0 silent, 1 the connection\'s life, 2 leads, corrections and rates',
      get: () => this.netLogLevel,
      set: (value) => { this.netLogLevel = Math.round(value); }
    });

    cvars.register('net_predict', {
      type: 'boolean',
      default: true,
      description: 'Run the local avatar\'s movement early instead of waiting for the server',
      get: () => this.net?.predicts ?? true,
      set: (value) => {
        if (!this.net) throw new Error('net_predict: not connected to a server');
        this.net.setPredicting(value);
      }
    });

    cvars.register('net_interp', {
      type: 'number',
      min: 0,
      max: 30,
      default: 0,
      description: 'Extra ticks to draw remote entities behind the server, on top of the usual delay',
      get: () => this.net?.view?.extraDelay ?? 0,
      set: (value) => {
        if (!this.net?.view) throw new Error('net_interp: not connected to a server');
        this.net.view.extraDelay = Math.round(value);
      }
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
    this.invalidated = true;
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
   *   'native' to match the display, a `{width, height}` preset for an
   *   absolute surface, or a scale factor as a fraction of native (0.5
   *   renders at half the linear resolution this display would show).
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

  /**
   * The element fullscreen is requested on: the canvas, unless the renderer
   * names another. The 3D renderer draws the HUD on a sibling canvas, so it
   * asks for their parent; a canvas alone on the screen would leave the HUD
   * behind.
   */
  get fullscreenElement() {
    return this.renderer.fullscreenElement ?? this.canvas;
  }

  /** Whether the game is currently the fullscreen element. */
  get isFullscreen() {
    return typeof document !== 'undefined' && document.fullscreenElement === this.fullscreenElement;
  }

  /**
   * Enter fullscreen. The resize lifecycle handles the rest.
   * @returns {Promise<void>}
   */
  async requestFullscreen() {
    await this.fullscreenElement.requestFullscreen?.();
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
    if (this.headless) {
      this.running = false;
      this.time.clear();
      this.physics.destroy();
      this.sceneManager.getCurrentScene()?.unload?.();
      return;
    }
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
    // 2D views own a renderer each; 3D view resources go down with the
    // renderer itself below.
    for (const view of this.views.splice(0)) view.renderer?.destroy();
    this.worldOverlay.destroy();
    this.input.destroy();
    this.soundManager.destroy();
    this.time.clear();
    this.physics.destroy();
    this.sceneManager?.getCurrentScene()?.unload?.();
    this.renderer.destroy();
  }

  registerActor(type, ActorClass) {
    this.actors.set(type, ActorClass);
  }

  /**
   * Make a constraint available to scene files by name, so a prefab or a
   * placed object can attach and tune it without an actor written for it.
   *
   * What the scene may set is the class's `static params`; the loader
   * validates against it and an editor reads it to draw an inspector. A
   * constraint's callbacks are not in `params` and stay the actor's job.
   *
   * @param {string} type - The name scenes use, conventionally the class name.
   * @param {typeof import('./constraint.js').Constraint} ConstraintClass
   */
  registerConstraint(type, ConstraintClass) {
    this.constraintTypes.set(type, ConstraintClass);
  }

  /**
   * Load an asset manifest: the sprite sheets and prefabs the game's
   * scenes may reach for by uid, through their `uses` block.
   *
   * Call it before loading a scene that uses one. Actors should be
   * registered first, so a prefab asset naming an unregistered actor
   * fails here rather than when some level eventually places one.
   *
   * @param {object} manifest - A parsed manifest document.
   * @returns {import('./assets.js').AssetDatabase}
   * @throws {import('./assets.js').AssetManifestError}
   */
  loadAssets(manifest) {
    return this.assets.load(manifest, { actors: this.actors });
  }

  /**
   * Install the game's intents, declared with `defineIntents`. Every player
   * gets a queue; the local one sends through `game.players.local.send`.
   * @param {import('../net/intents.js').IntentSet|null} intentSet
   */
  registerIntents(intentSet) {
    this.players.useIntents(intentSet);
  }

  /**
   * The whole simulation as it is now, to come back to with `restore`.
   * Taken between ticks. See core/snapshot.js for what it holds.
   */
  snapshot() {
    return takeSnapshot(this);
  }

  /**
   * Put the simulation back to a snapshot taken in the current scene. The
   * ticks that follow, given the same input, are the ticks that followed
   * when it was taken.
   */
  restore(snapshot) {
    restoreSnapshot(this, snapshot);
  }

  /**
   * Have snapshots carry state that lives outside entities: a scene's wave
   * counter, a director's queue. `save` returns a copy of it; `load` puts a
   * copy back. Registrations belong to the scene and are dropped when the
   * next one loads, so register in `onEnter`.
   *
   * @param {string} key
   * @param {{save: () => any, load: (data: any) => void}} hooks
   */
  trackState(key, hooks) {
    if (typeof hooks?.save !== 'function' || typeof hooks?.load !== 'function') {
      throw new Error('M2D trackState: needs { save, load } functions');
    }
    this.trackedState.set(key, hooks);
  }

  /** Hand out the next network id. The Entity constructor calls this. */
  allocateNetId(entity) {
    let id;
    if (this.pendingNetId !== null) {
      id = this.pendingNetId;
      this.pendingNetId = null;
    } else if (this.replica && this.sceneBuilt) {
      id = this.nextLocalNetId--;
    } else {
      id = this.nextNetId++;
    }
    this.entitiesById.set(id, entity);
    return id;
  }

  /** The live entity with this network id, or null. */
  entityById(id) {
    const entity = this.entitiesById.get(id);
    return entity && this.entities.has(entity) ? entity : null;
  }

  /** Start network ids over. Scene setup and `reset()` call this. */
  resetNetIds() {
    this.nextNetId = 1;
    this.nextLocalNetId = -1;
    this.entitiesById.clear();
    this.sceneBuilt = false;
    this.sceneNetIds = [];
    this.sceneSignature = 0;
    this.sceneBaseline = null;
  }

  /**
   * Record the scene's own entities once they are built: their ids, and a
   * hash of `id:name;` in id order (FNV-1a over UTF-16 units).
   */
  markSceneBuilt() {
    this.sceneBuilt = true;
    this.sceneNetIds = [...this.entitiesById.keys()].filter((id) => id > 0).sort((a, b) => a - b);
    // What the build produced, which is also what a client joining later
    // will have built for itself. See net/replication.js.
    this.sceneBaseline = new Map();
    for (const id of this.sceneNetIds) {
      this.sceneBaseline.set(id, baselineOf(this.entitiesById.get(id)));
    }
    let hash = 0x811c9dc5;
    for (const id of this.sceneNetIds) {
      const text = `${id}:${this.entitiesById.get(id).name};`;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
    this.sceneSignature = hash;
  }

  /**
   * Build an entity from a registered actor, without adding it to the
   * world. `game.spawn` is the one simulation code wants; this is the
   * lower-level half, for a scene building its objects.
   *
   * @param {object} spec
   * @param {string} spec.type - A registered actor name
   * @param {number} spec.x - Centre, world units
   * @param {number} spec.y
   * @param {number} spec.width - Drawn size, and the collider's unless a
   *   `physics.footprint` makes the body the feet
   * @param {number} spec.height
   * @param {import('./spriteSheet.js').SpriteSheet} [spec.spritesheet] -
   *   The sheet itself, not its name; `spawn` takes the name
   * @param {object} [spec.options] - Passed to the actor; plain data
   * @param {object} [spec.physics] - Prefab physics keys
   * @returns {import('./entity.js').Entity|null}
   */
  /**
   * The collider a prefab's `shape` asks for, in two dimensions.
   *
   * Prefabs size every actor as a box, so `shape` only chooses which
   * collider that box is filled with: a circle takes its diameter from the
   * width, a capsule is the box it fits inside. Width and height are left
   * off the circle spec on purpose — `createCircle` derives both from the
   * radius, and passing them too would let a non-square prefab end up with
   * a size that disagrees with its collider.
   */
  #createBody2D({ x, y, width, height, material, physics }) {
    if (physics.shape === 'circle') {
      return this.physics.createCircle({ x, y, radius: width / 2, ...material });
    }
    if (physics.shape === 'capsule') {
      return this.physics.createCapsule({ x, y, width, height, ...material });
    }
    return this.physics.createBox({ x, y, width, height, ...material });
  }

  /**
   * The same, in three. A prefab's box gains a `depth`, defaulting to its
   * width so a cube needs only two numbers, and the round shapes take a
   * radius from the width exactly as their 2D counterparts do.
   */
  #createBody3D({ x, y, z, width, height, depth, material, physics }) {
    const spec = { x, y, z, ...material };
    if (physics.shape === 'sphere') {
      return this.physics.createSphere({ ...spec, radius: width / 2 });
    }
    if (physics.shape === 'capsule') {
      return this.physics.createCapsule({ ...spec, radius: width / 2, height });
    }
    if (physics.shape === 'cylinder') {
      return this.physics.createCylinder({ ...spec, radius: width / 2, height });
    }
    return this.physics.createBox({ ...spec, width, height, depth: depth ?? width });
  }

  createEntity({
    type, x, y, z = 0, width, height, depth, spritesheet = null, mesh, light, options = {}, physics = {}
  }) {
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
      ...(this.physics.dimensions === 3
        ? physics.rotation && { rotation: physics.rotation }
        : { angle: physics.angle || 0 }),
      lockRotation: physics.lockRotation || false,
      isSensor: physics.isSensor || false,
      friction: physics.friction || 0.1,
      frictionAir: physics.frictionAir || 0.01,
      restitution: physics.restitution || 0,
      ...(physics.density !== undefined && { density: physics.density }),
      ...(physics.category !== undefined && { category: categoryBits(physics.category) }),
      ...(physics.mask !== undefined && { mask: categoryBits(physics.mask) })
    };
    // A footprint splits the collider from the drawn frame: the body is a
    // short box at the bottom of the object (the feet) and the sprite stands
    // above it. That is what lets a 3/4-view character walk behind a tree
    // whose trunk is the only solid part. `body.frame` carries the full
    // size and where it sits relative to the body, for the Entity
    // constructor to pick up. See Entity.frameOffset.
    let bodyX = x;
    let bodyY = y;
    let bodyWidth = width;
    let bodyHeight = height;
    let frame = null;
    if (physics.footprint) {
      bodyWidth = Math.min(width, physics.footprint.width ?? width);
      bodyHeight = Math.min(height, physics.footprint.height ?? height);
      bodyY = y + (height - bodyHeight) / 2;
      frame = { width, height, offsetX: 0, offsetY: -(height - bodyHeight) / 2 };
    }

    const body = this.physics.dimensions === 3
      ? this.#createBody3D({ x: bodyX, y: bodyY, z, width: bodyWidth, height: bodyHeight, depth, material, physics })
      : this.#createBody2D({ x: bodyX, y: bodyY, width: bodyWidth, height: bodyHeight, material, physics });
    if (frame) body.frame = frame;

    const entity = new ActorClass(
      body,
      spritesheet,
      this,
      options
    );

    body.entity = entity;
    /**
     * How a 3D entity is drawn: the prefab's `mesh` block with its colour
     * in linear light, or its collider's shape in grey. Null in 2D, where
     * the sprite is the presentation. `mesh.visible = false` hides it;
     * `entity.mesh = null` removes it from the frame entirely.
     */
    entity.mesh = this.physics.dimensions === 3 ? meshFor(mesh) : null;
    /**
     * A point or spot light this entity carries, following its body, or
     * null. The prefab's `light` block with its colour in linear light.
     */
    entity.light = light ? (this.physics.dimensions === 3 ? lightFor(light) : light) : null;
    /**
     * How this entity was made, for a server to tell clients to make the
     * same one. `options` must be plain data for that to work.
     */
    entity.spawnInfo = {
      type, x, y, width, height,
      ...(this.physics.dimensions === 3 && { z, depth, ...(mesh && { mesh }), ...(light && { light }) }),
      sprite: this.#sheetKey(spritesheet),
      animation: null,
      options: options ?? {},
      physics: physics ?? {}
    };
    return entity;
  }

  #sheetKey(sheet) {
    if (!sheet || this.headless) return null;
    for (const [key, value] of this.sceneManager.getCurrentScene()?.spriteSheets ?? []) {
      if (value === sheet) return key;
    }
    return null;
  }

  /**
   * Create an entity from a registered actor and put it in the world: the
   * way simulation code adds something at runtime that clients must see.
   *
   * @param {object} spec
   * @param {string} spec.type - A registered actor name
   * @param {number} spec.x - Centre, world units
   * @param {number} spec.y
   * @param {number} spec.width
   * @param {number} spec.height
   * @param {string} [spec.sprite] - A sprite sheet key of the current scene
   * @param {string} [spec.animation] - The animation to start in
   * @param {object} [spec.options] - Passed to the actor; plain data
   * @param {object} [spec.physics] - Prefab physics keys
   * @param {string|null} [spec.playerId] - The owning player
   * @param {number} [spec.netId] - Take this network id (a client replaying a server's spawn)
   */
  spawn({
    type, x, y, z = 0, width, height, depth, mesh, light,
    sprite = null, animation, options = {}, physics = {}, playerId = null, netId
  }) {
    const sheet = sprite && !this.headless ? this.sceneManager.getCurrentScene()?.spriteSheets.get(sprite) ?? null : null;
    if (netId !== undefined) this.pendingNetId = netId;
    let entity;
    try {
      entity = this.createEntity({
        type, x, y, z, width, height, depth, mesh, light, spritesheet: sheet, options, physics
      });
    } finally {
      this.pendingNetId = null;
    }
    if (!entity) throw new Error(`M2D spawn: actor '${type}' is not registered`);
    entity.spawnInfo.sprite = sprite;
    entity.spawnInfo.animation = animation ?? null;
    if (animation) entity.setAnimation(animation);
    entity.playerId = playerId;
    this.entities.add(entity);
    this.physics.add(entity.body);
    return entity;
  }

  gameOver() {
    // Inert in edit mode, like every other transition: nothing may take
    // the editor's viewport to the game-over screen or on to 'mainMenu'.
    if (this.editMode) return;
    this.isGameOver = true;
    this.soundManager.playSound('gameOver');
  }

  /**
   * One simulation tick: the unit the game plays in, identical at every
   * frame rate.
   *
   * In order: the input state for this tick is sampled; the scene and
   * every entity run `fixedUpdate(dt)` (movement, cooldowns, damage,
   * spawning); the physics world steps once. Game-time timers due at this
   * tick have already fired, from `time.tick`, before this is called.
   *
   * The engine loop runs it through `game.time.tick`, as many times per
   * frame as the elapsed time paid for. A custom loop does the same, or
   * calls `game.time.stepOnce(game.fixedUpdate)` to run exactly one tick
   * (a debugger's step button). Not gated on `paused`: the caller decides
   * whether a tick happens, this decides what one is.
   *
   * @param {number} dt - Seconds; always `game.time.fixedTimestep`.
   * @returns {boolean} False once a scene switch is pending, which tells
   *   `time.tick` to run no further ticks this frame.
   */
  fixedUpdate(dt) {
    // Edit mode never simulates: not from the frame loop, not from
    // `step()`, not from a custom loop. One gate here covers every caller,
    // so a world being edited cannot move however it is driven.
    if (this.editMode) return false;
    // A scene switch requested by one of this tick's timers: the scene
    // being left does not tick again.
    if (this.sceneManager.loading) return false;
    this.input.sample();
    if (this.replica) {
      // The server runs the world. A replica's tick is its input, sent.
      this.net?.tick(this.input.snapshot);
      return true;
    }
    this.players.sample();
    // Intents filed for this tick run before anything moves, so an entity
    // sees the result of a request in the same tick a press would land.
    this.players.applyIntents(this.time.steps);
    if (!this.isGameOver) this.sceneManager.getCurrentScene()?.fixedUpdate?.(dt);
    this.physics.step(dt);
    // One requested during the tick runs after it, and ends the frame's
    // ticks. See SceneManager.switchTo.
    return !this.sceneManager.loading;
  }

  /**
   * Run whole ticks now, outside any frame loop: what a server's clock
   * calls, headless or not. Not gated on `paused`, like `fixedUpdate`.
   * Stops early once a tick requests a scene switch, since the next scene
   * is not built until the switch has run; await it and step on.
   *
   * @param {number} [ticks=1]
   * @returns {number} Ticks run.
   */
  step(ticks = 1) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error(`M2D step: ticks must be a whole number from 0 up, got ${ticks}`);
    }
    // Gated here as well as in fixedUpdate, so edit mode does not even
    // advance the game clock: an edited world has no game time.
    if (this.editMode) return 0;
    let ran = 0;
    while (ran < ticks && !this.sceneManager.loading) {
      ran++;
      if (this.time.stepOnce(this.fixedUpdate) === false) break;
    }
    return ran;
  }

  /**
   * Freeze the simulation: ticks stop, so physics, entity and camera
   * updates and game-time timers all stop; drawing, UI, motion and unscaled
   * timers continue. The same flag the settings menu and `g_paused` toggle,
   * so the three agree.
   */
  pause() {
    this.paused = true;
  }

  /** Let the simulation run again. No time is owed for the pause. */
  resume() {
    this.paused = false;
  }

  /**
   * Flip the pause state.
   * @returns {boolean} The new state.
   */
  togglePause() {
    this.paused = !this.paused;
    return this.paused;
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
    if (this.renderer.dimensions === 3) {
      // A 3D renderer is retained: the scene describes the frame and the
      // renderer draws it, instead of entities calling draw primitives —
      // once per view, with the heavy half of the frame shared.
      this.renderer.render(currentScene.frame3D(deltaTime));
      return;
    }
    this.renderer.beginFrame();
    this.renderer.applyCamera(this.camera);
    currentScene.draw(deltaTime);
    this.renderer.endFrame();

    // 2D side views: the same scene walked again per view. The world pass
    // is immediate-mode and entities, layers and constraints draw through
    // `game.renderer` under `game.camera`, so both are swapped for the
    // walk and restored — the one place that indirection is serviced.
    for (const view of this.views) {
      const renderer = this.renderer;
      const camera = this.camera;
      this.renderer = view.renderer;
      this.camera = view.camera;
      try {
        view.renderer.clear('#000');
        view.renderer.beginFrame();
        view.renderer.applyCamera(view.camera);
        currentScene.draw(deltaTime);
        view.renderer.endFrame();
      } finally {
        this.renderer = renderer;
        this.camera = camera;
      }
    }
  }

  drawUI(currentScene, deltaTime = 0) {
    this.uiRenderer.beginFrame();
    currentScene.drawUI(deltaTime);
    this.uiRenderer.endFrame();
  }

  /**
   * A second live view of the world: `canvas` shows the same running scene
   * from a camera of its own, every frame, beside the game's canvas. An
   * editor's side viewports are the consumer; a game can use it for a
   * replay angle or a map. The returned view's `camera` is the caller's to
   * drive (a `Camera3D` in 3D, a `Camera` in 2D, sized to the canvas).
   *
   * In 3D the renderer shares the frame's heavy half — scene assembly,
   * culling, the shadow maps — across views and pays the main pass and
   * post stack per view, with temporal state (TAA history, exposure) per
   * view. Shadows stay fitted to the main camera. In 2D the view is a
   * renderer instance of the same backend on its canvas, and the scene is
   * walked once more per view.
   *
   * No game UI, HUD or overlay draws on a view's canvas, and views take no
   * input; they are cameras, not screens.
   *
   * @param {HTMLCanvasElement} canvas - Sized by the caller; after changing
   *   its backing size, size the camera too (and in 3D call
   *   `renderer.resizeView(view.handle)`)
   * @returns {{canvas: HTMLCanvasElement, camera: object, dimensions: number}}
   */
  addView(canvas) {
    if (this.headless) throw new Error('M2D headless: a headless game has no display to view');
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    if (this.renderer.dimensions === 3) {
      const camera = new Camera3D(width, height);
      const handle = this.renderer.createView(canvas, camera);
      const view = { canvas, camera, handle, dimensions: 3 };
      this.views.push(view);
      return view;
    }
    const renderer = new this.renderer.constructor();
    renderer.init(canvas, {
      width, height,
      worldFilter: this.options.worldFilter,
      textureFilter: this.options.textureFilter
    });
    const camera = new Camera(width, height, {
      worldWidth: this.options.worldWidth,
      worldHeight: this.options.worldHeight
    });
    const view = { canvas, camera, renderer, dimensions: 2 };
    this.views.push(view);
    return view;
  }

  /** Drop a view from `addView` and everything it holds. The canvas stays. */
  removeView(view) {
    const index = this.views.indexOf(view);
    if (index < 0) return;
    this.views.splice(index, 1);
    if (view.handle) this.renderer.removeView(view.handle);
    else view.renderer.destroy();
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

  /**
   * Ask for the next frame to be drawn. Only edit mode needs it — a played
   * game draws every frame — and there it is how an editor's change (an
   * edit applied in place, a camera moved, a selection drawn) reaches the
   * screen without waiting for the idle rate. Cheap; call it freely.
   */
  invalidate() {
    this.invalidated = true;
  }

  update(currentTime) {
    if (this.headless) throw new Error('M2D headless: there is no frame loop; drive the simulation with game.step()');
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

    // Edit mode is a still picture until something changes it: the
    // document never moves, so a frame is drawn when `invalidate` asked for
    // one (an edit, a camera gesture, a resize) and otherwise only at
    // EDIT_IDLE_FPS. The idle rate is what lets anything the editor does
    // not hear about — a texture or a model landing, a streamed batch, the
    // 3D renderer's temporal history settling — still reach the screen
    // without the editor knowing when it happens. Input is still delivered
    // every frame; only the draw waits. `lastTime` is left alone on a
    // skipped frame, so the next drawn one sees the real time that passed.
    if (this.editMode && this.drawOnDemand) {
      const due = this.invalidated || currentTime - this.lastEditDraw >= 1000 / M2D.EDIT_IDLE_FPS;
      if (!due) {
        this.input.endFrame();
        this.frameHandle = requestAnimationFrame(this.update);
        return;
      }
      this.invalidated = false;
      this.lastEditDraw = currentTime;
    }

    const rawDelta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.renderer.clear('#000');

    if (this.sceneManager.loading) {
      // The clocks do not tick while a scene loads: a timer armed by the
      // previous scene's teardown has no world to fire into yet.
      this.drawLoading();
      this.input.endFrame();
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }

    // The simulation. `time.tick` advances the clocks, then runs as many
    // fixed ticks as this frame's game time paid for, calling `fixedUpdate`
    // for each: input sample, entity fixedUpdate, physics step. Paused, it
    // runs none and the frame is presentation only, so the game stays
    // visible (and crisp at the current settings) behind overlays.
    //
    // From here on, `deltaTime` is wall time for presentation (UI, motion,
    // camera, draw passes) and `time.delta` is this frame's game time for
    // per-frame animation: zero while paused and stretched by the time
    // scale, so an animation cycle slows down with the body it belongs to.
    // Edit mode is a standing pause: game time does not advance, so no
    // tick runs and no game-time timer can fire into the edited world.
    this.time.tick(rawDelta, { paused: this.paused || this.editMode, step: this.fixedUpdate });
    if (this.sceneManager.loading) {
      // A tick asked for a scene switch. The scene it leaves is not updated
      // or drawn again.
      this.drawLoading();
      this.input.endFrame();
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }
    const deltaTime = this.time.unscaledDelta;
    // What the frame's ticks told the player at the keyboard. A client's
    // arrive from the server instead; see NetClient.
    if (!this.replica) {
      this.players.local.dispatch(this.players.local.drainEvents());
      // What this frame's ticks said happened. A client's arrive from the
      // server instead, in applyState.
      this.events.dispatch(this.events.take());
    }
    // A replica draws the server's states, interpolated: the clock that
    // decides which moment of them is drawn moves here, once per frame,
    // before the camera follows anything or anything is drawn.
    else this.net?.beforeDraw(this.time.unscaledDelta);
    const currentScene = this.sceneManager.getCurrentScene();

    if (!this.isGameOver) {
      if (currentScene) {
        if (!this.paused && !this.editMode) {
          this.camera.update(deltaTime);
          currentScene.update(this.time.delta);
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
        this.sceneManager.reload();
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
    if (this.headless) {
      // No fonts, no sounds, no loop: the caller owns the clock and calls
      // `step()`. See `#initHeadless`.
      if (this.options.initialScene) await this.sceneManager.switchTo(this.options.initialScene);
      this.setupCollisionHandlers();
      this.running = true;
      return;
    }
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
    this.resetNetIds();
    if (!this.headless) this.layers.clear();
    this.player = null;
    this.lastTime = 0;
    this.time.reset();
    this.rng.reseed(this.options.seed);

    if (!this.headless) this.camera.resetConfig();
    this.projection = null;

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
   * the space UI elements are drawn and hit-tested in. `x, y` are on the
   * ground plane; under a projection they go through it first. The opposite
   * direction from pointer input (which arrives already carrying both
   * spaces on every event), for pinning screen-space content — labels,
   * markers, off-screen indicators — to a world object.
   * @param {number} x - World X
   * @param {number} y - World Y
   * @returns {{x: number, y: number}}
   */
  worldToUI(x, y) {
    const render = this.projection ? this.projection.toScreen(x, y) : { x, y };
    const view = this.camera.worldToScreen(render.x, render.y);
    return viewToUI({ x: view.x, y: view.y, viewport: this.viewport });
  }
} 