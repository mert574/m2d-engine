import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIScreen } from '../src/core/ui/screen.js';
import { UIElement } from '../src/core/ui/uiElement.js';
import { UIButton } from '../src/core/ui/button.js';
import { UIPanel } from '../src/core/ui/panel.js';
import { Stack } from '../src/core/ui/layout/stack.js';
import { Grid } from '../src/core/ui/layout/grid.js';
import { makeTestGame } from './helpers/testGame.js';
import { click, pointerMove } from './helpers/input.js';

/**
 * Screens, the stack that holds them and the focus navigation inside them.
 *
 * Together these are what lets a menu sit over a live game and be driven
 * from a keyboard — neither of which the engine could do when a menu was a
 * scene and an overlay was an unordered `Set`.
 */
describe('screens', () => {
  let game;
  let ui;

  beforeEach(() => {
    game = makeTestGame();
    ui = game.ui;
  });

  /** A screen with `count` focusable buttons in a column. */
  function menuScreen(name, count = 3, options = {}) {
    const screen = new UIScreen({ name, ...options });
    const stack = screen.add(new Stack({ anchor: 'center', pivot: 'center', gap: 0, align: 'start' }));
    for (let i = 0; i < count; i++) {
      stack.add(new UIButton({ width: 100, height: 20, text: `item ${i}` }));
    }
    screen.items = stack.children;
    return screen;
  }

  /** Run one engine UI frame. */
  function frame(seconds = 0.016) {
    game.motion.update(seconds);
    ui.update(seconds);
  }

  /** Run far enough that any entrance or exit animation has finished. */
  function settle() {
    frame(1);
  }

  function keydown(code, modifiers = {}) {
    const event = game.input.makeSyntheticEvent('keydown', {
      code,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false, ...modifiers }
    });
    ui.handleInput(event);
    return event;
  }

  describe('the stack', () => {
    it('starts empty', () => {
      expect(ui.top).toBe(null);
      expect(ui.isEmpty).toBe(true);
      expect(ui.capturesInput).toBe(false);
    });

    it('pushes and pops, reporting the top', () => {
      const a = ui.push(new UIScreen({ name: 'a' }));
      const b = ui.push(new UIScreen({ name: 'b' }));

      expect(ui.top).toBe(b);
      expect(ui.has('a')).toBe(true);

      expect(ui.pop()).toBe(b);
      expect(ui.top).toBe(a);
    });

    it('runs onEnter and onExit around the push and pop', () => {
      const order = [];
      const screen = new UIScreen({ name: 'a' });
      screen.onEnter = () => order.push('enter');
      screen.onExit = () => order.push('exit');

      ui.push(screen);
      ui.pop();

      expect(order).toEqual(['enter', 'exit']);
    });

    it('ignores a double push of the same screen', () => {
      const screen = new UIScreen({ name: 'a' });
      ui.push(screen);
      ui.push(screen);
      expect(ui.screens).toHaveLength(1);
    });

    it('pops back to a named screen', () => {
      ui.push(new UIScreen({ name: 'pause' }));
      ui.push(new UIScreen({ name: 'settings' }));
      ui.push(new UIScreen({ name: 'audio' }));

      ui.popTo('pause');

      expect(ui.top.name).toBe('pause');
      expect(ui.screens).toHaveLength(1);
    });

    it('does nothing when popTo names a screen that is not there', () => {
      ui.push(new UIScreen({ name: 'a' }));
      expect(ui.popTo('nope')).toBe(null);
      expect(ui.screens).toHaveLength(1);
    });

    it('replaces the top without deepening the stack', () => {
      ui.push(new UIScreen({ name: 'a' }));
      ui.replace(new UIScreen({ name: 'b' }));

      expect(ui.screens).toHaveLength(1);
      expect(ui.top.name).toBe('b');
    });

    it('closes itself through the screen', () => {
      const screen = ui.push(new UIScreen({ name: 'a' }));
      screen.close();
      expect(ui.has('a')).toBe(false);
    });

    it('removes a screen from the middle of the stack', () => {
      const a = ui.push(new UIScreen({ name: 'a' }));
      const b = ui.push(new UIScreen({ name: 'b' }));

      ui.remove(a);

      expect(ui.screens).toEqual([b]);
    });
  });

  describe('pausing', () => {
    it('freezes the game while a pausing screen is up', () => {
      const screen = new UIScreen({ name: 'pause', pauseGame: true });

      ui.push(screen);
      expect(game.paused).toBe(true);

      ui.pop();
      expect(game.paused).toBe(false);
    });

    it('does not resume a game that was already paused', () => {
      game.paused = true;
      ui.push(new UIScreen({ name: 'pause', pauseGame: true }));
      ui.pop();
      expect(game.paused).toBe(true);
    });

    it('stays paused while any pausing screen remains', () => {
      // Two screens must not fight over one boolean.
      ui.push(new UIScreen({ name: 'a', pauseGame: true }));
      ui.push(new UIScreen({ name: 'b', pauseGame: true }));

      ui.pop();
      expect(game.paused).toBe(true);

      ui.pop();
      expect(game.paused).toBe(false);
    });

    it('leaves the game running for a non-pausing screen', () => {
      ui.push(new UIScreen({ name: 'hud' }));
      expect(game.paused).toBe(false);
    });
  });

  describe('modality', () => {
    it('consumes input while blocking', () => {
      ui.push(new UIScreen({ name: 'a' }));
      const event = game.input.makeSyntheticEvent('click');

      ui.handleInput(event);

      expect(event.consumed).toBe(true);
      expect(ui.capturesInput).toBe(true);
    });

    it('passes input through when not blocking', () => {
      ui.push(new UIScreen({ name: 'hud', blocking: false }));
      const event = game.input.makeSyntheticEvent('click');

      ui.handleInput(event);

      expect(event.consumed).toBe(false);
      expect(ui.capturesInput).toBe(false);
    });

    it('stops at the first blocking screen from the top', () => {
      const under = ui.push(new UIScreen({ name: 'under' }));
      ui.push(new UIScreen({ name: 'over' }));
      const seen = [];
      under.handleInput = () => seen.push('under');

      ui.handleInput(game.input.makeSyntheticEvent('click'));

      expect(seen).toHaveLength(0);
    });

    it('lets a non-blocking screen above a blocking one still see events', () => {
      const blocking = ui.push(new UIScreen({ name: 'menu' }));
      const hud = ui.push(new UIScreen({ name: 'hud', blocking: false }));
      const seen = [];
      hud.handleInput = (event) => { seen.push(event.type); };
      blocking.handleInput = (event) => event.consume();

      ui.handleInput(game.input.makeSyntheticEvent('click'));

      expect(seen).toEqual(['click']);
    });

    it('draws a scrim when asked', () => {
      ui.push(new UIScreen({ name: 'a', scrim: true }));
      settle();
      game.renderer.reset();

      ui.draw(0.016);

      expect(game.renderer.optionsFor('drawRect')[0]).toMatchObject({
        x: 0, y: 0, width: 800, height: 600,
        fillStyle: game.theme.resolve('$color.bg.scrim')
      });
    });
  });

  describe('ordering', () => {
    it('draws screens bottom-up, then the debug layer', () => {
      const marker = (label) => {
        const element = new UIElement({ width: 10, height: 10 });
        element.draw = () => element.paint.drawRect({
          x: 0, y: 0, width: 1, height: 1, fillStyle: label
        });
        return element;
      };
      ui.push(new UIScreen({ name: 'a' })).add(marker('#a00000'));
      ui.push(new UIScreen({ name: 'b' })).add(marker('#00b000'));
      ui.debug.add(marker('#0000c0'));
      settle();

      game.renderer.reset();
      ui.draw(0.016);

      expect(game.renderer.optionsFor('drawRect').map((c) => c.fillStyle))
        .toEqual(['#a00000', '#00b000', '#0000c0']);
    });

    it('gives the debug layer input before any screen', () => {
      // The developer console has to be able to take keys away from a menu.
      const order = [];
      const probe = new UIElement({ width: 800, height: 600, pivot: 'top-left' });
      probe.handleInput = (event) => { order.push('debug'); event.consume(); };
      ui.debug.add(probe);
      const screen = ui.push(new UIScreen({ name: 'a' }));
      screen.handleInput = () => order.push('screen');

      ui.handleInput(game.input.makeSyntheticEvent('click', {
        ui: { x: 10, y: 10 }, view: { x: 10, y: 10 }, world: { x: 10, y: 10 }
      }));

      expect(order).toEqual(['debug']);
    });
  });

  describe('routed input', () => {
    it('delivers a click to the control under the pointer', () => {
      const clicks = [];
      const screen = ui.push(new UIScreen({ name: 'a' }));
      const button = screen.add(new UIButton({
        anchor: 'center', width: 100, height: 40, text: 'Go', onClick: () => clicks.push(1)
      }));
      frame();

      click(game, button.x, button.y);

      expect(clicks).toHaveLength(1);
    });

    it('keeps the click away from the scene and world beneath it', () => {
      const screen = ui.push(new UIScreen({ name: 'a' }));
      screen.add(new UIButton({ anchor: 'center', width: 100, height: 40, text: 'Go' }));
      const worldClicks = [];
      game.input.on('click', (event) => worldClicks.push(event));
      frame();

      click(game, 10, 10);

      expect(worldClicks).toHaveLength(0);
    });

    it('hovers a control through the stack', () => {
      const screen = ui.push(new UIScreen({ name: 'a' }));
      const button = screen.add(new UIButton({
        anchor: 'center', width: 100, height: 40, text: 'Go'
      }));
      frame();

      pointerMove(game, button.x, button.y);
      expect(button.isHovered).toBe(true);

      pointerMove(game, 5, 5);
      expect(button.isHovered).toBe(false);
    });
  });

  describe('focus', () => {
    it('focuses the first control on entry', () => {
      const screen = ui.push(menuScreen('menu'));
      frame();
      expect(screen.focus.focused).toBe(screen.items[0]);
    });

    it('leaves focus alone when autoFocus is off', () => {
      const screen = ui.push(menuScreen('menu', 3, { autoFocus: false }));
      frame();
      expect(screen.focus.focused).toBe(null);
    });

    it('walks forward and back with Tab', () => {
      const screen = ui.push(menuScreen('menu'));
      frame();

      keydown('Tab');
      expect(screen.focus.focused).toBe(screen.items[1]);

      keydown('Tab', { shift: true });
      expect(screen.focus.focused).toBe(screen.items[0]);
    });

    it('wraps at both ends', () => {
      const screen = ui.push(menuScreen('menu'));
      frame();

      keydown('Tab', { shift: true });
      expect(screen.focus.focused).toBe(screen.items[2]);

      keydown('Tab');
      expect(screen.focus.focused).toBe(screen.items[0]);
    });

    it('moves down a column with the arrow keys', () => {
      const screen = ui.push(menuScreen('menu'));
      frame();

      keydown('ArrowDown');
      expect(screen.focus.focused).toBe(screen.items[1]);

      keydown('ArrowUp');
      expect(screen.focus.focused).toBe(screen.items[0]);
    });

    it('stops at the end of a column rather than wrapping', () => {
      // Directional movement is geometric: there is nothing below the last
      // item, so pressing down again is a no-op. Tab is what wraps.
      const screen = ui.push(menuScreen('menu'));
      frame();

      keydown('ArrowDown');
      keydown('ArrowDown');
      keydown('ArrowDown');

      expect(screen.focus.focused).toBe(screen.items[2]);
    });

    it('moves sideways in a grid, not to the next item in the list', () => {
      // The whole reason navigation is geometric rather than tree-ordered.
      const screen = new UIScreen({ name: 'grid' });
      const grid = screen.add(new Grid({
        anchor: 'center', pivot: 'center', columns: 2, gap: 10, align: 'start'
      }));
      const cells = [];
      for (let i = 0; i < 4; i++) {
        cells.push(grid.add(new UIButton({ width: 80, height: 30, text: `${i}` })));
      }
      ui.push(screen);
      frame();

      expect(screen.focus.focused).toBe(cells[0]);
      keydown('ArrowRight');
      expect(screen.focus.focused).toBe(cells[1]);
      keydown('ArrowDown');
      expect(screen.focus.focused).toBe(cells[3]);
      keydown('ArrowLeft');
      expect(screen.focus.focused).toBe(cells[2]);
    });

    it('prefers a candidate aligned on the perpendicular axis', () => {
      // A nearer but badly misaligned control should not win: pressing down
      // a column has to keep travelling down that column.
      const screen = new UIScreen({ name: 'mixed' });
      const start = screen.add(new UIButton({ x: 100, y: 100, width: 60, height: 20, text: 'a' }));
      const below = screen.add(new UIButton({ x: 100, y: 200, width: 60, height: 20, text: 'b' }));
      screen.add(new UIButton({ x: 400, y: 130, width: 60, height: 20, text: 'c' }));
      ui.push(screen);
      frame();
      screen.focus.focus(start);

      keydown('ArrowDown');

      expect(screen.focus.focused).toBe(below);
    });

    it('activates the focused control with Enter and Space', () => {
      let clicks = 0;
      const screen = new UIScreen({ name: 'a' });
      screen.add(new UIButton({
        anchor: 'center', width: 100, height: 40, text: 'Go', onClick: () => { clicks++; }
      }));
      ui.push(screen);
      frame();

      keydown('Enter');
      expect(clicks).toBe(1);

      keydown('Space');
      expect(clicks).toBe(2);
    });

    it('activates as a real press and release, so pressed state behaves', () => {
      const screen = new UIScreen({ name: 'a' });
      const button = screen.add(new UIButton({
        anchor: 'center', width: 100, height: 40, text: 'Go'
      }));
      ui.push(screen);
      frame();

      keydown('Enter');

      // Pressed and released within the activation, not left stuck down.
      expect(button.isPressed).toBe(false);
    });

    it('skips a disabled control', () => {
      const screen = menuScreen('menu');
      screen.items[1].enabled = false;
      ui.push(screen);
      frame();

      keydown('Tab');

      expect(screen.focus.focused).toBe(screen.items[2]);
    });

    it('skips a hidden control', () => {
      const screen = menuScreen('menu');
      screen.items[1].visible = false;
      ui.push(screen);
      frame();

      keydown('ArrowDown');

      expect(screen.focus.focused).toBe(screen.items[2]);
    });

    it('does not escape the screen it belongs to', () => {
      // Tab inside a dialog must not walk into the game behind it.
      const under = ui.push(menuScreen('under'));
      const over = ui.push(menuScreen('over'));
      frame();

      for (let i = 0; i < 6; i++) keydown('Tab');

      expect(over.focus.candidates()).toHaveLength(3);
      expect(over.focus.candidates()).not.toContain(under.items[0]);
    });

    it('drops focus when the focused control goes away', () => {
      const screen = ui.push(menuScreen('menu'));
      frame();
      const focused = screen.focus.focused;

      focused.removeFromParent();
      frame();

      expect(screen.focus.focused).toBe(null);
      expect(focused.isFocused).toBe(false);
    });

    it('moves focus to a control the pointer presses', () => {
      const screen = ui.push(menuScreen('menu'));
      frame();

      click(game, screen.items[2].x, screen.items[2].y);

      expect(screen.focus.focused).toBe(screen.items[2]);
    });

    it('restores the lower screen focus when the upper one pops', () => {
      const under = ui.push(menuScreen('under'));
      frame();
      under.focus.focus(under.items[1]);

      ui.push(menuScreen('over'));
      frame();
      ui.pop();

      expect(under.focus.focused).toBe(under.items[1]);
    });

    it('renders the focused control as hovered, with no ring', () => {
      const screen = ui.push(menuScreen('menu'));
      settle();
      expect(screen.focus.focused).toBe(screen.items[0]);
      game.renderer.reset();

      ui.draw(0.016);

      // The selected item looks exactly like a hovered one...
      expect(screen.items[0].state).toBe('hovered');
      expect(screen.items[1].state).toBe('normal');
      // ...and nothing draws a ring around it.
      const rings = game.renderer.optionsFor('drawRect').filter(
        (call) => call.strokeStyle === game.theme.resolve('$color.border.focus')
      );
      expect(rings).toHaveLength(0);
    });

    it('hands focus to whatever the pointer hovers, so only one lights up', () => {
      const screen = ui.push(menuScreen('menu'));
      settle();
      expect(screen.focus.focused).toBe(screen.items[0]);

      pointerMove(game, screen.items[2].x, screen.items[2].y);

      expect(screen.focus.focused).toBe(screen.items[2]);
      expect(screen.items[0].state).toBe('normal');
      expect(screen.items[2].state).toBe('hovered');
    });
  });

  describe('Escape', () => {
    it('pops the screen', () => {
      ui.push(new UIScreen({ name: 'a' }));
      keydown('Escape');
      expect(ui.has('a')).toBe(false);
    });

    it('leaves a screen that opts out', () => {
      ui.push(new UIScreen({ name: 'a', closeOnEscape: false }));
      keydown('Escape');
      expect(ui.has('a')).toBe(true);
    });

    it('unwinds one screen at a time', () => {
      ui.push(new UIScreen({ name: 'pause' }));
      ui.push(new UIScreen({ name: 'settings' }));

      keydown('Escape');
      expect(ui.top.name).toBe('pause');

      keydown('Escape');
      expect(ui.top).toBe(null);
    });
  });

  describe('teardown', () => {
    it('clears the screens and the debug layer', () => {
      ui.push(new UIScreen({ name: 'a' }));
      ui.debug.add(new UIElement({}));

      ui.destroy();

      expect(ui.screens).toHaveLength(0);
      expect(ui.debug.children).toHaveLength(0);
    });

    it('runs onExit for everything it pops', () => {
      const onExit = vi.fn();
      const screen = new UIScreen({ name: 'a' });
      screen.onExit = onExit;
      ui.push(screen);

      ui.destroy();

      expect(onExit).toHaveBeenCalledOnce();
    });
  });

  describe('panels in a screen', () => {
    it('sizes a fitContent panel to its contents', () => {
      const screen = ui.push(new UIScreen({ name: 'a' }));
      const panel = screen.add(new UIPanel({
        anchor: 'center', padding: 10, fitContent: true
      }));
      const stack = panel.add(new Stack({ gap: 0, align: 'start' }));
      stack.add(new UIButton({ width: 120, height: 30, text: 'a' }));
      stack.add(new UIButton({ width: 120, height: 30, text: 'b' }));

      frame();

      expect(panel.width).toBe(140);
      expect(panel.height).toBe(80);
    });
  });
});
