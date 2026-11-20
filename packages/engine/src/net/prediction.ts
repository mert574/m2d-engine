/**
 * Moving on the tick the key goes down, on a client whose world belongs to
 * a server.
 *
 * Without this a player's own avatar answers a round trip late: the press
 * travels to the server, the server simulates it, the state travels back.
 * At 150 ms that is a tenth of a second of nothing happening, which no
 * amount of smoothing hides — it is the single thing that makes a networked
 * game feel remote.
 *
 * So the client runs its own avatar's movement itself, the moment it has
 * the input, and keeps what it predicted. When the server's own answer for
 * that tick arrives the two are compared. They almost always agree exactly:
 * the client advanced the same body with the same velocity against the same
 * static colliders the server did, so the prediction is not a guess but the
 * same arithmetic run early. When they disagree — a wall the client did not
 * know about, a shove, an ability the server ran — the server wins: the
 * body is put where the server says it was, and every input since is
 * replayed on top, which is why the correction does not throw away the keys
 * the player has pressed in the meantime.
 *
 * ## What is predicted, and why not everything
 *
 * Only what the actor declares. Running an avatar's whole `fixedUpdate` on
 * a client would run its attacks, its abilities and its damage: the client
 * would locally swing at creatures, spend cooldowns and play sounds for
 * hits the server may never agree happened. Those are the server's to
 * decide and are replicated back.
 *
 * Movement is different. It is the thing the player feels, it depends on
 * nothing but their own input and the world's shape, and being wrong about
 * it is cheap — the next server state corrects it. So an actor lists the
 * constraints that may run early:
 *
 *   class Knight extends ObliquePlayer {
 *     static predictedConstraints = ['control', 'walk'];
 *     static predictedFields = ['heading'];
 *   }
 *
 * `predictedConstraints` are run, in the order the entity holds them.
 * `predictedFields` are fields those constraints own, which the server's
 * copy must *not* overwrite: the server's `heading` is older than the
 * client's own, and letting it land would make a turning knight's facing
 * flick between the two at the send rate. Both lists join along the class
 * chain, like `static replicated`.
 *
 * ## What can be predicted at all
 *
 * The avatar's body has to be advanceable on its own
 * (`physics.advanceBody`), which today means a character body: its motion
 * comes from its own controller resolving its own velocity against the
 * colliders around it, so one can be moved without running the solver over
 * a world that belongs to the server. An avatar on a dynamic body — a
 * platformer's player, carried by gravity and contacts — cannot be, and is
 * drawn from the server's states like any other entity. Predicting it would
 * mean stepping the whole world, which would move everything the server
 * owns.
 *
 * ## The correction the player sees
 *
 * A correction moves the body at once, because the simulation must be
 * right, but the *drawn* position keeps the old offset and gives it up over
 * about a tenth of a second. A small disagreement is then never seen at
 * all; a large one reads as a quick settle rather than a jump. Past
 * `SNAP` the offset is abandoned — a respawn or a teleport should look like
 * one.
 */

import { staticList } from './replication.ts';
import type { UpdateRecord } from './replication.ts';
import type { M2D } from '../core/m2d.js';
import type { Entity } from '../core/entity.ts';
import type { InputSnapshot } from '../core/input/snapshot.ts';

/** The 2D character body members prediction reads and writes. */
interface PredictedBody {
  position: { x: number; y: number };
  angle: number;
  bodyType?: string;
  renderOverride: { x: number; y: number; angle: number } | null;
  setPosition(p: { x: number; y: number }): void;
  setAngle(a: number): void;
  setVelocity(v: { x: number; y: number }): void;
  syncInterpolation(): void;
}

/** Ticks of input and predicted states kept, for replaying a correction. */
const HISTORY = 180;
/**
 * A disagreement smaller than this, in px, is not a disagreement.
 *
 * It has to sit above the precision the server sends positions at (a tenth
 * of a pixel, see net/replication.js) plus the float slop of replaying a
 * tick: below that floor the client would be "correcting" its avatar every
 * message for a difference that is only the rounding, and each correction
 * would move the body and perturb the next prediction.
 */
const TOLERANCE = 0.2;
/** Past this, in px, the drawn position does not ease: it was a teleport. */
const SNAP = 200;
/** Seconds the drawn position takes to give up a correction. */
const SETTLE = 0.1;

/** The constraint keys an entity's class chain allows a client to run early. */
export function predictedConstraints(entity: Entity): string[] {
  return staticList(entity, 'predictedConstraints');
}

/** The fields a client owns while predicting, which the server must not overwrite. */
export function predictedFields(entity: Entity): string[] {
  return staticList(entity, 'predictedFields');
}

export class Predictor {
  game: M2D;
  tickRate: number;
  /** The entity being predicted, or null. */
  entity: Entity | null;
  history: Map<number, { snapshot: InputSnapshot; x: number; y: number }>;
  /** The newest tick predicted. */
  tick: number;
  /** Drawn minus simulated, given up over `SETTLE`. */
  offset: { x: number; y: number };
  /** Corrections applied, and the last one's size: for tests and the readout. */
  corrections: number;
  lastError: number;

  constructor(game: M2D, { tickRate = 60 }: { tickRate?: number } = {}) {
    this.game = game;
    this.tickRate = tickRate;
    this.entity = null;
    this.history = new Map();
    this.tick = 0;
    this.offset = { x: 0, y: 0 };
    this.corrections = 0;
    this.lastError = 0;
  }

  /** Whether this entity is the one being predicted. */
  handles(id: number): boolean {
    return this.entity !== null && this.entity.netId === id;
  }

  /** Take up (or drop) an avatar. Called when the server names one. */
  follow(entity: Entity | null): void {
    if (this.entity === entity) return;
    this.reset();
    this.entity = entity && this.#canPredict(entity) ? entity : null;
  }

  /** Whether an entity's movement can run on a client at all. */
  #canPredict(entity: Entity): boolean {
    if (this.game.physics.dimensions === 3) return false;
    if (predictedConstraints(entity).length === 0) return false;
    // A body the client cannot advance without stepping the server's world.
    return entity.body?.bodyType === 'character';
  }

  /** Forget the history: a scene change, a new avatar, a state too old to replay. */
  reset(): void {
    this.history.clear();
    this.tick = 0;
    this.offset = { x: 0, y: 0 };
  }

  /**
   * Run the avatar's declared movement for one server tick and remember
   * what it produced. Called once per tick of input sent, with the snapshot
   * that was sent for it. `tick` is the server tick this input will be
   * applied at.
   */
  predict(tick: number, snapshot: InputSnapshot): void {
    const entity = this.entity;
    if (!entity || !this.game.entities.has(entity)) return;
    this.#run(snapshot);
    const { x, y } = entity.body.position;
    this.history.set(tick, { snapshot, x, y });
    this.tick = Math.max(this.tick, tick);
    for (const old of this.history.keys()) {
      if (old <= tick - HISTORY) this.history.delete(old);
    }
  }

  /** One tick of the declared constraints, then the body's own move. */
  #run(snapshot: InputSnapshot): void {
    const entity = this.entity!;
    const game = this.game;
    const dt = game.time.fixedTimestep;
    // Constraints read the tick's input through `entity.input`, which for
    // the local player is the game's snapshot. A replay feeds the stored
    // one the same way, so a replayed tick is the tick it replays.
    const input = game.input!;
    const live = input.snapshot;
    input.snapshot = snapshot;
    try {
      for (const key of predictedConstraints(entity)) {
        entity.getConstraint(key)?.fixedUpdate(dt);
      }
      // A character body, `#canPredict` saw to it; the receiver is cast
      // (the union's methods disagree on the body until phase 10).
      (game.physics as unknown as { advanceBody(body: unknown, dt: number): void }).advanceBody(entity.body, dt);
    } finally {
      input.snapshot = live;
    }
  }

  /**
   * The server's own answer for a tick. Accepts it, and replays the input
   * sent since on top when it disagrees with what was predicted. `record`
   * carries the parts of the transform this message had; anything absent
   * has not changed since the server last sent it. Returns whether a
   * correction was needed.
   */
  reconcile(tick: number, record: UpdateRecord): boolean {
    const entity = this.entity!;
    const body = entity.body as unknown as PredictedBody;
    // Nothing positional to check against. The server always sends a
    // player's own avatar its position, so this only happens for a message
    // from before it was taken up.
    if (!record.p) return false;
    const [x, y] = record.p as [number, number];
    const angle = record.a;
    const v = record.v;
    const predicted = this.history.get(tick);
    for (const old of this.history.keys()) if (old < tick) this.history.delete(old);

    // With a record for this tick the two can be compared, and agreeing is
    // the common case. Without one — prediction has only just taken this
    // avatar up, or the state is older than the history keeps — there is
    // nothing to compare, and the server's state has to be taken as the
    // baseline anyway: leaving the body where prediction put it would keep
    // whatever offset it started with for good.
    const error = predicted ? Math.hypot(predicted.x - x, predicted.y - y) : null;
    if (error !== null) {
      this.lastError = error;
      if (error <= TOLERANCE) return false;
    }

    // Where the player is being shown right now, before the body moves.
    const drawnX = body.position.x + this.offset.x;
    const drawnY = body.position.y + this.offset.y;

    // The server's state for that tick, then every tick since, replayed.
    body.setPosition({ x, y });
    if (angle !== undefined) body.setAngle(angle);
    if (v) body.setVelocity({ x: v[0]!, y: v[1]! });
    const replay = [...this.history.entries()].filter(([t]) => t > tick).sort((a, b) => a[0] - b[0]);
    for (const [t, step] of replay) {
      this.#run(step.snapshot);
      const position = body.position;
      this.history.set(t, { snapshot: step.snapshot, x: position.x, y: position.y });
    }
    if (predicted) this.history.set(tick, { snapshot: predicted.snapshot, x, y });
    this.tick = Math.max(this.tick, tick);
    body.syncInterpolation();

    // Keep showing where the player was, and give the difference up over
    // the next tenth of a second instead of jumping. A baseline with
    // nothing to compare against is not a correction to smooth: there is no
    // earlier prediction the player was being shown.
    const settled = body.position;
    const smooth = error !== null && error <= SNAP;
    this.offset = smooth ? { x: drawnX - settled.x, y: drawnY - settled.y } : { x: 0, y: 0 };
    if (error === null) {
      (this.game.net as { log(level: number, message: string): void } | null | undefined)?.log(2, `took the server's state at tick ${tick} as the baseline`
        + `, replayed ${replay.length} tick${replay.length === 1 ? '' : 's'}`);
      return false;
    }
    this.corrections++;
    (this.game.net as { log(level: number, message: string): void } | null | undefined)?.log(2, `corrected ${error.toFixed(1)} px at tick ${tick}`
      + `, replayed ${replay.length} tick${replay.length === 1 ? '' : 's'}`
      + (smooth ? '' : ' (too far to ease; snapped)'));
    return true;
  }

  /**
   * Fade the correction out and write the drawn transform. The frame loop
   * calls it once a frame, after the interpolated entities. `deltaTime` is
   * wall seconds this frame.
   */
  beforeDraw(deltaTime: number): void {
    const entity = this.entity;
    if (!entity || !this.game.entities.has(entity)) return;
    const offset = this.offset;
    if (offset.x !== 0 || offset.y !== 0) {
      // Exponential settle, frame-rate independent.
      const keep = SETTLE > 0 ? Math.exp(-Math.max(0, deltaTime) / SETTLE) : 0;
      offset.x *= keep;
      offset.y *= keep;
      if (Math.abs(offset.x) < 0.01 && Math.abs(offset.y) < 0.01) {
        offset.x = 0;
        offset.y = 0;
      }
    }
    const body = entity.body as unknown as PredictedBody;
    const { x, y } = body.position;
    body.renderOverride = { x: x + offset.x, y: y + offset.y, angle: body.angle };
    entity.renderElevationOverride = null;
  }
}
