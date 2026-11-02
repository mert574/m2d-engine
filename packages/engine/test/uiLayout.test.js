import { describe, it, expect, beforeEach } from 'vitest';
import { Stack, Spacer } from '../src/core/ui/layout/stack.js';
import { Grid } from '../src/core/ui/layout/grid.js';
import { UIElement } from '../src/core/ui/uiElement.js';
import { UIText } from '../src/core/ui/text.js';
import { Container } from '../src/core/ui/container.js';
import { makeTestGame } from './helpers/testGame.js';

/**
 * Layout containers. UI space in the recording game is 800x600, so every
 * expected coordinate below can be read off directly.
 */
describe('layout', () => {
  let game;
  let root;

  beforeEach(() => {
    game = makeTestGame();
    root = new Container(game);
  });

  /** A fixed-size box. */
  function box(width = 40, height = 20, options = {}) {
    return new UIElement({ width, height, ...options });
  }

  /** Run the frame that places everything. */
  function layout() {
    root.updateTree(0.016);
  }

  describe('Stack', () => {
    it('stacks a column top to bottom with the gap between items', () => {
      const stack = root.add(new Stack({ direction: 'column', gap: 10, align: 'start' }));
      const a = stack.add(box(40, 20));
      const b = stack.add(box(40, 30));
      const c = stack.add(box(40, 20));

      layout();

      expect(a.frame.y).toBe(0);
      expect(b.frame.y).toBe(30);
      expect(c.frame.y).toBe(70);
    });

    it('stacks a row left to right', () => {
      const stack = root.add(new Stack({ direction: 'row', gap: 8, align: 'start' }));
      const a = stack.add(box(40, 20));
      const b = stack.add(box(60, 20));

      layout();

      expect(a.frame.x).toBe(0);
      expect(b.frame.x).toBe(48);
    });

    it('sizes itself to its contents, plus padding', () => {
      const stack = root.add(new Stack({ direction: 'column', gap: 10, padding: 12 }));
      stack.add(box(40, 20));
      stack.add(box(60, 30));

      layout();

      // Cross axis takes the widest child; main axis sums heights and gaps.
      expect(stack.width).toBe(60 + 24);
      expect(stack.height).toBe(20 + 10 + 30 + 24);
    });

    it('resolves the gap from a theme token', () => {
      const stack = root.add(new Stack({ direction: 'column', gap: '$space.lg', align: 'start' }));
      const a = stack.add(box(40, 20));
      const b = stack.add(box(40, 20));

      layout();

      expect(b.frame.y - a.frame.y).toBe(20 + game.theme.get('space.lg'));
    });

    it('stretches children across the cross axis by default', () => {
      // What makes a column of buttons share one width without anyone
      // stating it.
      const stack = root.add(new Stack({ direction: 'column', width: 200 }));
      const a = stack.add(box(40, 20));
      const b = stack.add(box(60, 20));

      layout();

      expect(a.width).toBe(200);
      expect(b.width).toBe(200);
    });

    it('centres children on the cross axis with align: center', () => {
      const stack = root.add(new Stack({
        direction: 'column', width: 200, align: 'center'
      }));
      const a = stack.add(box(40, 20));

      layout();

      expect(a.frame.x).toBe(80);
      expect(a.width).toBe(40);
    });

    it('distributes free space with justify', () => {
      const stack = root.add(new Stack({
        direction: 'column', height: 200, gap: 0,
        align: 'start', justify: 'space-between'
      }));
      const a = stack.add(box(40, 20));
      const b = stack.add(box(40, 20));

      layout();

      expect(a.frame.y).toBe(0);
      expect(b.frame.y).toBe(180);
    });

    it('skips invisible children instead of leaving holes', () => {
      const stack = root.add(new Stack({ direction: 'column', gap: 10, align: 'start' }));
      const a = stack.add(box(40, 20));
      const hidden = stack.add(box(40, 20, { visible: false }));
      const c = stack.add(box(40, 20));

      layout();

      expect(a.frame.y).toBe(0);
      expect(c.frame.y).toBe(30);
      expect(hidden.visible).toBe(false);
    });

    it('moves everything in it when the stack moves', () => {
      const stack = root.add(new Stack({ x: 100, y: 50, direction: 'column', align: 'start' }));
      const a = stack.add(box(40, 20));

      layout();
      expect(a.frame.x).toBe(100);

      stack.offsetX = 300;
      expect(a.frame.x).toBe(300);
    });

    it('resolves a nested stack innermost-first', () => {
      // The outer stack can only size itself once the inner one knows how
      // big it is, which is why layout runs after the children update.
      const outer = root.add(new Stack({ direction: 'column', gap: 0, align: 'start' }));
      const inner = outer.add(new Stack({ direction: 'row', gap: 10, align: 'start' }));
      inner.add(box(40, 20));
      inner.add(box(40, 20));
      const after = outer.add(box(40, 20));

      layout();

      expect(inner.width).toBe(90);
      expect(inner.height).toBe(20);
      expect(after.frame.y).toBe(20);
      expect(outer.width).toBe(90);
    });

    it('lays out against a measured label, not a zero box', () => {
      const stack = root.add(new Stack({ direction: 'column', gap: 4, align: 'start' }));
      const label = stack.add(new UIText({ text: 'Settings', fontSize: '20px' }));
      const below = stack.add(box(40, 20));

      layout();

      expect(label.height).toBeGreaterThan(0);
      expect(below.frame.y).toBe(label.height + 4);
    });

    it('pins the children it places, so a stale anchor cannot fight it', () => {
      const stack = root.add(new Stack({ direction: 'column', align: 'start' }));
      const a = stack.add(box(40, 20, { anchor: 'bottom-right', pivot: 'center' }));

      layout();

      expect(a.anchor).toBe('top-left');
      expect(a.pivot).toBe('top-left');
    });
  });

  describe('Spacer', () => {
    it('inserts a gap of its own size', () => {
      const stack = root.add(new Stack({ direction: 'column', gap: 0, align: 'start' }));
      const a = stack.add(box(40, 20));
      stack.add(new Spacer({ size: 30 }));
      const b = stack.add(box(40, 20));

      layout();

      expect(a.frame.y).toBe(0);
      expect(b.frame.y).toBe(50);
    });

    it('is never a hit target', () => {
      const spacer = root.add(new Spacer({ size: 30 }));
      layout();
      expect(spacer.contains(spacer.x, spacer.y)).toBe(false);
    });
  });

  describe('Grid', () => {
    it('wraps children across a fixed column count', () => {
      const grid = root.add(new Grid({ columns: 2, gap: 10, align: 'start' }));
      const items = [box(40, 20), box(40, 20), box(40, 20)];
      for (const item of items) grid.add(item);

      layout();

      expect(items[0].frame).toMatchObject({ x: 0, y: 0 });
      expect(items[1].frame).toMatchObject({ x: 50, y: 0 });
      expect(items[2].frame).toMatchObject({ x: 0, y: 30 });
    });

    it('takes uniform cells from the largest child', () => {
      const grid = root.add(new Grid({ columns: 2, gap: 0, align: 'start' }));
      grid.add(box(40, 20));
      const wide = grid.add(box(90, 50));

      layout();

      expect(grid.metrics()).toMatchObject({ width: 90, height: 50 });
      expect(wide.frame.x).toBe(90);
    });

    it('honours explicit cell sizes', () => {
      const grid = root.add(new Grid({
        columns: 3, gap: 4, cellWidth: 32, cellHeight: 32, align: 'stretch'
      }));
      const items = [box(10, 10), box(10, 10), box(10, 10), box(10, 10)];
      for (const item of items) grid.add(item);

      layout();

      expect(items[0].width).toBe(32);
      expect(items[2].frame.x).toBe(72);
      expect(items[3].frame).toMatchObject({ x: 0, y: 36 });
    });

    it('sizes itself to the grid it produced', () => {
      const grid = root.add(new Grid({ columns: 2, gap: 10, padding: 5, align: 'start' }));
      grid.add(box(40, 20));
      grid.add(box(40, 20));
      grid.add(box(40, 20));

      layout();

      expect(grid.width).toBe(5 + 40 + 10 + 40 + 5);
      expect(grid.height).toBe(5 + 20 + 10 + 20 + 5);
    });

    it('uses separate row and column gaps when given', () => {
      const grid = root.add(new Grid({ columns: 2, columnGap: 4, rowGap: 20, align: 'start' }));
      const items = [box(40, 20), box(40, 20), box(40, 20)];
      for (const item of items) grid.add(item);

      layout();

      expect(items[1].frame.x).toBe(44);
      expect(items[2].frame.y).toBe(40);
    });
  });
});
