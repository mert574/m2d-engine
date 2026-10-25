/**
 * In-game settings overlay: resolution, fullscreen, aspect mode and pause.
 *
 * One instance per game covers every scene: it is an *overlay*, drawn by the
 * engine after the scene's own UI (`M2D.drawOverlays`), and it listens for
 * pointer and keyboard events on `window` in the capture phase so that, while
 * open, input lands here and never reaches scene UI, game-level click
 * handlers or the game's key bindings underneath. (Key *releases* are let
 * through on purpose: a key held down when the menu opened must still release
 * in the game's state, or the player would keep running after the menu
 * closes.)
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
 * The game can reach the mounted menu through `game.settings` — this is how a
 * scene's own "Settings" button opens it (`{"action": "settings"}` in scene
 * JSON ends up calling `game.settings.open()`).
 *
 * Opening does **not** pause the game unless the developer opts in with
 * `pauseWhenOpen: true`; either way the menu offers a Paused row that toggles
 * `game.paused` directly.
 *
 * Games that replace the engine loop must call `game.drawOverlays()` at the
 * end of their own frame (see the doner example).
 */

import { sameResolution } from '../viewport.js';

/** Scale presets offered as resolutions, besides 'native'. */
const DEFAULT_SCALES = [1, 0.75, 0.5, 0.25];

export class SettingsMenu {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options]
   * @param {string} [options.hotkey='o'] - Key that toggles the menu
   * @param {Array<'native'|number|{width?: number, height: number}>} [options.resolutions] -
   *   Choices offered; 'native', scale factors of the design size, or presets
   * @param {boolean} [options.pauseWhenOpen=false] - Pause the game while the
   *   menu is open, restoring the previous pause state on close
   */
  constructor(game, options = {}) {
    this.game = game;
    this.isOpen = false;
    this.hotkey = options.hotkey || 'o';
    this.resolutions = options.resolutions || ['native', ...DEFAULT_SCALES];
    this.pauseWhenOpen = options.pauseWhenOpen ?? false;
    /** Whether closing should resume the game; captured when opening pauses it. */
    this.resumeOnClose = false;

    /** Hit rects in UI coordinates, rebuilt by every draw. */
    this.rows = [];
    this.hoverIndex = -1;

    game.keys.addKey(this.hotkey, (pressed) => { if (pressed) this.toggle(); });

    // Capture phase on window: while the menu is open these run before any
    // canvas or document listener a scene registered, and stop the event so
    // nothing underneath reacts to input meant for the menu. This includes
    // the game's own key bindings (KeyStates listens on document), which is
    // why closing via the hotkey or Escape is handled right here — the
    // KeyStates binding above only ever *opens* the menu.
    this.onMouseDown = (event) => {
      if (!this.isOpen) return;
      event.stopPropagation();
      const { x, y } = this.game.getUIPosition(event);
      this.handleMouseDown(x, y);
    };
    this.onMouseMove = (event) => {
      if (!this.isOpen) return;
      event.stopPropagation();
      const { x, y } = this.game.getUIPosition(event);
      this.handleMouseMove(x, y);
    };
    this.onKeyDown = (event) => {
      if (!this.isOpen) return;
      event.stopPropagation();
      if (event.key === this.hotkey || event.key === 'Escape') this.close();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', this.onMouseDown, true);
      window.addEventListener('mousemove', this.onMouseMove, true);
      window.addEventListener('keydown', this.onKeyDown, true);
    }

    game.overlays.add(this);
    /** The mounted menu, reachable by scene UI (e.g. a Settings button). */
    game.settings = this;
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', this.onMouseDown, true);
      window.removeEventListener('mousemove', this.onMouseMove, true);
      window.removeEventListener('keydown', this.onKeyDown, true);
    }
    this.game.keys.removeKey(this.hotkey);
    this.game.overlays.delete(this);
    if (this.game.settings === this) this.game.settings = null;
  }

  /** Open the menu (no-op when already open). */
  open() {
    if (!this.isOpen) this.toggle();
  }

  /** Close the menu (no-op when already closed). */
  close() {
    if (this.isOpen) this.toggle();
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      if (this.pauseWhenOpen) {
        // Restore, don't just resume: a game paused before the menu opened
        // stays paused after it closes.
        this.resumeOnClose = !this.game.paused;
        this.game.paused = true;
      }
    } else {
      if (this.pauseWhenOpen && this.resumeOnClose) this.game.paused = false;
      this.hoverIndex = -1;
      this.game.uiRenderer.setCursor('default');
    }
  }

  /** The menu's rows: label, current value, and what a click does. */
  #items() {
    const game = this.game;
    return [
      {
        label: 'Resolution',
        value: this.#resolutionLabel(game.resolution),
        onClick: () => this.#cycleResolution(1)
      },
      {
        label: 'Fullscreen',
        value: game.isFullscreen ? 'On' : 'Off',
        onClick: () => game.toggleFullscreen()
      },
      {
        label: 'Aspect',
        value: game.aspectMode === 'expand' ? 'Fill (expand)' : 'Letterbox',
        onClick: () => game.setAspectMode(game.aspectMode === 'expand' ? 'letterbox' : 'expand')
      },
      {
        label: 'Paused',
        value: game.paused ? 'On' : 'Off',
        onClick: () => { game.paused = !game.paused; }
      },
      {
        label: 'Close',
        value: `(${this.hotkey.toUpperCase()})`,
        onClick: () => this.close()
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

  /** Advance to the next (or previous) resolution choice and apply it. */
  #cycleResolution(step) {
    const current = this.resolutions.findIndex(r => sameResolution(r, this.game.resolution));
    // An unlisted current value (set programmatically) starts the cycle over.
    const index = current < 0 ? 0 : (current + step + this.resolutions.length) % this.resolutions.length;
    this.game.setResolution(this.resolutions[index]);
  }

  /**
   * A click in UI coordinates. Public so games (and tests) that route their
   * own input can drive the menu without synthetic DOM events.
   * @returns {boolean} Whether the menu consumed the click
   */
  handleMouseDown(x, y) {
    if (!this.isOpen) return false;
    for (const row of this.rows) {
      const r = row.rect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        row.onClick();
        return true;
      }
    }
    // A click outside the panel closes the menu; either way it is consumed,
    // so a stray click can never fall through to the game.
    if (!this.#inPanel(x, y)) this.close();
    return true;
  }

  /** Pointer movement in UI coordinates, for hover highlights. */
  handleMouseMove(x, y) {
    if (!this.isOpen) return false;
    const index = this.rows.findIndex(({ rect: r }) =>
      x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
    if (index !== this.hoverIndex) {
      this.hoverIndex = index;
      this.game.uiRenderer.setCursor(index >= 0 ? 'pointer' : 'default');
    }
    return true;
  }

  #inPanel(x, y) {
    const p = this.panelRect;
    return p && x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height;
  }

  /** Panel geometry against the current UI size, so it stays centred. */
  #layout() {
    const ui = this.game.uiRenderer;
    const width = 340;
    const rowHeight = 44;
    const titleHeight = 52;
    const pad = 14;
    const items = this.#items();
    const height = titleHeight + items.length * rowHeight + pad;
    return {
      items,
      width,
      rowHeight,
      titleHeight,
      pad,
      x: (ui.width - width) / 2,
      y: (ui.height - height) / 2,
      height
    };
  }

  draw() {
    this.rows = [];
    this.panelRect = null;
    if (!this.isOpen) return;

    const ui = this.game.uiRenderer;
    const l = this.#layout();
    this.panelRect = { x: l.x, y: l.y, width: l.width, height: l.height };

    // Dim the game behind the menu.
    ui.drawRect({ x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: 'rgba(0, 0, 0, 0.55)' });

    ui.drawRect({
      x: l.x, y: l.y, width: l.width, height: l.height,
      fillStyle: 'rgba(12, 20, 30, 0.95)',
      strokeStyle: 'rgba(130, 190, 255, 0.5)',
      lineWidth: 1,
      cornerRadius: 10
    });

    ui.drawText({
      text: 'Settings',
      x: l.x + l.width / 2, y: l.y + l.titleHeight / 2 + 4,
      fillStyle: '#e8f4ff', fontSize: '20px', fontFamily: 'system-ui', fontWeight: 'bold',
      textAlign: 'center', textBaseline: 'middle'
    });

    l.items.forEach((item, index) => {
      const rect = {
        x: l.x + l.pad,
        y: l.y + l.titleHeight + index * l.rowHeight,
        width: l.width - 2 * l.pad,
        height: l.rowHeight - 6
      };
      this.rows.push({ rect, onClick: item.onClick });

      ui.drawRect({
        ...rect,
        fillStyle: index === this.hoverIndex ? 'rgba(90, 150, 220, 0.35)' : 'rgba(255, 255, 255, 0.06)',
        cornerRadius: 6
      });
      ui.drawText({
        text: item.label,
        x: rect.x + 12, y: rect.y + rect.height / 2,
        fillStyle: '#cfe8ff', fontSize: '15px', fontFamily: 'system-ui',
        textAlign: 'left', textBaseline: 'middle'
      });
      ui.drawText({
        text: item.value,
        x: rect.x + rect.width - 12, y: rect.y + rect.height / 2,
        fillStyle: '#8fd0a0', fontSize: '15px', fontFamily: 'system-ui',
        textAlign: 'right', textBaseline: 'middle'
      });
    });
  }
}
