import { MoteField } from './moteField.js';
import { ReedBed } from './reedBed.js';
import { LabelStorm } from './labelStorm.js';
import { Minimap } from './minimap.js';
import { Lighthouse } from './lighthouse.js';
import { RainEmitter } from './rainEmitter.js';
import { Lanterns } from './lanterns.js';
import { Backdrop } from './backdrop.js';
import { Hud } from './hud.js';
import { Weather } from './weather.js';
import { Gulls } from './gulls.js';

/**
 * Showcase director.
 *
 * Owns the stress layers, the load multiplier and the camera pan, and is the
 * single place that knows what the scene is currently drawing. Drawing runs
 * through the scene's `onDraw` hook, so everything here happens inside the
 * world pass with the camera transform applied.
 *
 * The camera pans on a fixed path rather than following a player. That is
 * deliberate: the showcase is also the renderer comparison harness, and a
 * workload that depends on input cannot be compared between backends.
 */

/** Primitive counts at load 1x. Each level multiplies all of them. */
const BASE_COUNTS = {
  motes: 2400,
  reeds: 2200,
  labels: 150,
  rain: 6000,
  gulls: 60
};

const LOAD_LEVELS = [0.25, 0.5, 1, 2, 4, 8, 16];
const DEFAULT_LOAD_INDEX = 2;

export class Showcase {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} options - Director options
   * @param {Map<string, Object>} options.spriteSheets - Loaded sheets by key
   * @param {{width: number, height: number}} options.bounds - World bounds
   */
  constructor(game, { spriteSheets, bounds }) {
    this.game = game;
    this.bounds = bounds;
    this.time = 0;
    this.cameraPaused = false;
    this.loadIndex = DEFAULT_LOAD_INDEX;

    /**
     * Counters as of the end of the world pass.
     *
     * The HUD cannot read the live counters: it draws during the screen pass,
     * so it would report a half-finished tally of its own panels. Snapshotting
     * when the world pass ends makes the numbers describe the stress layers
     * exactly, and leaves the overlay's own cost out of its own measurement.
     * @type {Object|null}
     */
    this.worldStats = null;

    const renderer = game.renderer;

    // Three bands make the scene a place rather than a gradient. `waterline`
    // stays the reeds' footing (they stand in the shallows); the horizon is
    // well above it and the near bank starts just below, which is what the
    // lanterns and the lighthouse are planted on.
    const waterline = bounds.height * 0.72;
    const horizonY = waterline - 420;
    const shoreY = waterline + 40;

    /**
     * Optional backend features this run can use. The scene asks once and
     * passes the answer down, rather than every layer querying per draw. A
     * backend would ignore an option it does not support anyway — asking is
     * what lets the layers choose a different look instead of silently
     * losing one.
     * @type {{tint: boolean, blendModes: boolean, particles: boolean}}
     */
    this.features = {
      tint: renderer.supports('tint'),
      blendModes: renderer.supports('blendModes'),
      particles: renderer.supports('particles'),
      lights: renderer.supports('lights'),
      postEffects: renderer.supports('postEffects')
    };

    this.field = new MoteField({
      renderer,
      sheet: spriteSheets.get('mote'),
      bounds,
      waterline,
      features: this.features
    });

    this.reeds = new ReedBed({
      renderer,
      sheet: spriteSheets.get('reed'),
      bounds,
      waterline,
      features: this.features
    });

    this.labels = new LabelStorm({ renderer, bounds });

    this.gulls = new Gulls({
      renderer,
      sheet: spriteSheets.get('gull'),
      bounds,
      horizonY,
      features: this.features
    });

    this.rain = new RainEmitter({
      renderer,
      sheet: spriteSheets.get('rain'),
      bounds,
      waterline,
      features: this.features
    });

    this.lighthouse = new Lighthouse({
      renderer,
      sheet: spriteSheets.get('lighthouse'),
      x: bounds.width * 0.5,
      baseY: shoreY + 30,
      reach: bounds.width * 0.72,
      horizonY,
      scale: 2.6,
      features: this.features
    });

    this.backdrop = new Backdrop({
      renderer,
      bounds,
      horizonY,
      shoreY,
      glitterX: this.lighthouse.x,
      features: this.features
    });

    this.lanterns = new Lanterns({
      renderer,
      sheet: spriteSheets.get('lantern'),
      bounds,
      shoreY,
      lighthouse: this.lighthouse,
      features: this.features
    });

    this.minimap = new Minimap(game, {
      // Anchored, so the chart stays in the real top-right corner at any
      // aspect ratio and in fullscreen.
      anchor: 'top-right',
      x: -110,
      y: 110,
      size: 180,
      bounds,
      field: this.field,
      lighthouse: this.lighthouse,
      shoreY
    });

    /** The front crossing the harbour, and the hour it crosses in. */
    this.weather = new Weather(game);

    this.hud = new Hud(game, this);
    this.waterline = waterline;
    this.horizonY = horizonY;
    this.shoreY = shoreY;

    this.layers = [
      { name: 'drift', enabled: true, target: this.field },
      { name: 'reeds', enabled: true, target: this.reeds },
      { name: 'labels', enabled: true, target: this.labels },
      { name: 'flock', enabled: true, target: this.gulls },
      { name: 'chart', enabled: true, target: this.minimap },
      { name: 'rain', enabled: true, target: this.rain },
      { name: 'lights', enabled: true, target: this.lanterns },
      { name: 'post', enabled: true, target: { count: '' } },
      { name: 'weather', enabled: true, target: { count: '' } }
    ];

    this.applyLoad();
    this.applyEffects();
  }

  /**
   * Register the HUD and minimap with the scene's UI container.
   *
   * The engine's own readout lives in its debug layer, above every scene.
   * The showcase's HUD reports the same counters with more context, so the
   * stock one is silenced rather than left to overlap it.
   */
  attachUI(ui) {
    if (this.game.stats) this.game.stats.visible = false;

    ui.add(this.minimap);
    ui.add(this.hud);
  }

  /**
   * Whether a layer is on, by name. The layers are numbered on the HUD but
   * never addressed by number here: inserting one would silently renumber
   * every check.
   * @param {string} name
   */
  showing(name) {
    return this.layers.find((layer) => layer.name === name)?.enabled ?? false;
  }

  /** @returns {number} Current load multiplier */
  load() {
    return LOAD_LEVELS[this.loadIndex];
  }

  /** @returns {string} Load multiplier formatted for the HUD */
  loadLabel() {
    return `${this.load()}x`;
  }

  /**
   * Step the load multiplier and rebuild the layers at the new size.
   * @param {number} direction - -1 or +1
   */
  stepLoad(direction) {
    const next = Math.min(LOAD_LEVELS.length - 1, Math.max(0, this.loadIndex + direction));
    if (next === this.loadIndex) return;
    this.loadIndex = next;
    this.applyLoad();
  }

  applyLoad() {
    const load = this.load();
    this.field.setCount(BASE_COUNTS.motes * load);
    this.reeds.setCount(BASE_COUNTS.reeds * load);
    this.labels.setCount(BASE_COUNTS.labels * load);
    this.rain.setCount(BASE_COUNTS.rain * load);
    this.gulls.setCount(BASE_COUNTS.gulls * load);
  }

  /**
   * Toggle a layer by its 1-based index.
   * @param {number} index - Layer number as shown in the HUD
   */
  toggleLayer(index) {
    const layer = this.layers[index - 1];
    if (!layer) return;

    layer.enabled = !layer.enabled;
    if (layer.target === this.minimap) {
      this.minimap.visible = layer.enabled;
    }
    this.applyEffects();
  }

  /**
   * Push the lighting and post-effect settings the current toggles imply.
   *
   * These are persistent renderer state rather than per-frame draws, so they
   * are set when they change, not every frame. A backend without the
   * capability ignores them, which is exactly the intended degradation: the
   * scene stays evenly lit instead of going dark with nothing to light it.
   */
  applyEffects() {
    const renderer = this.game.renderer;
    const look = this.weather.look();
    renderer.setAmbientLight(this.showing('lights') ? look.lighting?.ambient ?? null : null);
    renderer.setPostEffects(this.showing('post') ? look.post ?? null : null);
  }

  /** @returns {Array<{name: string, enabled: boolean, count: string|number}>} HUD rows */
  layerSummary() {
    return this.layers.map((layer) => {
      let count = layer.target.count ?? '';
      if (layer.target === this.rain && this.rain.capped()) {
        count = `${count} (capped, no particles)`;
      }
      return { name: layer.name, enabled: layer.enabled, count };
    });
  }

  /**
   * Show or hide the readout. Coming back it slides in from the left and
   * fades up through the engine's motion manager, which is the same path
   * a menu's entrance takes — and the one thing on screen that is not the
   * stress test, so it never touches the counters.
   */
  toggleHud() {
    this.hud.visible = !this.hud.visible;
    if (!this.hud.visible) return;
    const motion = this.game.motion;
    motion?.from(this.hud, { offsetX: this.hud.offsetX - 28, opacity: 0 }, {
      duration: '$motion.duration.normal',
      easing: '$motion.easing.decelerate'
    });
  }

  toggleCamera() {
    this.cameraPaused = !this.cameraPaused;
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;

    // The weather runs on the wall clock, so both backends are in the
    // same weather at the same moment whatever their frame rate.
    this.weather.enabled = this.showing('weather');
    this.weather.update(this.game.time?.unscaledDelta ?? deltaTime);
    // The light and the post stack follow the hour and the front.
    this.applyEffects();
    // What the harbour does about the wind. None of it changes how many
    // drops or reeds there are — only how they stand and how they read.
    const wind = this.weather.wind;
    this.reeds.setWind(wind);
    this.rain.setWeather(0.18 + wind * 0.7, 0.12 + 0.88 * this.weather.strength);

    if (!this.cameraPaused) {
      this.panCamera();
    }

    // Layers keep simulating while hidden so toggling one back on does not
    // snap it to a stale state, which would be visible as a jump.
    this.field.update(deltaTime);
    this.reeds.update(deltaTime);
    this.labels.update(deltaTime);
    this.rain.update(deltaTime);
    this.gulls.update(deltaTime);
    this.lanterns.update(deltaTime);
    this.lighthouse.update(deltaTime);
    this.backdrop.update(deltaTime);
  }

  /**
   * Move the camera along a fixed Lissajous path inside the world bounds.
   */
  panCamera() {
    const camera = this.game.camera;
    const marginX = camera.width / 2;
    const marginY = camera.height / 2;
    const spanX = Math.max(0, this.bounds.width - camera.width) / 2;
    const spanY = Math.max(0, this.bounds.height - camera.height) / 2;

    // The pan is the harness's fixed path; the swell and a strike's knock
    // are the weather's, and both are small enough that the same amount of
    // world stays on screen.
    const sea = this.weather.camera();
    camera.x = marginX + spanX + Math.sin(this.time * 0.51) * spanX + sea.offset.x;
    camera.y = marginY + spanY + Math.sin(this.time * 0.33) * spanY + sea.offset.y;
    camera.zoom = sea.zoom;
    camera.rotation = sea.rotation;
  }

  /**
   * World-space draw, called from the scene's onDraw hook.
   */
  draw() {
    this.backdrop.drawDistance();

    // Order is depth. The beam swaps sides of the tower as it sweeps: going
    // away it is behind the building, coming toward the viewer it is in front.
    const behind = this.lighthouse.beamBehindTower();
    if (behind) this.lighthouse.drawBeam();
    if (this.showing('reeds')) this.reeds.draw();
    this.backdrop.drawBank();
    this.lanterns.drawSprites();
    this.lighthouse.drawTower();
    if (!behind) this.lighthouse.drawBeam();
    this.lighthouse.drawHalo();
    if (this.showing('flock')) this.gulls.draw();
    if (this.showing('drift')) this.field.draw();
    if (this.showing('rain')) this.rain.draw();
    if (this.showing('labels')) this.labels.draw();

    // Lights are not painted into the scene; they accumulate into a light map
    // the backend multiplies over the finished world pass.
    if (this.showing('lights')) {
      this.backdrop.drawLights();
      this.lanterns.drawLights();
    }

    this.worldStats = this.game.renderer.getStats();
  }

}
