import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { createCanvasElement, installWindowStub, displayCanvas, stubDocumentListeners } from './helpers/environment.js';
import { M2D } from '../src/core/m2d.js';
import { SettingsMenu } from '../src/core/ui/settingsMenu.js';
import { UIOptionRow } from '../src/core/ui/optionRow.js';
import { UIScreen } from '../src/core/ui/screen.js';
import { keyDown, keyUp } from './helpers/input.js';

/**
 * The settings overlay every example mounts: resolution, fullscreen, aspect.
 *
 * It is a `UIScreen` built from components. These tests push it onto
 * `game.ui` and drive it through synthetic row events and real key input,
 * never by poking at a private hit-rect array.
 */

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

/** A game with its menu already open and laid out: how most tests start. */
function openMenu(options, menuOptions) {
  const { game, menu } = makeGameWithMenu(options, menuOptions);
  openAndLayout(game, menu);
  return { game, menu };
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
  beforeAll(stubDocumentListeners);

  beforeEach(() => {
    installWindowStub();
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
    const { game, menu } = openMenu();

    expect(rows(menu).map((r) => r.label)).toEqual([
      'Resolution', 'Fullscreen', 'Aspect', 'Renderer', 'Debug overlay', 'Paused', 'Close'
    ]);
  });

  it('stacks the rows without overlapping them', () => {
    // The layout owns the spacing now; nothing hand-positions a row.
    const { game, menu } = openMenu();

    const frames = rows(menu).map((r) => r.frame);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].y).toBeGreaterThanOrEqual(frames[i - 1].y + frames[i - 1].height);
      expect(frames[i].x).toBe(frames[0].x);
      expect(frames[i].width).toBe(frames[0].width);
    }
  });

  it('offers a Debug overlay row that toggles the renderer flag', () => {
    const { game, menu } = openMenu();
    const before = game.renderer.isDebugEnabled();

    clickRow(game, menu, 'Debug overlay');

    expect(game.renderer.isDebugEnabled()).toBe(!before);
  });

  it('cycles the resolution presets on click, world surface only', () => {
    const { game, menu } = openMenu();
    const view = { width: game.viewport.viewWidth, height: game.viewport.viewHeight };

    clickRow(game, menu, 'Resolution');

    expect(game.resolution).not.toBe('native');
    // Lowering the resolution makes the world coarser, never narrower.
    expect(game.viewport.viewWidth).toBe(view.width);
    expect(game.viewport.viewHeight).toBe(view.height);
  });

  it('toggles the aspect mode on click', () => {
    const { game, menu } = openMenu();

    clickRow(game, menu, 'Aspect');
    expect(game.aspectMode).toBe('expand');

    clickRow(game, menu, 'Aspect');
    expect(game.aspectMode).toBe('letterbox');
  });

  it('offers a Main menu row when a mainMenu scene exists, outside of it', () => {
    const { game, menu } = makeGameWithMenu();
    game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: SCENE_VERSION, name: 'mainMenu', type: 'ui', elements: [] }) });
    game.sceneManager.switchTo = vi.fn(async () => {});
    openAndLayout(game, menu);
    expect(row(menu, 'Main menu')).toBeTruthy();

    clickRow(game, menu, 'Main menu');
    expect(game.sceneManager.switchTo).toHaveBeenCalledWith('mainMenu');
    expect(menu.isShowing).toBe(false);
  });

  it('hides the Main menu row without a mainMenu scene, and while it is showing', () => {
    const { menu } = makeGameWithMenu();
    menu.open();
    expect(() => row(menu, 'Main menu')).toThrow();
    menu.close();

    const { game: game2, menu: menu2 } = makeGameWithMenu();
    game2.sceneManager.addScene('mainMenu', { fetch: async () => ({}) });
    game2.sceneManager.currentScene = { config: { name: 'mainMenu' } };
    menu2.open();
    expect(() => row(menu2, 'Main menu')).toThrow();
  });

  it('offers a Paused row that toggles the engine flag', () => {
    const { game, menu } = openMenu();

    clickRow(game, menu, 'Paused');
    expect(game.paused).toBe(true);

    clickRow(game, menu, 'Paused');
    expect(game.paused).toBe(false);
  });

  it('reports the live value on every row', () => {
    // Values are read through a function, not cached, so a setting changed
    // from anywhere else is reflected without telling the row.
    const { game, menu } = openMenu();

    expect(row(menu, 'Aspect').valueText).toBe('Letterbox');
    game.setAspectMode('expand');
    expect(row(menu, 'Aspect').valueText).toBe('Fill (expand)');
  });

  it('adds a game row with addOption, into its section, before Close', () => {
    const { game, menu } = openMenu();
    // Added after the menu was built: the screen rebuilds on next open.
    let music = true;
    menu.close();
    menu.addOption({
      section: 'Game',
      label: 'Music',
      value: () => (music ? 'On' : 'Off'),
      step: () => { music = !music; }
    });
    openAndLayout(game, menu);

    const labels = rows(menu).map((r) => r.label);
    expect(labels).toEqual([
      'Resolution', 'Fullscreen', 'Aspect', 'Renderer', 'Debug overlay', 'Paused', 'Music', 'Close'
    ]);
    clickRow(game, menu, 'Music');
    expect(music).toBe(false);
  });

  it('groups an addOption row with an unknown section under its own caption', () => {
    const { game, menu } = makeGameWithMenu();
    menu.addOption({ section: 'Accessibility', label: 'Shake', value: () => 'On', step: () => {} });
    openAndLayout(game, menu);

    const labels = rows(menu).map((r) => r.label);
    expect(labels[labels.length - 2]).toBe('Shake');
    expect(labels[labels.length - 1]).toBe('Close');
  });

  it('closes via the Close row', () => {
    const { game, menu } = openMenu();

    clickRow(game, menu, 'Close');

    expect(game.ui.has('settings')).toBe(false);
  });

  it('closes on a click outside the panel, consuming it', () => {
    const { game, menu } = openMenu();

    const event = makeClick(game, { x: 20, y: 20 });
    game.ui.handleInput(event);

    expect(game.ui.has('settings')).toBe(false);
    expect(event.consumed).toBe(true);
  });

  it('stays centred when the UI space is wider than the design', () => {
    const { game, menu } = openMenu({ aspectMode: 'expand' });

    const panel = menu.screen.panel.frame;
    const centre = panel.x + panel.width / 2;
    expect(centre).toBeCloseTo(game.uiRenderer.width / 2, 1);
  });

  it('sizes the panel to its rows', () => {
    const { game, menu } = openMenu();

    const panel = menu.screen.panel;
    const padding = panel.padding.top + panel.padding.bottom;
    expect(panel.height).toBeCloseTo(menu.screen.stack.height + padding, 1);
  });

  describe('the hotkey', () => {
    it('opens the menu', () => {
      const { game, menu } = makeGameWithMenu();
      keyDown(game, 'KeyO');
      expect(game.ui.has('settings')).toBe(true);
    });

    it('opens over a blocking screen, such as a main menu', () => {
      // Subscribers run after the screen stack, and a blocking screen
      // consumes every key; the hotkey listens ahead of the screens instead.
      const { game } = makeGameWithMenu();
      game.ui.push(new UIScreen({ name: 'mainMenu', blocking: true, scrim: false, closeOnEscape: false }));
      game.ui.update(0.016);

      keyDown(game, 'KeyO');

      expect(game.ui.has('settings')).toBe(true);
      expect(game.ui.top.name).toBe('settings');
    });

    it('closes it again', () => {
      // A blocking screen consumes input before subscribers run, so the
      // screen has to answer the hotkey itself or it could never be closed
      // by the key that opened it.
      const { game, menu } = openMenu();

      keyDown(game, 'KeyO');

      expect(game.ui.has('settings')).toBe(false);
    });

    it('is reported on the Close row using the layout label', () => {
      const { game, menu } = openMenu(undefined, { hotkey: 'KeyP' });
      expect(row(menu, 'Close').valueText).toBe(`(${game.input.keyLabel('KeyP')})`);
    });
  });

  describe('Escape', () => {
    it('closes the menu', () => {
      const { game, menu } = openMenu();

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
      const { game, menu } = openMenu();

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
    it('moves down the rows with the arrow keys', () => {
      const { game, menu } = openMenu();

      keyDown(game, 'ArrowDown');
      expect(menu.screen.focus.focused).toBe(row(menu, 'Fullscreen'));

      keyDown(game, 'ArrowUp');
      expect(menu.screen.focus.focused).toBe(row(menu, 'Resolution'));
    });

    it('wraps around with Tab', () => {
      const { game, menu } = openMenu();
      const all = rows(menu);

      for (let i = 0; i < all.length; i++) keyDown(game, 'Tab');

      expect(menu.screen.focus.focused).toBe(all[0]);
    });

    it('steps the focused value with Left and Right', () => {
      const { game, menu } = openMenu();
      expect(menu.screen.focus.focused).toBe(row(menu, 'Resolution'));

      keyDown(game, 'ArrowRight');
      const stepped = game.resolution;
      expect(stepped).not.toBe('native');

      keyDown(game, 'ArrowLeft');
      expect(game.resolution).toBe('native');
      // Focus stayed put: sideways is the value, not the next row.
      expect(menu.screen.focus.focused).toBe(row(menu, 'Resolution'));
    });

    it('describes the focused row in the footer', () => {
      const { game, menu } = openMenu();

      expect(row(menu, 'Resolution').description).toMatch(/pixels/i);
      keyDown(game, 'ArrowDown');
      expect(menu.screen.focus.focused.description).toMatch(/screen/i);
    });

    it('activates the focused row with Enter', () => {
      const { game, menu } = openMenu();
      keyDown(game, 'ArrowDown');
      keyDown(game, 'ArrowDown');
      expect(menu.screen.focus.focused).toBe(row(menu, 'Aspect'));

      keyDown(game, 'Enter');

      expect(game.aspectMode).toBe('expand');
    });
  });

  describe('pause', () => {
    it('leaves the game running unless asked', () => {
      const { game, menu } = openMenu();
      expect(game.paused).toBe(false);
    });

    it('pauses while open with pauseWhenOpen', () => {
      const { game, menu } = openMenu(undefined, { pauseWhenOpen: true });
      expect(game.paused).toBe(true);

      menu.close();
      expect(game.paused).toBe(false);
    });

  });

  describe('teardown', () => {
    it('unregisters everything on destroy', () => {
      const { game, menu } = openMenu();

      menu.destroy();

      expect(game.settings).toBe(null);
      expect(game.ui.has('settings')).toBe(false);
      // The hotkey subscription is gone with it.
      keyDown(game, 'KeyO');
      expect(game.ui.has('settings')).toBe(false);
    });

    it('is torn down by game.destroy()', () => {
      const { game, menu } = openMenu();

      game.destroy();

      expect(game.ui.screens).toHaveLength(0);
      expect(menu.isShowing).toBe(false);
    });
  });
});
