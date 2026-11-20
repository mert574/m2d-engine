/**
 * How a replica draws a world it does not simulate.
 *
 * The server sends state every few ticks. Drawing each message the moment
 * it lands means showing the world at the server's rate — 30 steps a
 * second for the keep's `sendEvery: 2` — however fast the display runs,
 * which reads as a stutter no amount of frame rate fixes. So a replica
 * draws the *past*: it keeps the last few states of every entity and shows
 * the world as it was `delay` ticks ago, blending between the two states
 * that bracket that moment. One message late or lost is then invisible,
 * because the moment being drawn has already been bracketed.
 *
 * ## The render clock
 *
 * `renderTick` is a fractional server tick, behind the newest state by
 * `delay`. It advances with wall time rather than jumping to each message's
 * arrival, so the motion it produces is smooth even though the messages
 * feeding it are not evenly spaced. Each frame it eases toward where the
 * newest message says it should be: a small, steady correction (time
 * dilation) absorbs clock drift and jitter without a visible jump. Only a
 * gap too large to ease away — a long stall, a tab coming back — snaps.
 *
 * `delay` is two send intervals plus a margin: long enough that the next
 * message almost always arrives before the moment it covers is drawn, and
 * no longer, since every tick of delay is a tick of extra latency on what
 * the player sees of everyone else.
 *
 * ## Per entity, not per world
 *
 * The alpha cannot be global. A diff only carries the entities that
 * changed, so at any moment one entity's bracketing states may be ticks 12
 * and 14 while another's are 10 and 16. Each entity therefore keeps its own
 * `Track` of samples and is sampled independently.
 *
 * A sample is written to `body.renderOverride` and `entity.renderElevationOverride`,
 * which the drawn transform reads in place of the physics interpolation
 * (there is none to do: a replica never steps the solver). Everything
 * downstream — `renderPosition`, `renderAnchor`, the depth sort, ground
 * shadows, the camera's follow — then works unchanged.
 *
 * ## Gaps
 *
 * Past the newest sample the track extrapolates along the last known
 * velocity, for at most one send interval. Beyond that it holds still:
 * guessing further is how a remote body walks through a wall and snaps
 * back. An entity the local player predicts (see net/prediction.js) is not
 * interpolated at all; its own simulation is ahead of the server, not
 * behind it.
 */

import type { M2D } from '../core/m2d.js';
import type { Entity } from '../core/entity.ts';

/** One server transform of an entity, at a tick. */
interface Sample { t: number; x: number; y: number; angle: number; vx: number; vy: number; e: number }

/** Where to draw: a sampled transform and elevation. */
export interface DrawnTransform { x: number; y: number; angle: number; e: number }

/** The 2D body members a replica's view reads and writes. */
interface ViewBody {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  renderOverride: { x: number; y: number; angle: number } | null;
}

/** Wrap a turn to (-π, π], so crossing the seam reads as continuing to turn. */
function shortestTurn(angle: number): number {
  const turn = (angle + Math.PI) % (Math.PI * 2);
  return (turn < 0 ? turn + Math.PI * 2 : turn) - Math.PI;
}

/** Samples older than this many ticks behind the render clock are dropped. */
const KEEP_TICKS = 60;
/** A render clock further than this from where it should be is reset rather than eased. */
const SNAP_TICKS = 20;
/** Fraction of the remaining clock error corrected per tick of wall time. */
const EASE = 0.08;

/** One entity's recent server transforms, oldest first. */
export class Track {
  samples: Sample[];
  /** Set by the view that made the track; turns ticks into seconds. */
  declare tickRate: number;

  constructor() {
    this.samples = [];
  }

  /** Record where the server says this entity was at `tick`. */
  record(tick: number, sample: Omit<Sample, 't'>): void {
    const samples = this.samples;
    const last = samples[samples.length - 1];
    // Out of order or a repeat: the transport is ordered, so this only
    // happens on a full state after a scene change. Start over from it.
    if (last && tick <= last.t) {
      if (tick === last.t) samples[samples.length - 1] = { t: tick, ...sample };
      else samples.length = 0;
    }
    if (samples.length === 0 || samples[samples.length - 1]!.t !== tick) {
      samples.push({ t: tick, ...sample });
    }
  }

  /** Forget samples no render clock at `tick` could still need. */
  prune(tick: number): void {
    const samples = this.samples;
    // Keep the newest two whatever happens: they are what a stalled clock
    // interpolates between, and the only thing to extrapolate from.
    while (samples.length > 2 && samples[1]!.t <= tick - KEEP_TICKS) samples.shift();
    // The oldest sample is only needed while the clock is still behind the
    // next one.
    while (samples.length > 2 && samples[1]!.t <= tick) samples.shift();
  }

  /**
   * Where to draw this entity at a fractional server tick. `extrapolateTicks`
   * is the furthest past the newest sample to guess along the last velocity.
   */
  at(tick: number, extrapolateTicks: number): DrawnTransform | null {
    const samples = this.samples;
    if (samples.length === 0) return null;
    const newest = samples[samples.length - 1]!;
    if (samples.length === 1 || tick >= newest.t) {
      const over = Math.min(tick - newest.t, extrapolateTicks);
      if (over <= 0) return { x: newest.x, y: newest.y, angle: newest.angle, e: newest.e };
      // Velocity is px/s and the gap is in ticks; the caller's tick rate
      // turns one into the other.
      const seconds = over / this.tickRate;
      return { x: newest.x + newest.vx * seconds, y: newest.y + newest.vy * seconds, angle: newest.angle, e: newest.e };
    }
    const oldest = samples[0]!;
    if (tick <= oldest.t) return { x: oldest.x, y: oldest.y, angle: oldest.angle, e: oldest.e };

    // The pair bracketing `tick`. A handful of samples, walked from the
    // newest end, which is where the clock almost always sits.
    let after = samples.length - 1;
    while (after > 0 && samples[after - 1]!.t > tick) after--;
    const b = samples[after]!;
    const a = samples[after - 1]!;
    const span = b.t - a.t;
    const alpha = span > 0 ? (tick - a.t) / span : 1;
    return {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      angle: a.angle + shortestTurn(b.angle - a.angle) * alpha,
      e: a.e + (b.e - a.e) * alpha
    };
  }
}

/**
 * The replica's view of the server's world: every entity's recent states,
 * and the clock that decides which moment of them is drawn. `sendEvery` is
 * the server's ticks between states; `now` the wall clock, ms.
 */
export class ReplicaView {
  game: M2D;
  tickRate: number;
  sendEvery: number;
  now: () => number;
  /** netId -> Track */
  tracks: Map<number, Track>;
  /** The newest server tick seen, and the wall time it arrived. */
  serverTick: number;
  serverTickAt: number;
  /** The fractional server tick being drawn; null until the first state. */
  renderTick: number | null;
  lastFrameAt: number;
  /** Entities the client simulates itself, by netId: never interpolated. */
  predicted: Set<number>;
  /**
   * Ticks of delay on top of the usual, from the `net_interp` cvar. More
   * delay rides out a worse connection and shows everyone else further in
   * the past; it is the one trade a player might want to make themselves.
   */
  extraDelay: number;

  constructor(game: M2D, { tickRate = 60, sendEvery = 2, now }: { tickRate?: number; sendEvery?: number; now?: () => number } = {}) {
    this.game = game;
    this.tickRate = tickRate;
    this.sendEvery = sendEvery;
    this.now = now ?? (() => performance.now());
    this.tracks = new Map();
    this.serverTick = 0;
    this.serverTickAt = 0;
    this.renderTick = null;
    this.lastFrameAt = 0;
    this.predicted = new Set();
    this.extraDelay = 0;
  }

  /** Ticks behind the newest state that the view draws. */
  get delay(): number {
    return this.sendEvery * 2 + 1 + this.extraDelay;
  }

  /** Note a state message's tick. Called before its records are recorded. */
  observe(tick: number): void {
    if (tick > this.serverTick) {
      this.serverTick = tick;
      this.serverTickAt = this.now();
    }
  }

  /** Record one entity's transform at a tick. */
  record(entity: Entity, tick: number): void {
    const id = entity.netId;
    if (typeof id !== 'number') return;
    let track = this.tracks.get(id);
    if (!track) {
      this.tracks.set(id, track = new Track());
      track.tickRate = this.tickRate;
    }
    // 2D only: a 3D replica is never recorded (see applyState).
    const body = entity.body as unknown as ViewBody;
    const { x, y } = body.position;
    const v = body.velocity;
    track.record(tick, { x, y, angle: body.angle, vx: v.x, vy: v.y, e: entity.elevation ?? 0 });
  }

  /** Forget an entity's history. */
  forget(netId: number): void {
    this.tracks.delete(netId);
    this.predicted.delete(netId);
  }

  /** Start over: a scene change rebuilds every entity. */
  clear(): void {
    this.tracks.clear();
    this.predicted.clear();
    this.renderTick = null;
    this.serverTick = 0;
    this.serverTickAt = 0;
  }

  /** Where the clock should be, from the newest message and the time since. */
  #targetTick(): number {
    const elapsed = (this.now() - this.serverTickAt) / 1000;
    return this.serverTick + elapsed * this.tickRate - this.delay;
  }

  /**
   * Advance the render clock and write every entity's drawn transform.
   * The frame loop calls this once, before drawing.
   */
  update(): void {
    if (this.serverTickAt === 0) return;
    const now = this.now();
    const target = this.#targetTick();
    if (this.renderTick === null) {
      this.renderTick = target;
    } else {
      const dt = Math.max(0, (now - this.lastFrameAt) / 1000);
      this.renderTick += dt * this.tickRate;
      const drift = target - this.renderTick;
      if (Math.abs(drift) > SNAP_TICKS) this.renderTick = target;
      else this.renderTick += drift * EASE;
    }
    this.lastFrameAt = now;
    this.apply();
  }

  /** Write the current render tick's transform onto every entity. */
  apply(): void {
    const tick = this.renderTick;
    if (tick === null) return;
    const extrapolate = this.sendEvery;
    for (const entity of this.game.entities) {
      const id = entity.netId!;
      const track = this.tracks.get(id);
      const body = entity.body as unknown as ViewBody;
      if (!track || this.predicted.has(id)) {
        body.renderOverride = null;
        entity.renderElevationOverride = null;
        continue;
      }
      track.prune(tick);
      const at = track.at(tick, extrapolate);
      if (!at) continue;
      body.renderOverride = at;
      entity.renderElevationOverride = at.e;
    }
  }
}
