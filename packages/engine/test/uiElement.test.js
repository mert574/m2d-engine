import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIElement, normalizePadding } from '../src/core/ui/uiElement.js';
import { Container } from '../src/core/ui/container.js';
import { UIPanel } from '../src/core/ui/panel.js';
import { makeTestGame, expectBalancedStacks } from './helpers/testGame.js';
import { click, pointerMove } from './helpers/input.js';

/**
 * The element tree: boxes, nesting, inherited visual state and hit testing.
 *
 * The recording game's UI space is 800x600, so every expected coordinate
 * below can be read off directly.
 */
describe('UIElement', () => {
  let game;
  let root;

  beforeEach(() => {
    game = makeTestGame();
    root = new Container(game);
  });

  /** A plain box, visible to hit testing. */
  function box(options) {
    return new UIElement({ width: 40, height: 20, ...options });
  }

  describe('the box', () => {
    it('resolves an anchor against the whole screen at the root', () => {
      const element = root.add(box({ x: -50, y: -30, anchor: 'bottom-right' }));
      expect(element.x).toBe(750);
      expect(element.y).toBe(570);
    });

    it('reports a frame around the pivot', () => {
      const centred = root.add(box({ x: 100, y: 100, pivot: 'center' }));
      expect(centred.frame).toEqual({ x: 80, y: 90, width: 40, height: 20 });

      const cornered = root.add(box({ x: 100, y: 100, pivot: 'top-left' }));
      expect(cornered.frame).toEqual({ x: 100, y: 100, width: 40, height: 20 });
    });

    it('writing x and y writes the offset, so nudging still works', () => {
      const element = root.add(box({ x: -50, y: -30, anchor: 'bottom-right' }));
      element.x += 5;
      expect(element.offsetX).toBe(-45);
      expect(element.x).toBe(755);
    });

    it('insets the content box by padding without moving the frame', () => {
      const panel = root.add(box({ x: 100, y: 100, width: 200, height: 100, padding: 16 }));

      expect(panel.frame).toMatchObject({ width: 200, height: 100 });
      expect(panel.contentBox).toEqual({ x: 16, y: 66, width: 168, height: 68 });
    });

    it('normalizes padding the way CSS shorthand reads', () => {
      expect(normalizePadding(8)).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
      expect(normalizePadding([4, 12])).toEqual({ top: 4, right: 12, bottom: 4, left: 12 });
      expect(normalizePadding([1, 2, 3, 4])).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
      expect(normalizePadding({ left: 5 })).toEqual({ top: 0, right: 0, bottom: 0, left: 5 });
      expect(normalizePadding(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });
  });

  describe('nesting', () => {
    it('resolves a child anchor against the parent content box, not the screen', () => {
      // The whole point of the tree: move the panel and the child moves with
      // it, instead of being positioned against a screen it knows nothing of.
      const panel = root.add(box({
        x: 200, y: 150, width: 200, height: 100, pivot: 'top-left', padding: 10
      }));
      const child = panel.add(box({ x: -5, y: -5, anchor: 'bottom-right', pivot: 'bottom-right' }));

      // Content box is (210, 160) to (390, 240).
      expect(child.x).toBe(385);
      expect(child.y).toBe(235);

      panel.offsetX += 100;
      expect(child.x).toBe(485);
    });

    it('adopts the game, so a child added later is still wired up', () => {
      const panel = root.add(box({}));
      const child = panel.add(box({}));
      expect(child.game).toBe(game);
    });

    it('re-parents rather than living in two trees', () => {
      const a = root.add(box({}));
      const b = root.add(box({}));
      const child = a.add(box({}));

      b.add(child);

      expect(a.children).not.toContain(child);
      expect(b.children).toContain(child);
      expect(child.parent).toBe(b);
    });

    it('refuses to contain itself', () => {
      const element = root.add(box({}));
      expect(() => element.add(element)).toThrow();
    });
  });

  describe('mount lifecycle', () => {
    it('mounts on add and unmounts on remove, children first', () => {
      const order = [];
      const parent = new UIElement({});
      const child = new UIElement({});
      parent.onMount = () => order.push('parent mount');
      child.onMount = () => order.push('child mount');
      parent.onUnmount = () => order.push('parent unmount');
      child.onUnmount = () => order.push('child unmount');
      parent.add(child);

      root.add(parent);
      expect(order).toEqual(['parent mount', 'child mount']);
      expect(child.mounted).toBe(true);

      // Children first on the way out, so a parent's onUnmount can still
      // see a live subtree.
      order.length = 0;
      root.remove(parent);
      expect(order).toEqual(['child unmount', 'parent unmount']);
      expect(child.mounted).toBe(false);
    });

    it('mounts a subtree added to an already-mounted parent', () => {
      const parent = root.add(new UIElement({}));
      const child = new UIElement({});
      const onMount = vi.fn();
      child.onMount = onMount;

      parent.add(child);

      expect(onMount).toHaveBeenCalledOnce();
    });

    it('clear removes and unmounts every child', () => {
      const onUnmount = vi.fn();
      const child = new UIElement({});
      child.onUnmount = onUnmount;
      root.add(child);

      root.clear();

      expect(root.children).toHaveLength(0);
      expect(onUnmount).toHaveBeenCalledOnce();
      expect(child.parent).toBe(null);
    });
  });

  describe('visual state', () => {
    it('compounds opacity down the tree', () => {
      const parent = root.add(box({ opacity: 0.5 }));
      const child = parent.add(box({ opacity: 0.5 }));

      expect(parent.alpha).toBe(0.5);
      expect(child.alpha).toBe(0.25);
    });

    it('folds the inherited alpha into every draw call', () => {
      // A component that knows nothing about fading still fades, which is
      // what keeps the motion system out of the components.
      const parent = root.add(new UIPanel({ x: 100, y: 100, width: 50, height: 50, opacity: 0.5 }));
      parent.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10, opacity: 0.4 }));

      root.drawTree(0);

      const alphas = game.renderer.optionsFor('drawRect').map((call) => call.globalAlpha);
      expect(alphas).toEqual([0.5, 0.2]);
    });

    it('omits globalAlpha entirely at full opacity', () => {
      root.add(new UIPanel({ x: 100, y: 100, width: 50, height: 50 }));
      root.drawTree(0);

      expect(game.renderer.optionsFor('drawRect')[0]).not.toHaveProperty('globalAlpha');
    });

    it('skips an invisible subtree', () => {
      const parent = root.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10, visible: false }));
      parent.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10 }));

      root.drawTree(0);

      expect(game.renderer.callsTo('drawRect')).toHaveLength(0);
    });

    it('still updates an invisible element, so it can animate itself back', () => {
      const element = root.add(box({ visible: false }));
      const update = vi.fn();
      element.update = update;

      root.updateTree(0.016);

      expect(update).toHaveBeenCalledWith(0.016);
    });

    it('reports the interaction state in priority order', () => {
      const element = box({});
      expect(element.state).toBe('normal');

      // Keyboard focus and pointer hover are one appearance: both mean
      // "this is the one that will happen", so there is no separate
      // focused state and no ring floating around the highlight.
      element.isFocused = true;
      expect(element.state).toBe('hovered');

      element.isHovered = true;
      expect(element.state).toBe('hovered');

      element.isPressed = true;
      expect(element.state).toBe('pressed');

      element.enabled = false;
      expect(element.state).toBe('disabled');
    });
  });

  describe('transforms', () => {
    it('leaves the stack alone when nothing is transformed', () => {
      root.add(new UIPanel({ x: 100, y: 100, width: 50, height: 50 }));
      root.drawTree(0);

      expect(game.renderer.callsTo('pushTransform')).toHaveLength(0);
    });

    it('scales and rotates about the pivot, leaving children in absolute space', () => {
      // Two pushes: `T(p)·R·S` then `T(-p)` composes to `p + R·S·(q - p)`,
      // which is rotation and scale about the pivot while components keep
      // drawing in absolute UI coordinates.
      const panel = root.add(new UIPanel({
        x: 100, y: 100, width: 50, height: 50, scale: 2, rotation: 0.5
      }));
      panel.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10 }));

      root.drawTree(0);

      const pushes = game.renderer.optionsFor('pushTransform');
      expect(pushes).toHaveLength(2);
      expect(pushes[0]).toMatchObject({
        x: 100, y: 100, scaleX: 2, scaleY: 2, rotation: 0.5, isScreenSpace: true
      });
      expect(pushes[1]).toMatchObject({ x: -100, y: -100 });
      expectBalancedStacks(game.renderer);
    });

    it('clips its children when asked', () => {
      const panel = root.add(new UIPanel({
        x: 100, y: 100, width: 50, height: 50, clipChildren: true
      }));
      panel.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10 }));

      root.drawTree(0);

      expect(game.renderer.optionsFor('pushClip')[0])
        .toMatchObject({ x: 75, y: 75, width: 50, height: 50 });
      expectBalancedStacks(game.renderer);
    });
  });

  describe('hit testing', () => {
    it('prefers a child over its parent', () => {
      const panel = root.add(new UIPanel({
        x: 100, y: 100, width: 200, height: 200, interactive: true
      }));
      const child = panel.add(box({ x: 0, y: 0, anchor: 'center', pivot: 'center' }));

      expect(root.hitTest(100, 100)).toBe(child);
      expect(root.hitTest(100, 160)).toBe(panel);
    });

    it('prefers the last child, which is the one drawn on top', () => {
      const under = root.add(box({ x: 100, y: 100, pivot: 'center' }));
      const over = root.add(box({ x: 100, y: 100, pivot: 'center' }));

      expect(root.hitTest(100, 100)).toBe(over);
      expect(under.contains(100, 100)).toBe(true);
    });

    it('never resolves to the root itself', () => {
      // The root covers the whole screen; answering a hit test would mean
      // nothing in the world could ever be clicked.
      expect(root.hitTest(400, 300)).toBe(null);
    });

    it('skips an invisible subtree', () => {
      const panel = root.add(new UIPanel({ x: 100, y: 100, width: 200, height: 200 }));
      const child = panel.add(box({ x: 0, y: 0, anchor: 'center', pivot: 'center' }));

      expect(root.hitTest(100, 100)).toBe(child);
      panel.visible = false;
      expect(root.hitTest(100, 100)).toBe(null);
    });

    it('a clipping parent hides what its frame does not show', () => {
      const panel = root.add(new UIPanel({
        x: 100, y: 100, width: 40, height: 40, clipChildren: true, interactive: true
      }));
      const child = panel.add(box({ x: 200, y: 0, width: 40, height: 20, pivot: 'center' }));

      expect(child.contains(child.x, child.y)).toBe(true);
      expect(root.hitTest(child.x, child.y)).toBe(null);
    });

    it('is not a target without a positive width and height', () => {
      // Otherwise a bare container or an unmeasured label would hit-test
      // against NaN bounds and swallow events meant for the world.
      const sizeless = root.add(new UIElement({ x: 100, y: 100 }));
      expect(sizeless.contains(100, 100)).toBe(false);
    });

    it('reports whether anything in the tree wants an event type', () => {
      const panel = root.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10 }));
      expect(root.treeHandles('scroll')).toBe(false);

      panel.add(box({})).wants('scroll');
      expect(root.treeHandles('scroll')).toBe(true);
    });
  });

  describe('routed input', () => {
    beforeEach(() => {
      game.input.setUIContainer(root);
    });

    it('delivers a click to the nested element under the pointer', () => {
      const panel = root.add(new UIPanel({ x: 100, y: 100, width: 200, height: 200 }));
      const child = panel.add(box({ x: 0, y: 0, anchor: 'center', pivot: 'center' }));
      const onClick = vi.fn();
      child.onClick = onClick;

      click(game, 100, 100);

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('tracks hover on the nested element', () => {
      const panel = root.add(new UIPanel({ x: 100, y: 100, width: 200, height: 200 }));
      const child = panel.add(box({ x: 0, y: 0, anchor: 'center', pivot: 'center' }));

      pointerMove(game, 100, 100);
      expect(child.isHovered).toBe(true);

      pointerMove(game, 700, 500);
      expect(child.isHovered).toBe(false);
    });

    it('a disabled element consumes without reacting', () => {
      const element = root.add(box({ x: 100, y: 100, pivot: 'center', enabled: false }));
      const onClick = vi.fn();
      element.onClick = onClick;
      const worldClicks = [];
      game.input.on('click', (event) => worldClicks.push(event));

      click(game, 100, 100);

      expect(onClick).not.toHaveBeenCalled();
      expect(element.isPressed).toBe(false);
      expect(worldClicks).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('tears down the subtree and detaches from the parent', () => {
      const panel = root.add(new UIPanel({ x: 0, y: 0, width: 10, height: 10 }));
      const child = panel.add(box({}));
      const onUnmount = vi.fn();
      child.onUnmount = onUnmount;

      panel.destroy();

      expect(root.children).not.toContain(panel);
      expect(panel.children).toHaveLength(0);
      expect(onUnmount).toHaveBeenCalledOnce();
      expect(panel.visible).toBe(false);
    });
  });
});
