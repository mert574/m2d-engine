/**
 * In-game settings: resolution, fullscreen, aspect mode, debug overlay,
 * renderer backend and pause.
 *
 * ## What this is now
 *
 * A `UIScreen` built from components. It used to be 350 lines of
 * immediate-mode drawing with its own hit-rectangle array, its own hover
 * index and its own colour literals — a parallel UI system inside the UI
 * module, which is why it looked like nothing else the engine drew. The
 * rows are `UIOptionRow`s in a `Stack` inside a `UIPanel` now, so hover,
 * press, keyboard focus, theming and layout all come from the same places
 * every other component gets them.
 *
 * ## Mounting
 *
 * One instance per game covers every scene. Constructing it registers the
 * hotkey and sets `game.settings`; it does not show anything. Opening
 * pushes the screen onto `game.ui`, so it sits over a live, loaded game
 * rather than replacing it, and closing pops back to whatever was below —
 * including another screen, which is how "pause → settings → back" works.
 *
 * The resolution rows are the point of the menu. Picking one calls
 * `game.setResolution`, which changes only how many pixels the *world* is
 * rasterized into — the same amount of world stays visible and this menu
 * itself, like all UI, stays at display resolution. The presets are scale
 * factors of the game's design size, so the same menu is correct for a
 * 640x480 game and a 1280x720 one.
 *
 * Usage, once per example:
 *
 *   new SettingsMenu(game);          // toggles with the O key
 *
 * A scene's own "Settings" button opens it through `game.settings`
 * (`{"action": "settings"}` in scene JSON).
 *
 * Opening does **not** pause the game unless the developer opts in with
 * `pauseWhenOpen: true`; either way the menu offers a Paused row.
 *
 * Games that replace the engine loop must call `game.drawOverlays()` at the
 * end of their own frame, and `game.ui.update(dt)` before it.
 */

import { sameResolution } from '../viewport.js';
import { UIScreen } from './screen.js';
import { UIPanel } from './panel.js';
import { UIText } from './text.js';
import { UIOptionRow } from './optionRow.js';
import { Stack, Spacer } from './layout/stack.js';
import { UIRectangle } from './Rectangle.js';

/** Scale presets offered as resolutions, besides 'native'. */
const DEFAULT_SCALES = [1, 0.75, 0.5, 0.25];

/** The settings panel. Built once and reused across openings. */
class SettingsScreen extends UIScreen {
  /**
   * @param {import('./settingsMenu.js').SettingsMenu} menu
   */
  constructor(menu) {
    super({
      name: 'settings',
      blocking: true,
      scrim: true,
      pauseGame: menu.pauseWhenOpen,
      transition: 'scale',
      // Softens the game behind the panel on a backend with post effects;
      // elsewhere the scrim carries the separation alone.
      blurBehind: menu.blurBehind
    });
    this.menu = menu;

    // A hard-edged slab, not a floating pill. Rounded cards with soft
    // shadows are dialog-box language; a game's options panel is a plate
    // with a rule under its title.
    const panel = this.add(new UIPanel({
      anchor: 'center',
      pivot: 'center',
      padding: { top: 22, right: 24, bottom: 20, left: 24 },
      // Sized from the stack, which has the fixed width: the dialog is then
      // exactly as tall as the rows it holds, however many that is.
      fitContent: true,
      surface: 'raised',
      cornerRadius: '$radius.sm',
      elevation: 'high',
      borderColor: '$color.border.default',
      interactive: true
    }));

    this.stack = panel.add(new Stack({
      anchor: 'top-left',
      direction: 'column',
      // One fixed width so every row matches; the height follows the rows.
      width: 330,
      gap: 0,
      align: 'stretch'
    }));

    this.stack.add(new UIText({
      text: 'SETTINGS',
      align: 'left',
      fontSize: '$font.size.caption',
      fontWeight: '$font.weight.semibold',
      letterSpacing: '$font.tracking.widest',
      color: '$color.text.accent',
      // The title is as wide as the stack, so its alignment-derived pivot
      // would fight `align: stretch`; pinning it keeps the label put.
      pivot: 'top-left'
    }));
    this.stack.add(new Spacer({ size: '$space.sm' }));
    this.stack.add(new UIRectangle({
      height: 1,
      color: '$color.border.default',
      pivot: 'top-left'
    }));
    this.stack.add(new Spacer({ size: '$space.sm' }));

    for (const item of menu.items()) {
      this.stack.add(new UIOptionRow({
        label: item.label,
        value: item.value,
        onActivate: item.onActivate
      }));
    }

    /** Sizes itself to the stack, which sizes itself to the rows. */
    this.panel = panel;
  }

  handleInput(event) {
    // The hotkey has to be handled here as well as by the menu's global
    // subscription: a blocking screen consumes input before subscribers
    // run, so the same key that opened the menu could never close it.
    if (event.type === 'keydown' && event.code === this.menu.hotkey) {
      this.close();
      event.consume();
      return;
    }

    // A click outside the panel closes the menu. Resolved against the
    // element tree rather than with a full-screen hit box, so the panel's
    // own children still get first refusal.
    if (event.type === 'click' && !this.hitTest(event.ui.x, event.ui.y)) {
      this.close();
      event.consume();
      return;
    }

    super.handleInput(event);
  }

  onExit() {
    this.menu.isOpen = false;
  }
}

export class SettingsMenu {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options]
   * @param {string} [options.hotkey='KeyO'] - Physical key code that toggles
   *   the menu (see core/input/keyboard.js for why it is a code)
   * @param {Array<'native'|number|{width?: number, height: number}>} [options.resolutions] -
   *   Choices offered; 'native', scale factors of the design size, or presets
   * @param {boolean} [options.pauseWhenOpen=false] - Pause the game while the
   *   menu is open, restoring the previous pause state on close
   * @param {number} [options.blurBehind=10] - How far to defocus the world
   *   behind the panel. Needs the `postEffects` capability; `0` disables it
   */
  constructor(game, options = {}) {
    this.game = game;
    this.hotkey = options.hotkey || 'KeyO';
    this.resolutions = options.resolutions || ['native', ...DEFAULT_SCALES];
    this.pauseWhenOpen = options.pauseWhenOpen ?? false;
    this.blurBehind = options.blurBehind ?? 10;
    this.isOpen = false;

    this.screen = new SettingsScreen(this);

    /**
     * The hotkey is a subscription in the overlay band rather than a check
     * inside the screen, because the screen only exists while it is open —
     * something has to be listening when it is not.
     */
    this.unsubscribe = game.input.on('keydown', (event) => {
      if (event.code !== this.hotkey) return;
      this.toggle();
      event.consume();
    }, { band: 'overlay' });

    /** The mounted menu, reachable by scene UI (e.g. a Settings button). */
    game.settings = this;
  }

  /** Whether the menu is showing. Kept in step by the screen's `onExit`. */
  get isShowing() {
    return this.game.ui.has('settings');
  }

  /** Open the menu (no-op when already open). */
  open() {
    if (this.isShowing) return;
    this.isOpen = true;
    this.game.ui.push(this.screen);
  }

  /** Close the menu (no-op when already closed). */
  close() {
    if (!this.isShowing) return;
    this.game.ui.remove(this.screen);
  }

  toggle() {
    if (this.isShowing) this.close();
    else this.open();
  }

  /**
   * The menu's rows: label, current value, and what activating one does.
   *
   * Every row is a view onto a cvar — the same `r_aspect` the console sets —
   * so a change made in either place shows up in the other, and the cvar's
   * `persist` flag is what makes a menu choice stick across sessions. The
   * menu's own contribution is presentation: friendlier labels, and cycling
   * through its resolution presets rather than asking for free text.
   */
  items() {
    const game = this.game;
    const cvars = game.cvars;
    return [
      {
        label: 'Resolution',
        value: () => this.#resolutionLabel(game.resolution),
        onActivate: () => this.#cycleResolution(1)
      },
      {
        label: 'Fullscreen',
        value: () => (cvars.get('r_fullscreen') ? 'On' : 'Off'),
        onActivate: () => cvars.toggle('r_fullscreen')
      },
      {
        label: 'Aspect',
        value: () => (cvars.get('r_aspect') === 'expand' ? 'Fill (expand)' : 'Letterbox'),
        onActivate: () => cvars.set('r_aspect',
          cvars.get('r_aspect') === 'expand' ? 'letterbox' : 'expand')
      },
      {
        label: 'Debug overlay',
        value: () => (cvars.get('r_debug') ? 'On' : 'Off'),
        onActivate: () => cvars.toggle('r_debug')
      },
      {
        label: 'Renderer',
        value: () => cvars.get('r_renderer'),
        onActivate: () => cvars.set('r_renderer',
          cvars.get('r_renderer') === 'webgl' ? 'canvas' : 'webgl')
      },
      {
        label: 'Paused',
        value: () => (cvars.get('g_paused') ? 'On' : 'Off'),
        onActivate: () => cvars.toggle('g_paused')
      },
      {
        label: 'Close',
        value: () => `(${game.input.keyLabel(this.hotkey)})`,
        onActivate: () => this.close()
      }
    ];
  }

  /**
   * Human label for a resolution choice, in world-surface pixels.
   * @param {'native'|number|{width?: number, height: number}} resolution
   * @returns {string}
   */
  #resolutionLabel(resolution) {
    const v = this.game.viewport;
    if (resolution === 'native' || resolution == null) {
      return `Native (${v.worldWidth}x${v.worldHeight})`;
    }
    if (typeof resolution === 'object') {
      return `${resolution.width ?? Math.round(resolution.height * (this.game.options.width / this.game.options.height))}x${resolution.height}`;
    }
    return `${Math.round(this.game.options.width * resolution)}x${Math.round(this.game.options.height * resolution)}`;
  }

  /**
   * Advance to the next (or previous) resolution preset, through the cvar so
   * the choice persists and the console sees it.
   */
  #cycleResolution(step) {
    const current = this.resolutions.findIndex(r => sameResolution(r, this.game.resolution));
    // An unlisted current value (set programmatically) starts the cycle over.
    const index = current < 0 ? 0 : (current + step + this.resolutions.length) % this.resolutions.length;
    this.game.cvars.set('r_resolution', serializePreset(this.resolutions[index]));
  }

  destroy() {
    this.close();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.game.settings === this) this.game.settings = null;
  }
}

/** A resolution preset as `r_resolution` text. */
function serializePreset(preset) {
  if (preset === 'native' || preset == null) return 'native';
  if (typeof preset === 'object') return `${preset.width ?? '?'}x${preset.height}`;
  return String(preset);
}
