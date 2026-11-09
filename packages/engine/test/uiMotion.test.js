import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MotionManager } from '../src/core/ui/motion.js';
import { UIScreen } from '../src/core/ui/screen.js';
import { UIElement } from '../src/core/ui/uiElement.js';
import { UIBackdrop } from '../src/core/ui/backdrop.js';
import { Container } from '../src/core/ui/container.js';
import { makeTestGame } from './helpers/testGame.js';

/**
 * Tweens, screen transitions and the backdrop layers.
 *
 * Time is advanced by hand rather than by frames, so every assertion is
 * about the interpolation rather than about how fast the test machine is.
 */
describe('motion', () => {
  let game;
  let motion;

  beforeEach(() => {
    game = makeTestGame();
    motion = game.motion;
  });

  describe('tweens', () => {
    it('interpolates a property to its target', () => {
      const target = { opacity: 0 };
      motion.to(target, { opacity: 1 }, { duration: 1, easing: (t) => t });

      motion.update(0.5);
      expect(target.opacity).toBeCloseTo(0.5, 5);

      motion.update(0.5);
      expect(target.opacity).toBe(1);
    });

    it('drops the tween once it finishes', () => {
      const target = { x: 0 };
      motion.to(target, { x: 10 }, { duration: 1 });
      expect(motion.activeCount).toBe(1);

      motion.update(1);

      expect(motion.activeCount).toBe(0);
      expect(motion.isAnimating(target)).toBe(false);
    });

    it('animates several properties together', () => {
      const target = { x: 0, y: 10 };
      motion.to(target, { x: 10, y: 0 }, { duration: 1, easing: (t) => t });

      motion.update(0.5);

      expect(target.x).toBeCloseTo(5, 5);
      expect(target.y).toBeCloseTo(5, 5);
    });

    it('applies the easing curve', () => {
      const target = { x: 0 };
      motion.to(target, { x: 100 }, { duration: 1, easing: (t) => t * t });

      motion.update(0.5);

      expect(target.x).toBeCloseTo(25, 5);
    });

    it('resolves duration and easing from theme tokens', () => {
      const target = { x: 0 };
      motion.to(target, { x: 100 }, {
        duration: '$motion.duration.slow', easing: '$motion.easing.linear'
      });

      motion.update(game.theme.get('motion.duration.slow') / 2);

      expect(target.x).toBeCloseTo(50, 5);
    });

    it('waits out a delay before moving anything', () => {
      const target = { x: 0 };
      motion.to(target, { x: 10 }, { duration: 1, delay: 0.5, easing: (t) => t });

      motion.update(0.25);
      expect(target.x).toBe(0);

      // The overshoot past the delay is spent on the tween rather than
      // thrown away, so a staggered sequence does not quantise to frame
      // boundaries: 1s elapsed, 0.5s of it delay, so the tween is half done.
      motion.update(0.75);
      expect(target.x).toBeCloseTo(5, 5);
    });

    it('animates from given values to where the target already is', () => {
      const target = { opacity: 1 };
      motion.from(target, { opacity: 0 }, { duration: 1, easing: (t) => t });

      // The starting value lands at once, not on the next frame: an
      // entrance that waited would flash one frame of its final state.
      expect(target.opacity).toBe(0);
      motion.update(0.5);
      expect(target.opacity).toBeCloseTo(0.5, 5);
      motion.update(0.5);
      expect(target.opacity).toBe(1);
    });

    it('runs onComplete at the end, once', () => {
      const onComplete = vi.fn();
      motion.to({ x: 0 }, { x: 1 }, { duration: 1, onComplete });

      motion.update(0.5);
      expect(onComplete).not.toHaveBeenCalled();

      motion.update(0.6);
      motion.update(0.6);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('can be awaited', async () => {
      // A tween is thenable so transitions can be sequenced. It resolves
      // with nothing on purpose: resolving with the tween itself would make
      // the promise adopt its own `then` and never settle.
      const target = { x: 0 };
      const tween = motion.to(target, { x: 1 }, { duration: 1 });
      motion.update(1);

      await tween;

      expect(target.x).toBe(1);
    });

    it('resolves when cancelled too, so a waiter is never stranded', async () => {
      const tween = motion.to({ x: 0 }, { x: 1 }, { duration: 10 });
      tween.cancel();
      await tween;
    });

    it('cancelling stops it where it is and skips onComplete', () => {
      const onComplete = vi.fn();
      const target = { x: 0 };
      const tween = motion.to(target, { x: 100 }, { duration: 1, easing: (t) => t, onComplete });

      motion.update(0.5);
      tween.cancel();
      motion.update(0.5);

      expect(target.x).toBeCloseTo(50, 5);
      expect(onComplete).not.toHaveBeenCalled();
      expect(motion.activeCount).toBe(0);
    });

    it('finish jumps to the end', () => {
      const target = { x: 0 };
      const tween = motion.to(target, { x: 100 }, { duration: 10 });

      tween.finish();

      expect(target.x).toBe(100);
      expect(motion.activeCount).toBe(0);
    });

    it('a second tween takes over only the properties it names', () => {
      // Two animations fighting over one number is never wanted; two
      // animations on different numbers have no quarrel.
      const target = { x: 0, y: 0 };
      motion.to(target, { x: 100, y: 100 }, { duration: 1, easing: (t) => t });
      motion.update(0.5);

      motion.to(target, { x: 0 }, { duration: 1, easing: (t) => t });
      motion.update(0.5);

      // y kept going on the first tween; x reversed on the second.
      expect(target.y).toBe(100);
      expect(target.x).toBeCloseTo(25, 5);
    });

    it('ignores a property that is not a number', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const target = { label: 'hello' };

      motion.to(target, { label: 5 }, { duration: 1 });
      motion.update(1);

      expect(target.label).toBe('hello');
      warn.mockRestore();
    });

    it('staggers a sequence so items arrive one after another', () => {
      const items = [{ x: 0 }, { x: 0 }, { x: 0 }];
      motion.stagger(items, { x: 10 }, { duration: 1, stagger: 0.5, easing: (t) => t });

      motion.update(0.5);

      expect(items[0].x).toBeCloseTo(5, 5);
      expect(items[1].x).toBe(0);
      expect(items[2].x).toBe(0);
    });

    it('staggers in reverse when asked', () => {
      const items = [{ x: 0 }, { x: 0 }];
      motion.stagger(items, { x: 10 }, {
        duration: 1, stagger: 1, order: 'reverse', easing: (t) => t
      });

      motion.update(0.5);

      expect(items[1].x).toBeCloseTo(5, 5);
      expect(items[0].x).toBe(0);
    });

    it('cancels every tween on a target', () => {
      const target = { x: 0, y: 0 };
      motion.to(target, { x: 1 }, { duration: 1 });
      motion.to(target, { y: 1 }, { duration: 1 });

      motion.cancel(target);

      expect(motion.activeCount).toBe(0);
    });

    it('stops animating an element that is destroyed', () => {
      const root = new Container(game);
      const element = root.add(new UIElement({ width: 10, height: 10 }));
      motion.to(element, { opacity: 0 }, { duration: 1 });

      element.destroy();

      expect(motion.activeCount).toBe(0);
    });

    it('destroy cancels everything', () => {
      const local = new MotionManager(game);
      local.to({ x: 0 }, { x: 1 }, { duration: 1 });
      local.destroy();
      expect(local.activeCount).toBe(0);
    });
  });

  describe('screen transitions', () => {
    /** Let whatever is animating settle. */
    function settle(seconds = 1) {
      motion.update(seconds);
    }

    it('fades a screen in from transparent', () => {
      const screen = game.ui.push(new UIScreen({ name: 'a', transition: 'fade' }));

      expect(screen.opacity).toBe(0);
      expect(screen.phase).toBe('entering');

      settle();

      expect(screen.opacity).toBe(1);
      expect(screen.phase).toBe('open');
    });

    it('arrives instantly with no transition', () => {
      const screen = game.ui.push(new UIScreen({ name: 'a', transition: null }));
      expect(screen.opacity).toBe(1);
      expect(screen.phase).toBe('open');
    });

    it('slides from an offset back to the resting layout', () => {
      // The resting values are the truth: a transition must never change
      // where a screen ends up.
      const screen = game.ui.push(new UIScreen({ name: 'a', transition: 'slide-up' }));

      expect(screen.offsetY).toBeGreaterThan(0);
      settle();
      expect(screen.offsetY).toBe(0);
    });

    it('keeps drawing a screen while it animates out', () => {
      const screen = game.ui.push(new UIScreen({ name: 'a' }));
      settle();

      game.ui.pop();

      // Gone from the logical stack immediately, still on screen.
      expect(game.ui.has('a')).toBe(false);
      expect(game.ui.top).toBe(null);
      expect(game.ui.exiting).toContain(screen);
      expect(game.ui.isEmpty).toBe(false);
      expect(screen.phase).toBe('exiting');
    });

    it('detaches the screen once the exit finishes', async () => {
      const screen = game.ui.push(new UIScreen({ name: 'a' }));
      settle();
      game.ui.pop();

      motion.update(1);
      await Promise.resolve();

      expect(game.ui.exiting).toHaveLength(0);
      expect(screen.owner).toBe(null);
      expect(game.ui.isEmpty).toBe(true);
    });

    it('takes no input while exiting', () => {
      const screen = game.ui.push(new UIScreen({ name: 'a' }));
      settle();
      const seen = [];
      screen.hitTest = () => { seen.push('hit'); return null; };

      game.ui.pop();
      const event = game.input.makeSyntheticEvent('click');
      game.ui.handleInput(event);

      expect(seen).toHaveLength(0);
      expect(event.consumed).toBe(false);
    });

    it('resets the visual state so a reused screen enters cleanly', async () => {
      // Screens are reused — the settings menu is built once — so one that
      // faded out would otherwise still be transparent next time.
      const screen = new UIScreen({ name: 'a' });
      game.ui.push(screen);
      settle();
      game.ui.pop();
      motion.update(1);
      await Promise.resolve();

      game.ui.push(screen);

      expect(screen.opacity).toBe(0);
      settle();
      expect(screen.opacity).toBe(1);
    });

    it('pushing a screen that is still leaving brings it back', async () => {
      const screen = new UIScreen({ name: 'a' });
      game.ui.push(screen);
      settle();
      game.ui.pop();
      motion.update(0.05);

      game.ui.push(screen);

      expect(game.ui.exiting).not.toContain(screen);
      expect(game.ui.has('a')).toBe(true);
      settle();
      expect(screen.opacity).toBe(1);
    });

    it('lifts the pause as the screen starts leaving, not when it lands', () => {
      // The game should be running again by the time the menu has faded.
      game.ui.push(new UIScreen({ name: 'a', pauseGame: true }));
      settle();
      expect(game.paused).toBe(true);

      game.ui.pop();

      expect(game.paused).toBe(false);
    });

    it('draws a leaving screen beneath a live one', () => {
      const leaving = game.ui.push(new UIScreen({ name: 'a', scrim: true, scrimColor: '#a00000' }));
      settle();
      game.ui.pop();
      game.ui.push(new UIScreen({ name: 'b', scrim: true, scrimColor: '#00b000' }));
      // Part way into the entrance: at exactly zero opacity the arriving
      // screen is skipped entirely, which would prove nothing about order.
      motion.update(0.05);

      game.renderer.reset();
      game.ui.draw(0.016);

      const fills = game.renderer.optionsFor('drawRect').map((c) => c.fillStyle);
      expect(fills.indexOf('#a00000')).toBeLessThan(fills.indexOf('#00b000'));
      expect(leaving.phase).toBe('exiting');
    });

    it('clear tears everything down without waiting for animations', () => {
      game.ui.push(new UIScreen({ name: 'a' }));
      settle();
      game.ui.pop();

      game.ui.clear();

      expect(game.ui.exiting).toHaveLength(0);
      expect(game.ui.isEmpty).toBe(true);
    });

    it('reports whether anything is still moving', () => {
      game.ui.push(new UIScreen({ name: 'a' }));
      expect(game.ui.isTransitioning).toBe(true);
      settle();
      expect(game.ui.isTransitioning).toBe(false);
    });
  });

  describe('world blur behind a screen', () => {
    it('asks the renderer for a blur while the screen is up', () => {
      game.renderer.capabilities.postEffects = true;
      const applied = [];
      game.renderer.setPostEffects = (effects) => {
        game.renderer.postEffects = effects;
        applied.push(effects);
      };

      game.ui.push(new UIScreen({ name: 'a', blurBehind: 8 }));
      expect(applied.at(-1)).toMatchObject({ blur: { strength: 8 } });

      game.ui.pop();
      expect(applied.at(-1)).toBe(null);
    });

    it('does nothing on a backend without post effects', () => {
      // Canvas degrades to the scrim alone rather than erroring.
      game.renderer.capabilities.postEffects = false;
      const applied = [];
      game.renderer.setPostEffects = (effects) => applied.push(effects);

      game.ui.push(new UIScreen({ name: 'a', blurBehind: 8, scrim: true }));

      expect(applied).toHaveLength(0);
    });

    it('keeps the strongest blur when screens stack', () => {
      game.renderer.capabilities.postEffects = true;
      game.renderer.setPostEffects = (effects) => { game.renderer.postEffects = effects; };

      game.ui.push(new UIScreen({ name: 'a', blurBehind: 4 }));
      game.ui.push(new UIScreen({ name: 'b', blurBehind: 12 }));
      expect(game.renderer.postEffects).toMatchObject({ blur: { strength: 12 } });

      game.ui.pop();
      expect(game.renderer.postEffects).toMatchObject({ blur: { strength: 4 } });
    });

    it('leaves other post effects alone', () => {
      game.renderer.capabilities.postEffects = true;
      game.renderer.setPostEffects = (effects) => { game.renderer.postEffects = effects; };
      game.renderer.postEffects = { bloom: { strength: 1 } };

      game.ui.push(new UIScreen({ name: 'a', blurBehind: 6 }));
      expect(game.renderer.postEffects).toMatchObject({
        bloom: { strength: 1 }, blur: { strength: 6 }
      });

      game.ui.pop();
      expect(game.renderer.postEffects).toEqual({ bloom: { strength: 1 } });
    });
  });

  describe('backdrop', () => {
    let root;

    beforeEach(() => {
      root = new Container(game);
    });

    it('covers the whole UI space whatever the aspect ratio', () => {
      const backdrop = root.add(new UIBackdrop({}));
      backdrop.draw();

      expect(game.renderer.optionsFor('drawRect')[0]).toMatchObject({
        x: 0, y: 0, width: 800, height: 600
      });
    });

    it('is never a hit target', () => {
      const backdrop = root.add(new UIBackdrop({}));
      expect(backdrop.contains(400, 300)).toBe(false);
      expect(root.hitTest(400, 300)).toBe(null);
    });

    it('expands the from/to shorthand into a gradient', () => {
      const backdrop = root.add(new UIBackdrop({
        gradient: { from: '#000000', to: '#ffffff', angle: 90 }
      }));
      backdrop.draw();

      const fill = game.renderer.optionsFor('drawRect')[0].fillStyle;
      expect(fill.type).toBe('linear');
      expect(fill.stops).toEqual([
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' }
      ]);
    });

    it('resolves gradient stops that are tokens', () => {
      const backdrop = root.add(new UIBackdrop({
        gradient: { from: '$color.bg.base', to: '$color.accent.default' }
      }));
      backdrop.draw();

      const fill = game.renderer.optionsFor('drawRect')[0].fillStyle;
      expect(fill.stops[0].color).toBe(game.theme.resolve('$color.bg.base'));
      expect(fill.stops[1].color).toBe(game.theme.resolve('$color.accent.default'));
    });

    it('accepts a flat colour too', () => {
      const backdrop = root.add(new UIBackdrop({ gradient: '#123456' }));
      backdrop.draw();
      expect(game.renderer.optionsFor('drawRect')[0].fillStyle).toBe('#123456');
    });

    it('lays out the same motes every time from a fixed seed', () => {
      const a = new UIBackdrop({ motes: 20, seed: 7 });
      const b = new UIBackdrop({ motes: 20, seed: 7 });
      expect(a.motes.map((m) => m.x)).toEqual(b.motes.map((m) => m.x));
    });

    it('drifts the motes upward and wraps them', () => {
      const backdrop = root.add(new UIBackdrop({ motes: 1, seed: 3 }));
      const mote = backdrop.motes[0];
      const start = mote.y;

      backdrop.update(1);
      expect(mote.y).toBeLessThan(start);

      // Far enough to run off the top; it reappears at the bottom.
      backdrop.update(10000);
      expect(mote.y).toBeLessThanOrEqual(1.02);
      expect(mote.y).toBeGreaterThan(-0.02);
    });

    it('draws one arc per mote', () => {
      const backdrop = root.add(new UIBackdrop({ gradient: null, motes: 12, seed: 1 }));
      backdrop.draw();
      expect(game.renderer.callsTo('drawArc')).toHaveLength(12);
    });

    it('caps the mote count', () => {
      const backdrop = new UIBackdrop({ motes: 10000 });
      expect(backdrop.motes.length).toBeLessThanOrEqual(240);
    });

    it('draws a vignette as a radial gradient', () => {
      const backdrop = root.add(new UIBackdrop({ gradient: null, vignette: 0.8 }));
      backdrop.draw();

      const fill = game.renderer.optionsFor('drawRect')[0].fillStyle;
      expect(fill.type).toBe('radial');
      expect(fill.stops[0].color).toBe('rgba(0, 0, 0, 0)');
      expect(fill.stops[1].color).toContain('0.8');
    });

    it('draws scanlines across the display', () => {
      const backdrop = root.add(new UIBackdrop({ gradient: null, scanlines: 0.2 }));
      backdrop.draw();

      const lines = game.renderer.optionsFor('drawLine');
      expect(lines.length).toBe(200);
      expect(lines[0]).toMatchObject({ x1: 0, x2: 800, globalAlpha: 0.2 });
    });

    it('draws custom layers between the gradient and the motes', () => {
      const order = [];
      const backdrop = root.add(new UIBackdrop({
        gradient: '#000000',
        motes: 1,
        layers: [
          { draw: (paint, frame) => { order.push(['object', frame]); paint.drawLine({ x1: 0, y1: 0, x2: 1, y2: 1 }); } },
          (paint, frame) => { order.push(['function', frame]); }
        ]
      }));
      backdrop.update(0.5);
      backdrop.draw();

      expect(order.map(([kind]) => kind)).toEqual(['object', 'function']);
      expect(order[0][1]).toEqual({ width: 800, height: 600, elapsed: 0.5 });
      expect(game.renderer.calls.map((c) => c.method)).toEqual(['drawRect', 'drawLine', 'drawArc']);
    });

    it('updates custom layers with the frame', () => {
      const updates = [];
      const backdrop = root.add(new UIBackdrop({
        layers: [{ update: (dt, frame) => updates.push([dt, frame.width, frame.elapsed]) }]
      }));
      backdrop.update(0.25);
      backdrop.update(0.25);
      expect(updates).toEqual([[0.25, 800, 0.25], [0.25, 800, 0.5]]);
    });

    it('draws nothing optional by default', () => {
      const backdrop = root.add(new UIBackdrop({ gradient: null }));
      backdrop.draw();
      expect(game.renderer.calls).toHaveLength(0);
    });

    it('drifts the image without revealing an edge', () => {
      const backdrop = root.add(new UIBackdrop({
        gradient: null, image: { width: 100, height: 100 }, driftScale: 1.2
      }));

      backdrop.update(3);
      backdrop.draw();

      const call = game.renderer.optionsFor('drawImage')[0];
      // Always oversized, and always covering the origin corner.
      expect(call.width).toBeGreaterThanOrEqual(800);
      expect(call.x).toBeLessThanOrEqual(0);
      expect(call.y).toBeLessThanOrEqual(0);
    });
  });
});
