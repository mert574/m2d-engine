import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createCanvasElement } from './helpers/environment.js';
import { M2D } from '../src/core/m2d.js';
import { SettingsMenu } from '../src/core/ui/settingsMenu.js';
import { UIOptionRow } from '../src/core/ui/optionRow.js';
import { keyDown, keyUp } from './helpers/input.js';

/**
 * The settings overlay every example mounts: resolution, fullscreen, aspect.
 *
 * It is a `UIScreen` built from components, so these tests drive it the way
 * a player does — pushing it onto `game.ui` and routing real input at the
 * rows' own positions, rather than poking at a private hit-rect array.
 */

function displayCanvas(cssWidth, cssHeight) {
  const canvas = createCanvasElement(cssWidth, cssHeight);
  Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight });
  return canvas;
}

function makeGameWithMenu(options = {}, menuOptions = {}) {
  const game = new M2D(displayCanvas(1280, 720), {
    width: 1280, height: 720, renderer: 'canvas', performanceStats: false, ...options
  });
  const menu = new SettingsMenu(game, menuOptions);
  return { game, menu };
}

/** Open the menu and run a frame, so the layout has placed the rows. */
function openAndLayout(game, menu) {
  menu.open();
  game.ui.update(0.016);
  return menu;
}

/** Every option row on the open menu, in order. */
function rows(menu) {
  const out = [];
  (function walk(element) {
    for (const child of element.children) {
      if (child instanceof UIOptionRow) out.push(child);
      walk(child);
    }
  })(menu.screen);
  return out;
}

/** The row with this label. */
function row(menu, label) {
  const found = rows(menu).find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled '${label}'`);
  return found;
}

/** Click a row where it actually sits, through the real routing. */
function clickRow(game, menu, label) {
  const target = row(menu, label);
  const frame = target.frame;
  const point = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  game.ui.handleInput(makeClick(game, point));
  game.ui.update(0.016);
}

function makeClick(game, point) {
  return game.input.makeSyntheticEvent('click', { ui: point, view: point, world: point });
}

describe('SettingsMenu', () => {
  beforeAll(() => {
    globalThis.document.addEventListener ??= () => {};
    globalThis.document.removeEventListener ??= () => {};
  });

  beforeEach(() => {
    globalThis.window = {
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  });

  it('mounts as game.settings without showing anything', () => {
    const { game, menu } = makeGameWithMenu();
    expect(game.settings).toBe(menu);
    expect(game.ui.has('settings')).toBe(false);
    // No screen is showing. The stack is not *empty* — the developer console
    // and the readout live in its debug layer from construction.
    expect(game.ui.screens).toHaveLength(0);
  });

  it('pushes a screen onto the stack when opened', () => {
    const { game, menu } = makeGameWithMenu();
    menu.open();

    expect(game.ui.has('settings')).toBe(true);
    expect(game.ui.top).toBe(menu.screen);
    expect(menu.isShowing).toBe(true);
  });

  it('builds a row for every item', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    expect(rows(menu).map((r) => r.label)).toEqual([
      'Resolution', 'Fullscreen', 'Aspect', 'Debug overlay', 'Renderer', 'Paused', 'Close'
    ]);
  });

  it('stacks the rows without overlapping them', () => {
    // The layout owns the spacing now; nothing hand-positions a row.
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    const frames = rows(menu).map((r) => r.frame);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].y).toBeGreaterThanOrEqual(frames[i - 1].y + frames[i - 1].height);
      expect(frames[i].x).toBe(frames[0].x);
      expect(frames[i].width).toBe(frames[0].width);
    }
  });

  it('offers a Debug overlay row that toggles the renderer flag', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);
    const before = game.renderer.isDebugEnabled();

    clickRow(game, menu, 'Debug overlay');

    expect(game.renderer.isDebugEnabled()).toBe(!before);
  });

  it('cycles the resolution presets on click, world surface only', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);
    const view = { width: game.viewport.viewWidth, height: game.viewport.viewHeight };

    clickRow(game, menu, 'Resolution');

    expect(game.resolution).not.toBe('native');
    // Lowering the resolution makes the world coarser, never narrower.
    expect(game.viewport.viewWidth).toBe(view.width);
    expect(game.viewport.viewHeight).toBe(view.height);
  });

  it('toggles the aspect mode on click', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    clickRow(game, menu, 'Aspect');
    expect(game.aspectMode).toBe('expand');

    clickRow(game, menu, 'Aspect');
    expect(game.aspectMode).toBe('letterbox');
  });

  it('offers a Paused row that toggles the engine flag', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    clickRow(game, menu, 'Paused');
    expect(game.paused).toBe(true);

    clickRow(game, menu, 'Paused');
    expect(game.paused).toBe(false);
  });

  it('reports the live value on every row', () => {
    // Values are read through a function, not cached, so a setting changed
    // from anywhere else is reflected without telling the row.
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    expect(row(menu, 'Aspect').valueText).toBe('Letterbox');
    game.setAspectMode('expand');
    expect(row(menu, 'Aspect').valueText).toBe('Fill (expand)');
  });

  it('closes via the Close row', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    clickRow(game, menu, 'Close');

    expect(game.ui.has('settings')).toBe(false);
  });

  it('closes on a click outside the panel, consuming it', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    const event = makeClick(game, { x: 20, y: 20 });
    game.ui.handleInput(event);

    expect(game.ui.has('settings')).toBe(false);
    expect(event.consumed).toBe(true);
  });

  it('stays centred when the UI space is wider than the design', () => {
    const { game, menu } = makeGameWithMenu({ aspectMode: 'expand' });
    openAndLayout(game, menu);

    const panel = menu.screen.panel.frame;
    const centre = panel.x + panel.width / 2;
    expect(centre).toBeCloseTo(game.uiRenderer.width / 2, 1);
  });

  it('sizes the panel to its rows', () => {
    const { game, menu } = makeGameWithMenu();
    openAndLayout(game, menu);

    const panel = menu.screen.panel;
    const padding = panel.padding.top + panel.padding.bottom;
    expect(panel.height).toBeCloseTo(menu.screen.stack.height + padding, 1);
  });

  describe('the hotkey', () => {
    it('opens the menu', () => {
      const { game, menu } = makeGameWithMenu();
      keyDown(game, 'KeyO');
      expect(game.ui.has('settings')).toBe(true);
      expect(menu).toBeTruthy();
    });

    it('closes it again', () => {
      // A blocking screen consumes input before subscribers run, so the
      // screen has to answer the hotkey itself or it could never be closed
      // by the key that opened it.
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      keyDown(game, 'KeyO');

      expect(game.ui.has('settings')).toBe(false);
    });

    it('is reported on the Close row using the layout label', () => {
      const { game, menu } = makeGameWithMenu(undefined, { hotkey: 'KeyP' });
      openAndLayout(game, menu);
      expect(row(menu, 'Close').valueText).toBe(`(${game.input.keyLabel('KeyP')})`);
    });
  });

  describe('Escape', () => {
    it('closes the menu', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      keyDown(game, 'Escape');

      expect(game.ui.has('settings')).toBe(false);
    });

    it('never opens it', () => {
      const { game } = makeGameWithMenu();
      keyDown(game, 'Escape');
      expect(game.ui.has('settings')).toBe(false);
    });
  });

  describe('keyboard capture while open', () => {
    it('keeps game keys away from the game', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      keyDown(game, 'KeyW');

      expect(game.input.isDown('KeyW')).toBe(false);
    });

    it('still reports a release, so a key held when it opened does not stick', () => {
      const { game, menu } = makeGameWithMenu();
      keyDown(game, 'KeyW');
      expect(game.input.isDown('KeyW')).toBe(true);

      openAndLayout(game, menu);
      keyUp(game, 'KeyW');

      expect(game.input.isDown('KeyW')).toBe(false);
    });
  });

  describe('keyboard navigation', () => {
    it('focuses the first row on open, so a controller can use it at once', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      expect(menu.screen.focus.focused).toBe(row(menu, 'Resolution'));
    });

    it('moves down the rows with the arrow keys', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      keyDown(game, 'ArrowDown');
      expect(menu.screen.focus.focused).toBe(row(menu, 'Fullscreen'));

      keyDown(game, 'ArrowUp');
      expect(menu.screen.focus.focused).toBe(row(menu, 'Resolution'));
    });

    it('wraps around with Tab', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);
      const all = rows(menu);

      for (let i = 0; i < all.length; i++) keyDown(game, 'Tab');

      expect(menu.screen.focus.focused).toBe(all[0]);
    });

    it('activates the focused row with Enter', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);
      keyDown(game, 'ArrowDown');
      keyDown(game, 'ArrowDown');
      expect(menu.screen.focus.focused).toBe(row(menu, 'Aspect'));

      keyDown(game, 'Enter');

      expect(game.aspectMode).toBe('expand');
    });
  });

  describe('pause', () => {
    it('leaves the game running unless asked', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);
      expect(game.paused).toBe(false);
    });

    it('pauses while open with pauseWhenOpen', () => {
      const { game, menu } = makeGameWithMenu(undefined, { pauseWhenOpen: true });
      openAndLayout(game, menu);
      expect(game.paused).toBe(true);

      menu.close();
      expect(game.paused).toBe(false);
    });

    it('does not resume a game that was already paused', () => {
      const { game, menu } = makeGameWithMenu(undefined, { pauseWhenOpen: true });
      game.paused = true;

      openAndLayout(game, menu);
      menu.close();

      expect(game.paused).toBe(true);
    });
  });

  describe('teardown', () => {
    it('unregisters everything on destroy', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      menu.destroy();

      expect(game.settings).toBe(null);
      expect(game.ui.has('settings')).toBe(false);
      // The hotkey subscription is gone with it.
      keyDown(game, 'KeyO');
      expect(game.ui.has('settings')).toBe(false);
    });

    it('is torn down by game.destroy()', () => {
      const { game, menu } = makeGameWithMenu();
      openAndLayout(game, menu);

      game.destroy();

      expect(game.ui.screens).toHaveLength(0);
      expect(menu.isShowing).toBe(false);
    });
  });
});
