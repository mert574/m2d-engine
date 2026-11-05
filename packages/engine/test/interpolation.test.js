import { describe, it, expect } from 'vitest';
import { Track, ReplicaView } from '../src/net/interpolation.js';
import { Entity } from '../src/core/entity.js';

/**
 * What a replica draws between the server's states.
 *
 * A `Track` is one entity's recent transforms and the question "where was
 * this at tick 12.4"; a `ReplicaView` is the clock that decides which tick
 * is being asked about, and the writer that puts the answer where drawing
 * reads it. Both are driven by hand here: a fake wall clock, hand-fed
 * states, no socket and no server.
 */

const sample = (x, y = 0, { angle = 0, vx = 0, vy = 0, e = 0 } = {}) => ({ x, y, angle, vx, vy, e });

function track(tickRate = 60) {
  const t = new Track();
  t.tickRate = tickRate;
  return t;
}

describe('Track', () => {
  it('blends between the two states bracketing a fractional tick', () => {
    const t = track();
    t.record(10, sample(100, 200));
    t.record(12, sample(140, 240));
    expect(t.at(10, 0)).toMatchObject({ x: 100, y: 200 });
    expect(t.at(11, 0)).toMatchObject({ x: 120, y: 220 });
    expect(t.at(11.5, 0)).toMatchObject({ x: 130, y: 230 });
    expect(t.at(12, 0)).toMatchObject({ x: 140, y: 240 });
  });

  it('turns the short way around the seam', () => {
    const t = track();
    t.record(10, sample(0, 0, { angle: Math.PI - 0.1 }));
    t.record(12, sample(0, 0, { angle: -Math.PI + 0.1 }));
    // Through ±π, not back through zero.
    expect(t.at(11, 0).angle).toBeCloseTo(Math.PI, 5);
  });

  it('interpolates elevation with the position', () => {
    const t = track();
    t.record(10, sample(0, 0, { e: 0 }));
    t.record(14, sample(0, 0, { e: 40 }));
    expect(t.at(12, 0).e).toBeCloseTo(20, 5);
  });

  it('holds the oldest state for a clock behind it and a single state always', () => {
    const t = track();
    t.record(10, sample(100));
    expect(t.at(4, 0)).toMatchObject({ x: 100 });
    expect(t.at(40, 0)).toMatchObject({ x: 100 });
    t.record(12, sample(140));
    expect(t.at(8, 0)).toMatchObject({ x: 100 });
  });

  it('extrapolates along the last velocity past the newest state, but only so far', () => {
    const t = track(60);
    t.record(10, sample(0));
    t.record(12, sample(60, 0, { vx: 600 })); // 600 px/s is 10 px a tick
    // Two ticks past the newest state, within the allowance.
    expect(t.at(14, 2).x).toBeCloseTo(80, 5);
    // Four ticks past it, with two allowed: the guess stops where it stopped.
    expect(t.at(16, 2).x).toBeCloseTo(80, 5);
    // No allowance at all holds the state itself.
    expect(t.at(16, 0).x).toBeCloseTo(60, 5);
  });

  it('keeps what a clock still needs and forgets the rest', () => {
    const t = track();
    for (let tick = 2; tick <= 40; tick += 2) t.record(tick, sample(tick));
    t.prune(30);
    const ticks = t.samples.map((s) => s.t);
    // The pair bracketing tick 30 survives; nothing older does.
    expect(Math.max(...ticks)).toBe(40);
    expect(t.at(30, 0)).toMatchObject({ x: 30 });
    expect(ticks.length).toBeLessThan(10);
  });

  it('starts over when a state arrives out of order, and replaces a repeat', () => {
    const t = track();
    t.record(10, sample(100));
    t.record(12, sample(140));
    t.record(12, sample(150)); // the same tick again: the newer value wins
    expect(t.at(12, 0)).toMatchObject({ x: 150 });
    t.record(3, sample(7)); // a full state after a scene change
    expect(t.samples.map((s) => s.t)).toEqual([3]);
    expect(t.at(3, 0)).toMatchObject({ x: 7 });
  });
});

describe('a replica\'s drawn elevation', () => {
  it('is what the server last said, not a blend from a tick it never ran', () => {
    // A hovering pickup: a standing elevation, set in its constructor and
    // never changed. On a replica `fixedUpdate` never runs, so the baseline
    // `renderElevation` would blend from is never written — blending from it
    // drew the thing somewhere between the floor and its real height,
    // moving with the accumulator. It looked doubled and shook.
    const game = { replica: true, physics: { interpolation: 0.5 }, projection: null };
    const ember = {
      game,
      elevation: 18,
      _previousElevation: 0,
      renderElevationOverride: null,
      get renderElevation() { return Entity.prototype.__lookupGetter__('renderElevation').call(this); }
    };
    expect(ember.renderElevation).toBe(18);
    // Mid-air on the way up, with the server's own two states to blend
    // between, is the interpolator's business and arrives as an override.
    ember.renderElevationOverride = 9;
    expect(ember.renderElevation).toBe(9);
    // A game running its own ticks still blends between them.
    game.replica = false;
    ember.renderElevationOverride = null;
    expect(ember.renderElevation).toBe(9);
  });
});

/** A game-shaped stand-in: entities with bodies the view can write to. */
function fakeGame(ids) {
  const entities = new Set();
  for (const id of ids) {
    entities.add({
      netId: id,
      elevation: 0,
      renderElevationOverride: null,
      body: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0, renderOverride: null }
    });
  }
  return { entities };
}

/** A view on a hand-wound clock. */
function view(ids, { sendEvery = 2, tickRate = 60 } = {}) {
  const clock = { ms: 1000 };
  const game = fakeGame(ids);
  const v = new ReplicaView(game, { tickRate, sendEvery, now: () => clock.ms });
  const byId = new Map([...game.entities].map((e) => [e.netId, e]));
  return { v, clock, game, byId };
}

/** Put an entity at a position and record it, the way applyState does. */
function state(v, entity, tick, x, y = 0, extra = {}) {
  v.observe(tick);
  entity.body.position = { x, y };
  entity.body.velocity = { x: extra.vx ?? 0, y: extra.vy ?? 0 };
  entity.body.angle = extra.angle ?? 0;
  entity.elevation = extra.e ?? 0;
  v.record(entity, tick);
}

describe('ReplicaView', () => {
  it('draws behind the newest state by the delay, blending between states', () => {
    const { v, clock, byId } = view([1]);
    const entity = byId.get(1);
    // Five states, two ticks apart, arriving a send interval apart.
    for (let i = 0; i <= 10; i += 2) {
      clock.ms += (2 / 60) * 1000;
      state(v, entity, 10 + i, 100 + i * 10);
    }
    v.update();
    // delay is 2*2+1 = 5 ticks behind the newest (20), so about tick 15.
    expect(v.renderTick).toBeCloseTo(15, 1);
    expect(entity.body.renderOverride.x).toBeCloseTo(150, 0);
  });

  it('advances smoothly between messages instead of stepping on each one', () => {
    const { v, clock, byId } = view([1]);
    const entity = byId.get(1);
    for (let i = 0; i <= 20; i += 2) {
      clock.ms += (2 / 60) * 1000;
      state(v, entity, 10 + i, 100 + i * 10);
    }
    v.update();
    const positions = [];
    // Four display frames inside one 2-tick server interval.
    for (let frame = 0; frame < 4; frame++) {
      clock.ms += (1 / 120) * 1000;
      v.update();
      positions.push(entity.body.renderOverride.x);
    }
    // Every frame moves, and none of them jumps a whole interval.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      expect(positions[i] - positions[i - 1]).toBeLessThan(20);
    }
  });

  it('rides out a dropped message without stopping', () => {
    const { v, clock, byId } = view([1]);
    const entity = byId.get(1);
    for (let i = 0; i <= 20; i += 2) {
      clock.ms += (2 / 60) * 1000;
      state(v, entity, 10 + i, 100 + i * 10, 0, { vx: 300 });
    }
    v.update();
    const before = entity.body.renderOverride.x;
    // Nothing arrives for two intervals; the clock keeps moving.
    clock.ms += (4 / 60) * 1000;
    v.update();
    expect(entity.body.renderOverride.x).toBeGreaterThan(before);
  });

  it('snaps rather than eases when the clock is far out', () => {
    const { v, clock, byId } = view([1]);
    const entity = byId.get(1);
    clock.ms += 100;
    state(v, entity, 10, 100);
    v.update();
    const first = v.renderTick;
    // A long stall: the next state is hundreds of ticks on.
    clock.ms += 10000;
    state(v, entity, 1000, 900);
    v.update();
    expect(v.renderTick).toBeGreaterThan(first + 100);
    expect(v.renderTick).toBeCloseTo(1000 - v.delay, 0);
  });

  it('gives each entity its own blend, since a diff only carries what moved', () => {
    const { v, clock, byId } = view([1, 2]);
    const a = byId.get(1);
    const b = byId.get(2);
    // A reports every message; B only at the ends.
    state(v, a, 10, 0);
    state(v, b, 10, 0);
    for (const tick of [12, 14, 16, 18, 20]) {
      clock.ms += (2 / 60) * 1000;
      state(v, a, tick, (tick - 10) * 10);
      if (tick === 20) state(v, b, tick, 100);
    }
    v.renderTick = 15;
    v.apply();
    // A is half way between its states at 14 and 16; B is half way along
    // its single long span from 10 to 20.
    expect(a.body.renderOverride.x).toBeCloseTo(50, 5);
    expect(b.body.renderOverride.x).toBeCloseTo(50, 5);
    v.renderTick = 18;
    v.apply();
    expect(a.body.renderOverride.x).toBeCloseTo(80, 5);
    expect(b.body.renderOverride.x).toBeCloseTo(80, 5);
  });

  it('leaves a predicted entity and an entity with no history alone', () => {
    const { v, clock, byId } = view([1, 2]);
    const mine = byId.get(1);
    const untouched = byId.get(2);
    clock.ms += 100;
    state(v, mine, 10, 500);
    v.predicted.add(1);
    v.update();
    expect(mine.body.renderOverride).toBeNull();
    expect(untouched.body.renderOverride).toBeNull();
    v.predicted.delete(1);
    v.apply();
    expect(mine.body.renderOverride).not.toBeNull();
  });

  it('forgets a removed entity and starts over on a scene change', () => {
    const { v, clock, byId } = view([1]);
    const entity = byId.get(1);
    clock.ms += 100;
    state(v, entity, 10, 100);
    expect(v.tracks.size).toBe(1);
    v.forget(1);
    expect(v.tracks.size).toBe(0);
    state(v, entity, 12, 120);
    v.clear();
    expect(v.tracks.size).toBe(0);
    expect(v.renderTick).toBeNull();
    expect(v.serverTick).toBe(0);
  });

  it('does nothing before the first state', () => {
    const { v, byId } = view([1]);
    v.update();
    expect(v.renderTick).toBeNull();
    expect(byId.get(1).body.renderOverride).toBeNull();
  });
});
