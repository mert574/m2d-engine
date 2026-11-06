import { sameResolution } from '../viewport.js';
import { UIScreen } from './screen.js';
import { UIPanel } from './panel.js';
import { UIText } from './text.js';
import { UIElement } from './uiElement.js';
import { UIOptionRow } from './optionRow.js';
import { Stack, Spacer } from './layout/stack.js';
import { UIRectangle } from './Rectangle.js';

/** Scale presets offered as resolutions, besides 'native'. */
const DEFAULT_SCALES = [1, 0.75, 0.5, 0.25];

/**
 * The plate the settings sit on.
 *
 * A `UIPanel` whose fill is a vertical grade rather than one flat tone, a
 * hairline of light along its top edge, and a thin accent rule under that
 * — the three things that make a slab read as a lit surface instead of a
 * dialog box. The grade is built from the live frame, because gradient
 * coordinates are absolute and the panel is centred at open time.
 */
const SHADOW_LABELS = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' };

class SettingsPlate extends UIPanel {
  get fillStyle() {
    const f = this.frame;
    return {
      type: 'linear', x0: 0, y0: f.y, x1: 0, y1: f.y + f.height,
      stops: [
        { offset: 0, color: 'rgba(22, 31, 44, 0.96)' },
        { offset: 0.5, color: 'rgba(13, 19, 28, 0.96)' },
        { offset: 1, color: 'rgba(8, 12, 19, 0.97)' }
      ]
    };
  }

  draw() {
    super.draw();
    const f = this.frame;
    const radius = this.theme?.resolve(this.cornerRadius) ?? 4;
    // Light along the top edge, strongest in the middle.
    this.paint.drawRect({
      x: f.x + radius, y: f.y, width: f.width - radius * 2, height: 1,
      fillStyle: {
        type: 'linear', x0: f.x, y0: 0, x1: f.x + f.width, y1: 0,
        stops: [
          { offset: 0, color: 'rgba(255, 255, 255, 0)' },
          { offset: 0.5, color: 'rgba(255, 255, 255, 0.28)' },
          { offset: 1, color: 'rgba(255, 255, 255, 0)' }
        ]
      }
    });
    // The accent rule, inset from the top like a tab's underline.
    this.paint.drawRect({
      x: f.x, y: f.y + 1, width: f.width * 0.34, height: 2,
      fillStyle: {
        type: 'linear', x0: f.x, y0: 0, x1: f.x + f.width * 0.34, y1: 0,
        stops: [
          { offset: 0, color: '$color.accent.default' },
          { offset: 1, color: 'rgba(27, 154, 224, 0)' }
        ]
      }
    });
  }
}

/** A section caption between groups of rows: small, tracked, muted. */
class SectionCaption extends UIElement {
  constructor(text) {
    super({ pivot: 'top-left', height: 22 });
    this.text = text;
  }

  /** Smaller type on a small screen. */
  get compact() {
    return this.height < 20;
  }

  draw() {
    const f = this.frame;
    this.paint.drawText({
      text: this.text.toUpperCase(),
      x: f.x + 3, y: f.y + f.height - 4,
      fillStyle: '$color.text.muted',
      fontSize: '$font.size.micro',
      fontWeight: '$font.weight.semibold',
      letterSpacing: this.compact ? '$font.tracking.wider' : '$font.tracking.widest',
      textAlign: 'left', textBaseline: 'bottom'
    });
    this.paint.drawRect({
      x: f.x + 3, y: f.y + f.height, width: f.width - 3, height: 1,
      fillStyle: '$color.border.subtle'
    });
  }
}

/**
 * The footer: what the focused row does, on the left, and the keys that
 * work, on the right. The description is read live from the screen's
 * focus, so it follows the selection without being told.
 */
class SettingsFooter extends UIElement {
  /**
   * @param {SettingsScreen} screen
   * @param {Array<[string, string]>} hints - `[key, meaning]` pairs
   */
  constructor(screen, hints) {
    super({ pivot: 'top-left', height: 54 });
    this.screen = screen;
    this.hints = hints;
    /** Two stacked lines — description over keys — instead of one. */
    this.stacked = false;
  }

  draw() {
    const f = this.frame;
    const focused = this.screen.focus.focused;
    const description = focused instanceof UIOptionRow ? focused.description : '';

    this.paint.drawRect({
      x: f.x, y: f.y, width: f.width, height: 1,
      fillStyle: '$color.border.default'
    });

    // Key caps, right to left, so the rightmost sits on the edge.
    const capStyle = {
      fontSize: '$font.size.micro',
      fontWeight: '$font.weight.semibold',
      fontFamily: '$font.mono',
      letterSpacing: 1
    };
    const meaningStyle = {
      fontSize: '$font.size.micro',
      fontWeight: '$font.weight.medium',
      letterSpacing: '$font.tracking.wide'
    };
    const y = this.stacked ? f.y + f.height - 14 : f.y + 20;
    let x = f.x + f.width;
    for (let i = this.hints.length - 1; i >= 0; i--) {
      const [key, meaning] = this.hints[i];
      const meaningWidth = this.paint.measureText(meaning.toUpperCase(), meaningStyle).width;
      const keyWidth = this.paint.measureText(key, capStyle).width;
      const capWidth = keyWidth + 14;

      x -= meaningWidth;
      this.paint.drawText({
        text: meaning.toUpperCase(), x, y,
        fillStyle: '$color.text.muted', ...meaningStyle,
        textAlign: 'left', textBaseline: 'middle'
      });
      x -= 7 + capWidth;
      this.paint.drawRect({
        x, y: y - 9, width: capWidth, height: 18,
        fill: false, strokeStyle: '$color.border.strong', lineWidth: 1,
        cornerRadius: 3
      });
      this.paint.drawText({
        text: key, x: x + capWidth / 2, y: y + 0.5,
        fillStyle: '$color.text.secondary', ...capStyle,
        textAlign: 'center', textBaseline: 'middle'
      });
      x -= 18;
    }
    const hintsLeft = x;

    if (description) {
      // Pushed to a second line when the hints leave no room beside it.
      const narrow = this.stacked || hintsLeft - f.x < 260;
      this.paint.drawText({
        text: description,
        x: f.x + 3, y: narrow ? (this.stacked ? f.y + 16 : f.y + 42) : y,
        fillStyle: '$color.text.secondary',
        fontSize: '$font.size.caption',
        fontWeight: '$font.weight.regular',
        textAlign: 'left', textBaseline: 'middle'
      });
    }
  }
}

/**
 * The hotkey's ear. Lives in `game.ui.debug` with `captureAll`, like the
 * developer console, so it hears the key before any screen does — a
 * blocking main menu would otherwise consume it and the hotkey would only
 * work mid-game. Invisible and sizeless; it consumes exactly one key.
 */
class HotkeyCatcher extends UIElement {
  constructor(menu) {
    super({ pivot: 'top-left', width: 0, height: 0, visible: false });
    this.menu = menu;
    this.captureAll = true;
  }

  handleInput(event) {
    if (event.type !== 'keydown' || event.code !== this.menu.hotkey) return;
    this.menu.toggle();
    event.consume();
  }
}

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
      transition: 'fade',
      // Softens the game behind the panel on a backend with post effects;
      // elsewhere the scrim carries the separation alone.
      blurBehind: menu.blurBehind
    });
    this.menu = menu;

    // A plate, not a card: hard corners, a lit top edge, no pill shapes.
    const panel = this.add(new SettingsPlate({
      anchor: 'center',
      pivot: 'center',
      padding: { top: 26, right: 30, bottom: 18, left: 30 },
      // Sized from the stack, which has the fixed width: the dialog is then
      // exactly as tall as the rows it holds, however many that is.
      fitContent: true,
      cornerRadius: '$radius.sm',
      elevation: 'high',
      borderColor: '$color.border.default',
      interactive: true
    }));

    this.stack = panel.add(new Stack({
      anchor: 'top-left',
      direction: 'column',
      // One fixed width so every row matches; the height follows the rows.
      width: 560,
      gap: 0,
      align: 'stretch'
    }));

    // Header: an eyebrow in tracked caps over a large, light title — the
    // main menu's typography, so the two screens are one product.
    this.stack.add(new UIText({
      text: 'SYSTEM',
      align: 'left',
      fontSize: '$font.size.micro',
      fontWeight: '$font.weight.semibold',
      letterSpacing: '$font.tracking.widest',
      color: '$color.text.accent',
      pivot: 'top-left'
    }));
    this.stack.add(new Spacer({ size: 2 }));
    /** Spacers and captions the compact fit tightens. */
    this.gaps = [];
    this.captions = [];
    this.title = this.stack.add(new UIText({
      text: 'Settings',
      align: 'left',
      fontSize: '$font.size.title',
      fontWeight: '$font.weight.thin',
      letterSpacing: '$font.tracking.tight',
      color: '$color.text.primary',
      pivot: 'top-left'
    }));
    this.gaps.push(this.stack.add(new Spacer({ size: '$space.md' })));

    /** @type {UIOptionRow[]} */
    this.rows = [];
    /** Everything that staggers in on open. */
    this.entrance = [];
    let section = null;
    for (const item of menu.items()) {
      if (item.section && item.section !== section) {
        if (section) this.gaps.push(this.stack.add(new Spacer({ size: 10 })));
        section = item.section;
        const caption = this.stack.add(new SectionCaption(section));
        this.captions.push(caption);
        this.entrance.push(caption);
        this.stack.add(new Spacer({ size: 4 }));
      }
      if (item.gap) this.gaps.push(this.stack.add(new Spacer({ size: item.gap })));
      const row = this.stack.add(new UIOptionRow({
        label: item.label,
        value: item.value,
        onStep: item.step,
        onActivate: item.activate,
        choices: item.choices,
        description: item.description,
        height: 44
      }));
      this.rows.push(row);
      this.entrance.push(row);
    }

    this.gaps.push(this.stack.add(new Spacer({ size: '$space.sm' })));
    this.footer = this.stack.add(new SettingsFooter(this, [
      ['↑↓', 'Navigate'],
      ['←→', 'Change'],
      ['Enter', 'Select'],
      [menu.game.input.keyLabel(menu.hotkey), 'Close']
    ]));

    /** Sizes itself to the stack, which sizes itself to the rows. */
    this.panel = panel;
  }

  /**
   * Fit the plate to the UI space. The menu is one design for a 1280-wide
   * game and a 640-wide one, so the width and the row height come from the
   * space it opens into, not from constants.
   */
  #fit() {
    const ui = this.game.uiRenderer;
    const compact = ui.height < 620;
    this.stack.fixedWidth = Math.min(560, ui.width - 72);
    this.panel.padding = compact
      ? { top: 14, right: 20, bottom: 10, left: 20 }
      : { top: 26, right: 30, bottom: 18, left: 30 };
    this.title.fontSize = compact ? '$font.size.heading' : '$font.size.title';
    for (const row of this.rows) row.height = compact ? 26 : 44;
    for (const caption of this.captions) caption.height = compact ? 18 : 22;
    for (const gap of this.gaps) gap.size = compact ? 6 : gap.size;
    this.footer.stacked = compact;
    this.footer.height = compact ? 50 : 54;
  }

  onEnter() {
    this.#fit();
    const motion = this.game.motion;
    // The plate rises into place as the scrim fades in, and the rows light
    // one after another: the main menu's entrance, in miniature.
    motion.from(this.panel, { offsetY: 18 }, {
      duration: '$motion.duration.slow',
      easing: '$motion.easing.decelerate'
    });
    motion.stagger(this.entrance, { opacity: 1 }, {
      from: { opacity: 0 },
      duration: '$motion.duration.normal',
      delay: 0.04,
      stagger: 0.035
    });
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

    // Left and Right walk the focused row's value. The screen's default
    // would try to move focus sideways, and there is nothing sideways.
    if (event.type === 'keydown' && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
      const focused = this.focus.focused;
      if (focused instanceof UIOptionRow) {
        focused.adjust(event.code === 'ArrowLeft' ? -1 : 1);
        event.consume();
        return;
      }
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
   * @param {number} [options.blurBehind=14] - How far to defocus the world
   *   behind the panel. Needs the `postEffects` capability; `0` disables it
   * @param {Array<Object>} [options.options] - Game rows to add, as
   *   `addOption` takes them
   */
  constructor(game, options = {}) {
    this.game = game;
    this.hotkey = options.hotkey || 'KeyO';
    this.resolutions = options.resolutions || ['native', ...DEFAULT_SCALES];
    this.pauseWhenOpen = options.pauseWhenOpen ?? false;
    this.blurBehind = options.blurBehind ?? 14;
    this.isOpen = false;

    /**
     * Rows a game added with `addOption`, grouped after the built-ins.
     * @type {Array<Object>}
     */
    this.customItems = [];
    for (const item of options.options ?? []) this.customItems.push(item);

    /**
     * The screen is built on first open and rebuilt when the rows change,
     * so rows that depend on the game's state (which scenes exist, which is
     * showing) are decided when the menu is actually opened.
     */
    this.dirty = true;
    this.screen = null;

    /**
     * The hotkey listener sits in the debug layer with `captureAll` rather
     * than being an input subscription: subscribers run after the screen
     * stack, and a blocking screen — every main menu — consumes keys before
     * they get there. This hears the key first, whatever is open.
     */
    this.catcher = new HotkeyCatcher(this);
    game.ui.debug.add(this.catcher);

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
    if (this.dirty || !this.screen) {
      this.screen = new SettingsScreen(this);
      this.dirty = false;
    }
    this.isOpen = true;
    this.game.ui.push(this.screen);
  }

  /** Close the menu (no-op when already closed). */
  close() {
    if (!this.isShowing || !this.screen) return;
    this.game.ui.remove(this.screen);
    // Rows depend on where the game is (the main-menu row hides while the
    // menu scene is showing), so the next open builds them fresh.
    this.dirty = true;
  }

  toggle() {
    if (this.isShowing) this.close();
    else this.open();
  }

  /**
   * Add a game's own row to the panel.
   *
   * The engine's rows cover the engine's state; what else belongs in a
   * settings screen — music, difficulty, screen shake — only the game
   * knows, and it should not have to rebuild the panel to say so. Rows
   * with a known `section` name join that section; others group under
   * their own captions after the built-ins, before Close.
   *
   * @param {Object} item
   * @param {string} item.label
   * @param {string} [item.section='Game'] - Caption to file the row under
   * @param {() => string} [item.value] - Reads the current value
   * @param {(step: number) => void} [item.step] - Change the value; `-1`
   *   for Left, `+1` for Right, a click or Enter
   * @param {(event: object) => void} [item.activate] - For an action row
   *   with nothing to step
   * @param {() => {index: number, count: number}} [item.choices] - Where
   *   the value sits in its cycle, for the row's tick track
   * @param {string} [item.description] - One line for the footer
   * @returns {this}
   */
  addOption(item) {
    this.customItems.push(item);
    this.dirty = true;
    return this;
  }

  /**
   * The menu's rows: label, current value, and how it changes.
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
    const toggle = (name) => () => cvars.toggle(name);
    const onOff = (name) => () => (cvars.get(name) ? 'On' : 'Off');
    const binary = (name) => () => ({ index: cvars.get(name) ? 1 : 0, count: 2 });
    const builtIn = [
      {
        section: 'Display',
        label: 'Resolution',
        value: () => this.#resolutionLabel(game.resolution),
        step: (step) => this.#cycleResolution(step),
        choices: () => ({
          index: Math.max(0, this.resolutions.findIndex(r => sameResolution(r, game.resolution))),
          count: this.resolutions.length
        }),
        description: 'How many pixels the world is drawn into. Lower is faster; the view stays the same size.'
      },
      {
        section: 'Display',
        label: 'Fullscreen',
        value: onOff('r_fullscreen'),
        step: toggle('r_fullscreen'),
        choices: binary('r_fullscreen'),
        description: 'Take over the whole screen.'
      },
      {
        section: 'Display',
        label: 'Aspect',
        value: () => (cvars.get('r_aspect') === 'expand' ? 'Fill (expand)' : 'Letterbox'),
        step: () => cvars.set('r_aspect',
          cvars.get('r_aspect') === 'expand' ? 'letterbox' : 'expand'),
        choices: () => ({ index: cvars.get('r_aspect') === 'expand' ? 1 : 0, count: 2 }),
        description: 'Letterbox keeps the design frame; Fill widens the view to the window instead.'
      },
      // A 3D game has one renderer; the row then only says so.
      game.renderer.dimensions === 3
        ? {
          section: 'Rendering',
          label: 'Renderer',
          value: () => 'WebGPU',
          step: () => {},
          choices: () => ({ index: 0, count: 1 }),
          description: 'The 3D renderer. A 3D game has no other.'
        }
        : {
          section: 'Rendering',
          label: 'Renderer',
          value: () => (cvars.get('r_renderer') === 'webgl' ? 'WebGL 2' : 'Canvas 2D'),
          step: () => cvars.set('r_renderer',
            cvars.get('r_renderer') === 'webgl' ? 'canvas' : 'webgl'),
          choices: () => ({ index: cvars.get('r_renderer') === 'webgl' ? 1 : 0, count: 2 }),
          description: 'The drawing backend. Reloads the page. WebGL 2 has lights, bloom and batching.'
        },
      ...(cvars.has('r_shadows') ? [{
        section: 'Rendering',
        label: 'Shadows',
        value: () => SHADOW_LABELS[cvars.get('r_shadows')] ?? cvars.get('r_shadows'),
        step: (step) => {
          const levels = Object.keys(SHADOW_LABELS);
          const index = levels.indexOf(cvars.get('r_shadows'));
          cvars.set('r_shadows', levels[(index + (step ?? 1) + levels.length) % levels.length]);
        },
        choices: () => ({ index: Math.max(0, Object.keys(SHADOW_LABELS).indexOf(cvars.get('r_shadows'))), count: 4 }),
        description: 'How many shadow cascades the sun gets and how many spot lights cast shadows.'
      }] : []),
      {
        section: 'Rendering',
        label: 'Debug overlay',
        value: onOff('r_debug'),
        step: toggle('r_debug'),
        choices: binary('r_debug'),
        description: 'Bounds, velocities, ranges and readouts over every entity.'
      },
      {
        section: 'Game',
        label: 'Paused',
        value: onOff('g_paused'),
        step: toggle('g_paused'),
        choices: binary('g_paused'),
        description: 'Freeze the simulation. The menu keeps working.'
      }
    ];

    // A custom row joins its section if a built-in one exists; the rest of
    // the sections appear in the order the game added them.
    const items = [...builtIn];
    for (const item of this.customItems) {
      const section = item.section ?? 'Game';
      let at = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].section === section) { at = i; break; }
      }
      const placed = { ...item, section };
      if (at >= 0) items.splice(at + 1, 0, placed);
      else items.push(placed);
    }

    // Every game with a main menu can get back to it from here. The scene
    // is named by convention (`mainMenu`, the same one the game-over screen
    // returns to); the row hides when there is none, or when it is showing.
    const menuScene = 'mainMenu';
    const inMenu = game.sceneManager?.getCurrentScene()?.config?.name === menuScene;
    if (game.sceneManager?.has?.(menuScene) && !inMenu) {
      items.push({
        gap: 10,
        label: 'Main menu',
        value: () => '→',
        activate: () => {
          this.close();
          Promise.resolve(game.sceneManager.switchTo(menuScene))
            .catch((error) => console.error('Settings: cannot switch to the main menu', error));
        },
        description: 'Leave the game and return to the main menu.'
      });
    }

    items.push({
      gap: inMenu || !game.sceneManager?.has?.(menuScene) ? 10 : 0,
      label: 'Close',
      value: () => `(${game.input.keyLabel(this.hotkey)})`,
      activate: () => this.close(),
      description: 'Back to the game.'
    });
    return items;
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
    if (this.catcher) {
      this.game.ui.debug.remove(this.catcher);
      this.catcher = null;
    }
    if (this.game.settings === this) this.game.settings = null;
  }
}

/** A resolution preset as `r_resolution` text. */
function serializePreset(preset) {
  if (preset === 'native' || preset == null) return 'native';
  if (typeof preset === 'object') return `${preset.width ?? '?'}x${preset.height}`;
  return String(preset);
}
