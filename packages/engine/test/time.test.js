import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Time } from '../src/core/time.js';
import { createPhysicsWorld } from '../src/core/physics/index.js';

/**
 * `game.time`: the two clocks, the fixed-step tick and the scheduler on
 * top of them.
 *
 * Driven by hand-fed deltas, so every assertion is about the arithmetic
 * and the ordering rather than about the test machine's frame rate.
 */

const DT = 1 / 60;

describe('Time', () => {
  let time;

  beforeEach(() => {
    // No frame clamp and no tick budget, so a test can advance seconds in
    // one call. Both limits have their own tests below.
    time = new Time({ maxDelta: Infinity, maxSubSteps: Infinity });
  });

  describe('clocks', () => {
    it('advances the wall clock by the frame delta and game time in whole ticks', () => {
      time.tick(DT);
      time.tick(DT);

      expect(time.delta).toBeCloseTo(DT, 9);
      expect(time.unscaledDelta).toBeCloseTo(DT, 9);
      expect(time.elapsed).toBeCloseTo(2 * DT, 9);
      expect(time.unscaledElapsed).toBeCloseTo(2 * DT, 9);
      expect(time.frame).toBe(2);
      expect(time.steps).toBe(2);
    });

    it('carries a part of a tick in the accumulator until a later frame pays for it', () => {
      // Three frames of 2/3 of a tick: two whole ticks, with the remainder
      // visible as the interpolation fraction in between.
      expect(time.tick(DT * 2 / 3)).toBe(0);
      expect(time.steps).toBe(0);
      expect(time.interpolation).toBeCloseTo(2 / 3, 6);

      expect(time.tick(DT * 2 / 3)).toBe(1);
      expect(time.interpolation).toBeCloseTo(1 / 3, 6);

      expect(time.tick(DT * 2 / 3)).toBe(1);
      expect(time.steps).toBe(2);
      expect(time.elapsed).toBeCloseTo(2 * DT, 9);
      expect(time.interpolation).toBeCloseTo(0, 6);
    });

    it('runs several ticks when a frame pays for them', () => {
      expect(time.tick(1)).toBe(60);
      expect(time.steps).toBe(60);
      expect(time.elapsed).toBeCloseTo(1, 6);
    });

    it('calls the step callback once per tick with the fixed dt', () => {
      const step = vi.fn();
      time.tick(DT * 3, { step });

      expect(step).toHaveBeenCalledTimes(3);
      expect(step).toHaveBeenCalledWith(DT);
      // Inside the callback the clock already shows the tick it is running.
      const seen = [];
      time.tick(DT * 2, { step: () => seen.push(time.steps) });
      expect(seen).toEqual([4, 5]);
    });

    it('holds game time still while paused and keeps wall time moving', () => {
      time.tick(0.5);
      const step = vi.fn();
      time.tick(0.05, { paused: true, step });

      expect(time.paused).toBe(true);
      expect(time.delta).toBe(0);
      expect(step).not.toHaveBeenCalled();
      expect(time.elapsed).toBeCloseTo(0.5, 6);
      expect(time.steps).toBe(30);
      expect(time.unscaledDelta).toBeCloseTo(0.05, 6);
      expect(time.unscaledElapsed).toBeCloseTo(0.55, 6);
      expect(time.frame).toBe(2);
    });

    it('scales game time into fewer ticks and leaves wall time alone', () => {
      time.scale = 0.5;
      time.tick(1);

      expect(time.delta).toBeCloseTo(0.5, 6);
      expect(time.steps).toBe(30);
      expect(time.elapsed).toBeCloseTo(0.5, 6);
      expect(time.unscaledDelta).toBe(1);
      expect(time.unscaledElapsed).toBe(1);
    });

    it('never changes the tick length, whatever the scale', () => {
      const dts = new Set();
      time.scale = 0.37;
      time.tick(1, { step: (dt) => dts.add(dt) });
      time.scale = 3;
      time.tick(1, { step: (dt) => dts.add(dt) });
      expect([...dts]).toEqual([DT]);
    });

    it('clamps a long frame to maxDelta, 0.1 s by default', () => {
      // A tab returning from the background reports seconds of delta.
      const clamped = new Time({ maxSubSteps: Infinity });
      clamped.tick(4);

      expect(clamped.unscaledDelta).toBe(0.1);
      expect(clamped.steps).toBe(6);
    });

    it('caps the ticks per frame at maxSubSteps and drops the backlog', () => {
      const budgeted = new Time({ maxDelta: Infinity, maxSubSteps: 4 });
      expect(budgeted.tick(1)).toBe(4);
      expect(budgeted.steps).toBe(4);
      // Dropped, so the next ordinary frame is not spent catching up.
      expect(budgeted.accumulator).toBe(0);
      expect(budgeted.tick(DT)).toBe(1);
    });

    it('does not drift: sixty uneven frames make exactly sixty ticks', () => {
      // Summing and subtracting floats leaves the accumulator ulps short of
      // a tick; the epsilon keeps that from skipping one.
      const frames = Array.from({ length: 60 }, (_, i) => DT + (i % 2 ? 1e-12 : -1e-12));
      for (const frame of frames) time.tick(frame);
      expect(time.steps).toBe(60);
    });

    it('treats a negative or missing delta as zero', () => {
      time.tick(-1);
      time.tick(undefined);
      time.tick(NaN);

      expect(time.elapsed).toBe(0);
      expect(time.frame).toBe(3);
    });

    it('rejects a scale that is not a non-negative number', () => {
      expect(() => { time.scale = -1; }).toThrow(/scale/);
      expect(() => { time.scale = NaN; }).toThrow(/scale/);
      expect(() => { time.scale = '2'; }).toThrow(/scale/);
      expect(time.scale).toBe(1);
    });

    it('takes the scale and step settings from options', () => {
      const custom = new Time({ scale: 2, fixedTimestep: 1 / 30, maxSubSteps: 3 });
      expect(custom.scale).toBe(2);
      expect(custom.fixedTimestep).toBe(1 / 30);
      expect(custom.fixedDelta).toBe(1 / 30);
      expect(custom.maxSubSteps).toBe(3);
    });

    it('stepOnce runs exactly one tick regardless of the accumulator', () => {
      const step = vi.fn();
      time.stepOnce(step);
      expect(step).toHaveBeenCalledWith(DT);
      expect(time.steps).toBe(1);
      expect(time.elapsed).toBeCloseTo(DT, 9);
      expect(time.frame).toBe(0);
    });

    it('reset zeroes the clocks, counters and accumulator but keeps the settings', () => {
      time.scale = 0.25;
      time.tick(1.004);
      time.after(5, () => {});

      time.reset();

      expect(time.elapsed).toBe(0);
      expect(time.unscaledElapsed).toBe(0);
      expect(time.frame).toBe(0);
      expect(time.steps).toBe(0);
      expect(time.accumulator).toBe(0);
      expect(time.activeCount).toBe(0);
      expect(time.scale).toBe(0.25);
      expect(time.fixedTimestep).toBe(DT);
    });
  });

  describe('after', () => {
    it('fires on the first tick at or past its deadline, then is gone', () => {
      const fn = vi.fn();
      const timer = time.after(1, fn);

      time.tick(0.6);
      expect(fn).not.toHaveBeenCalled();
      expect(timer.remaining).toBeCloseTo(0.4, 6);

      time.tick(0.6);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(timer.active).toBe(false);
      expect(timer.remaining).toBe(0);
      expect(time.activeCount).toBe(0);

      time.tick(5);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fires on the tick its deadline lands exactly on', () => {
      const fn = vi.fn();
      time.after(DT * 6, fn);
      time.tick(DT * 5);
      expect(fn).not.toHaveBeenCalled();
      time.tick(DT);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fires before the step callback of its tick, so the tick simulates what it did', () => {
      const order = [];
      time.after(DT, () => order.push('timer'));
      time.tick(DT, { step: () => order.push('step') });
      expect(order).toEqual(['timer', 'step']);
    });

    it('fires a zero delay on the next tick, not immediately', () => {
      const fn = vi.fn();
      time.after(0, fn);
      expect(fn).not.toHaveBeenCalled();
      time.tick(DT);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not fire while paused', () => {
      const fn = vi.fn();
      time.after(0.5, fn);

      time.tick(0.1);
      for (let i = 0; i < 20; i++) time.tick(0.1, { paused: true });
      expect(fn).not.toHaveBeenCalled();

      time.tick(0.4);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('stretches with the time scale', () => {
      const fn = vi.fn();
      time.scale = 0.5;
      time.after(1, fn);

      time.tick(1);
      expect(fn).not.toHaveBeenCalled();
      time.tick(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('runs through a pause, ignores the scale and fires per frame when unscaled', () => {
      const fn = vi.fn();
      time.scale = 0.1;
      time.after(0.5, fn, { unscaled: true });

      time.tick(0.3, { paused: true });
      time.tick(0.3, { paused: true });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('can be cancelled before it fires', () => {
      const fn = vi.fn();
      const timer = time.after(1, fn);
      timer.cancel();
      timer.cancel(); // idempotent

      time.tick(2);
      expect(fn).not.toHaveBeenCalled();
      expect(timer.active).toBe(false);
    });

    it('fires due timers earliest deadline first, regardless of creation order', () => {
      const order = [];
      time.after(0.3, () => order.push('late'));
      time.after(0.1, () => order.push('early'));
      time.after(0.2, () => order.push('middle'));

      // One tick is long enough to make all three due at once.
      time.fixedTimestep = 1;
      time.tick(1);
      expect(order).toEqual(['early', 'middle', 'late']);
    });

    it('lets one callback cancel another due in the same tick', () => {
      const second = vi.fn();
      let handle;
      time.after(0.1, () => handle.cancel());
      handle = time.after(0.2, second);

      time.fixedTimestep = 1;
      time.tick(1);
      expect(second).not.toHaveBeenCalled();
    });

    it('defers a timer armed inside a callback to the next tick', () => {
      const inner = vi.fn();
      time.after(DT, () => time.after(0, inner));

      time.tick(DT);
      expect(inner).not.toHaveBeenCalled();
      time.tick(DT);
      expect(inner).toHaveBeenCalledTimes(1);
    });

    it('rejects a bad delay or callback', () => {
      expect(() => time.after(-1, () => {})).toThrow(/after/);
      expect(() => time.after(NaN, () => {})).toThrow(/after/);
      expect(() => time.after(1, null)).toThrow(/callback/);
    });
  });

  describe('every', () => {
    it('repeats on its interval until cancelled', () => {
      const fn = vi.fn();
      const timer = time.every(0.5, fn);

      for (let i = 0; i < 10; i++) time.tick(0.25);
      expect(fn).toHaveBeenCalledTimes(5);
      expect(timer.fired).toBe(5);
      expect(timer.active).toBe(true);

      timer.cancel();
      for (let i = 0; i < 10; i++) time.tick(0.25);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('keeps its phase across uneven frames', () => {
      // Deadlines are absolute, so 0.3 + 0.3 + 0.4 fires at 0.5 and 1.0.
      const fn = vi.fn();
      time.every(0.5, fn);
      time.tick(0.3);
      time.tick(0.3);
      expect(fn).toHaveBeenCalledTimes(1);
      time.tick(0.4);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('fires once per tick and realigns when it falls behind', () => {
      // An interval shorter than a tick cannot burst. The next deadline is
      // one interval after the clock, not several intervals in the past.
      const fn = vi.fn();
      const timer = time.every(0.001, fn);

      time.tick(DT);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(timer.remaining).toBeCloseTo(0.001, 6);

      time.tick(DT);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('pauses with the game and resumes without a burst', () => {
      const fn = vi.fn();
      time.every(0.1, fn);
      time.tick(0.1);
      expect(fn).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 100; i++) time.tick(0.1, { paused: true });
      expect(fn).toHaveBeenCalledTimes(1);

      time.tick(0.1);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('rejects a zero interval', () => {
      expect(() => time.every(0, () => {})).toThrow(/greater than 0/);
    });
  });

  describe('wait', () => {
    it('resolves true when the delay elapses', async () => {
      const promise = time.wait(1);
      let settled = null;
      promise.then((value) => { settled = value; });

      time.tick(0.5);
      await Promise.resolve();
      expect(settled).toBeNull();

      time.tick(0.5);
      await expect(promise).resolves.toBe(true);
    });

    it('resolves false when cancelled or cleared', async () => {
      const cancelled = time.wait(1);
      cancelled.timer.cancel();
      await expect(cancelled).resolves.toBe(false);

      const cleared = time.wait(1);
      time.clear();
      await expect(cleared).resolves.toBe(false);
    });
  });

  describe('clear', () => {
    it('drops every timer and leaves the clocks alone', () => {
      const fn = vi.fn();
      time.tick(1);
      time.after(0.1, fn);
      time.every(0.1, fn);
      time.after(0.1, fn, { unscaled: true });

      time.clear();
      time.tick(1);

      expect(fn).not.toHaveBeenCalled();
      expect(time.activeCount).toBe(0);
      expect(time.elapsed).toBeCloseTo(2, 6);
    });
  });

  describe('as the physics clock', () => {
    it('is the single source of the step settings, the scale and the accumulator', () => {
      const physics = createPhysicsWorld({ clock: time });

      time.scale = 0.5;
      expect(physics.timeScale).toBe(0.5);
      physics.timeScale = 2;
      expect(time.scale).toBe(2);

      expect(physics.fixedTimestep).toBe(DT);
      time.fixedTimestep = 1 / 30;
      expect(physics.fixedTimestep).toBe(1 / 30);

      time.scale = 1;
      time.tick(1 / 60); // half a 1/30 tick, carried
      expect(physics.accumulator).toBeCloseTo(1 / 60, 9);
      expect(physics.interpolation).toBeCloseTo(0.5, 6);

      physics.destroy();
    });

    it('steps the world once per tick when driven through the step callback', () => {
      const physics = createPhysicsWorld({ clock: time });
      const stepped = vi.spyOn(physics, 'step');

      time.tick(DT * 3, { step: (dt) => physics.step(dt) });

      expect(stepped).toHaveBeenCalledTimes(3);
      expect(stepped).toHaveBeenCalledWith(DT);
      physics.destroy();
    });

    it('still advances on its own through the shared accumulator', () => {
      const physics = createPhysicsWorld({ clock: time });
      time.scale = 0.5;

      // Half speed: one tick's worth of wall time buys half a step.
      expect(physics.advance(DT)).toBe(0);
      expect(physics.advance(DT)).toBe(1);
      expect(time.accumulator).toBeCloseTo(0, 9);

      physics.destroy();
    });

    it('keeps its own settings when constructed without a clock', () => {
      const physics = createPhysicsWorld({ timeScale: 2, fixedTimestep: 1 / 30, maxSubSteps: 2 });
      expect(physics.timeScale).toBe(2);
      expect(physics.fixedTimestep).toBe(1 / 30);
      expect(physics.maxSubSteps).toBe(2);
      physics.timeScale = 3;
      expect(physics.timeScale).toBe(3);
      physics.destroy();
    });
  });
});
