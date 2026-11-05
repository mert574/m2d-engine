/**
 * Server state, sent to clients as changes.
 *
 * A client builds the scene from the same module the server does, so every
 * entity the scene made has the same network id on both sides (a client
 * checks the scene signature on joining; see `M2D.markSceneBuilt`). From
 * then on the server only says what differs:
 *
 *   { tick: 812,
 *     spawn:  [{ id, type, x, y, w, h, sprite, anim, options, physics, owner }],
 *     update: [{ id, p: [x, y], a: 1.57, v: [vx, vy], f: { heading: 1.2 }, c: { health: { currentHealth: 80 } } }],
 *     // In 3D, p packs [x, y, z, qx, qy, qz, qw, vx, vy, vz].
 *     remove: [id],
 *     hide:   [id],
 *     me:  { ...the receiving player's state },
 *     av:  the receiving player's avatar's id, or null,
 *     ev:  [[name, data]],
 *     we:  [[name, data]],
 *     res: [{ seq, ok, reason }] }
 *
 * `spawn` is for an entity the client does not have: one made at runtime
 * through `game.spawn`, which records how. `update` carries the position,
 * the angle and the velocity each when that part changed — they are diffed
 * apart, since most things never rotate and much of what moves needs no
 * velocity sent at all — and the declared fields (`static replicated` on
 * the entity class chain and on each constraint's) when their value changed. `me` is
 * the receiving player's `state` and goes to that player alone, as do `ev`
 * and `res`. `we` is what the simulation said happened since the last
 * message — a hit, a death, a step — which every client that can see it
 * receives (see core/events.js). `hide` is for an entity that has left the
 * player's interest: the client keeps it but stops drawing it, and coming
 * back into range re-sends the whole of it. Every array is left out when
 * empty.
 *
 * The transport is ordered and reliable, so each change is sent once and a
 * `Replicator` diffs against what it last sent to its own client.
 *
 * A joining client is not sent the world it has just built for itself: the
 * stream is seeded with the scene's own build (`baselineOf`), so a join
 * carries what has changed since the match began and nothing else.
 */

/**
 * Transform precision.
 *
 * A tenth of a pixel is finer than any display shows: the world is drawn
 * through a camera whose zoom tops out well under ten, so a tenth of a
 * world unit cannot become a whole device pixel. A thousandth of a radian
 * is a twentieth of a degree. Speeds are whole pixels per second, because
 * the only thing a client does with a velocity is carry an entity on for a
 * few ticks when a message is late — a 1 px/s error over a 33 ms gap is
 * three hundredths of a pixel.
 *
 * Sending less than this is not free: a client's prediction is compared
 * against what arrives, so the rounding here sets the floor under
 * `Predictor`'s tolerance. Coarser positions would mean correcting the
 * player's own avatar for differences that are not real.
 */
const POSITION = 10;
const ANGLE = 1000;
const SPEED = 1;
/** Below this, in px/s, a velocity is sent as a standstill. */
const STILL = 1;

const round = (value, scale) => Math.round(value * scale) / scale || 0;

/** One cache of joined lists per static name, keyed by constructor. */
const staticCaches = new Map();

/**
 * Every entry of a `static <name>` array along a class chain, base first,
 * without repeats. How `replicated`, `predictedConstraints` and
 * `predictedFields` are all declared: a subclass adds to what its bases
 * said rather than restating it.
 *
 * @param {object} object - An instance; its class chain is walked
 * @param {string} name - The static array's name
 * @returns {string[]}
 */
export function staticList(object, name) {
  let cache = staticCaches.get(name);
  if (!cache) staticCaches.set(name, cache = new WeakMap());
  const ctor = object.constructor;
  const cached = cache.get(ctor);
  if (cached) return cached;
  const chain = [];
  for (let c = ctor; c && c !== Object; c = Object.getPrototypeOf(c)) {
    if (Object.prototype.hasOwnProperty.call(c, name)) chain.unshift(c[name]);
  }
  const list = [...new Set(chain.flat())];
  cache.set(ctor, list);
  return list;
}

/** Every `static replicated` field along a class chain, base first, without repeats. */
export function replicatedFields(object) {
  return staticList(object, 'replicated');
}

/** The replicated fields of an entity or constraint, as plain data. `replicaState()` overrides. */
function readFields(object) {
  if (typeof object.replicaState === 'function') return object.replicaState();
  const out = {};
  for (const field of replicatedFields(object)) {
    if (object[field] !== undefined) out[field] = object[field];
  }
  return out;
}

/** A 3D transform retains its packed quaternion and metre precision. */
function transform3D(entity) {
  const body = entity.body;
  const p = body.position;
  const v = body.velocity;
  const q = body.rotation;
  return [
    round(p.x, 10000), round(p.y, 10000), round(p.z, 10000),
    round(q.x, 10000), round(q.y, 10000), round(q.z, 10000), round(q.w, 10000),
    round(v.x, 1000), round(v.y, 1000), round(v.z, 1000)
  ];
}

/** Put a packed 3D transform onto a replica's body. */
function applyTransform3D(body, p) {
  const [x, y, z, qx, qy, qz, qw, vx, vy, vz] = p;
  body.setPosition({ x, y, z });
  body.setRotation({ x: qx, y: qy, z: qz, w: qw });
  body.setVelocity({ x: vx, y: vy, z: vz });
}

/**
 * An entity's transform, as the three parts that change independently.
 *
 * They used to be one array, diffed whole: a creature that walked a flat
 * floor re-sent its angle and both velocity components every time it
 * moved, because the position in front of them had changed. Most entities
 * never rotate and most of what moves does so without the client needing
 * its velocity at all, so each part carries itself now.
 */
function transform(entity) {
  if (entity.game.physics.dimensions === 3) return { p: transform3D(entity) };
  const { x, y } = entity.body.position;
  const v = entity.body.velocity;
  const still = Math.abs(v.x) < STILL && Math.abs(v.y) < STILL;
  return {
    p: [round(x, POSITION), round(y, POSITION)],
    a: round(entity.body.angle, ANGLE),
    v: still ? [0, 0] : [round(v.x, SPEED), round(v.y, SPEED)]
  };
}

/** Write a field set's JSON into a `sent` map under a prefix. */
function recordFields(map, prefix, fields) {
  for (const [field, value] of Object.entries(fields)) {
    const json = JSON.stringify(value);
    if (json !== undefined) map.set(prefix + field, json);
  }
}

/**
 * An entity's replicated state in the shape a `Replicator` remembers
 * having sent.
 *
 * Taken for every entity a scene built, as it was built
 * (`M2D.markSceneBuilt`), it is also what a joining client's own scene
 * build has produced — the same module, the same JSON, the same
 * constructors. Seeding a client's stream with it means a join only
 * carries what has changed since the match started rather than the
 * position and fields of every wall in the level.
 *
 * @param {import('../core/entity.js').Entity} entity
 */
export function baselineOf(entity) {
  const f = new Map();
  recordFields(f, '', readFields(entity));
  for (const [key, constraint] of entity.constraints) recordFields(f, `${key}.`, readFields(constraint));
  const t = transform(entity);
  return {
    t,
    p: t.p.join(','),
    a: t.a === undefined ? undefined : String(t.a),
    v: t.v?.join(','),
    f
  };
}

/**
 * One tick's replicated state, computed once and read by every client's
 * stream.
 *
 * What an entity's state *is* does not depend on who is being told: the
 * transform rounds the same way and the fields serialise the same way for
 * everyone. Only what each client was *last* told differs. Working it out
 * per client meant a match with four players rounding, reading and
 * serialising all of its entities four times a message, which on a busy
 * level cost more than running the tick. Here it is done once; a client's
 * diff is then a string comparison, and only a field that actually changed
 * for that client is turned back into a value.
 */
export class StateFrame {
  constructor() {
    /** @type {Map<number, {t: number[], p: string, f: Map<string, string>}>} */
    this.cache = new Map();
  }

  /** This tick's state for an entity. @param {import('../core/entity.js').Entity} entity */
  of(entity) {
    let state = this.cache.get(entity.netId);
    if (!state) this.cache.set(entity.netId, state = baselineOf(entity));
    return state;
  }
}

/** Per client: what it has, and what it was last told about each entity. */
export class Replicator {
  /**
   * @param {import('../core/m2d.js').M2D} game
   * @param {import('../core/players.js').Player} player - Who receives this stream
   * @param {object} [options]
   * @param {{radius: number}|null} [options.interest] - Only entities within
   *   `radius` of the player's avatar are sent. Null sends the whole world
   */
  constructor(game, player, { interest = null } = {}) {
    this.game = game;
    /** Decides the shape of a packed transform; see `transform`. */
    this.dimensions = game.physics.dimensions;
    this.player = player;
    /** @type {Map<number, {p: string, f: Map<string, string>}>} */
    this.sent = new Map();
    /** Network ids the client has an entity for. */
    this.known = new Set();
    /** Network ids the client is currently being told about. See `#relevant`. */
    this.shown = new Set();
    this.interest = interest;
    this.radius = interest?.radius ?? Infinity;
    // Hysteresis: something drifting along the edge of interest would
    // otherwise be hidden and shown again every few ticks.
    this.dropRadius = this.radius * 1.15;
    this.lastState = undefined;
    this.lastAvatar = undefined;
    this.warned = new Set();
  }

  /**
   * Everything, as if the client had just built the scene: what the scene
   * made that is gone since, everything spawned since, and every entity's
   * current state.
   */
  full() {
    this.sent.clear();
    this.known = new Set(this.game.sceneNetIds);
    // The client builds the scene itself, so it already holds everything
    // the build produced; only what has changed since needs sending.
    for (const [id, state] of this.game.sceneBaseline ?? []) {
      if (this.known.has(id)) this.sent.set(id, { p: state.p, a: state.a, v: state.v, f: new Map(state.f) });
    }
    // Everything the scene built is on screen for the client until told
    // otherwise, so the first message is what hides the distant parts.
    this.shown = new Set(this.known);
    this.lastState = undefined;
    this.lastAvatar = undefined;
    return this.delta();
  }

  /**
   * What changed since the last call.
   * @param {Array<[string, object]>} [worldEvents] - What the simulation
   *   said happened since the last message, for the clients it concerns
   * @param {StateFrame} [frame] - This tick's state, shared with the other
   *   clients' streams. One is made here when there is nothing to share
   */
  delta(worldEvents, frame = new StateFrame()) {
    const game = this.game;
    const message = { tick: game.time.steps };
    const spawn = [];
    const update = [];
    const remove = [];
    const hide = [];
    const live = new Set();
    const from = this.interest ? this.player.avatar?.position ?? null : null;

    for (const entity of game.entities) {
      const id = entity.netId;
      if (typeof id !== 'number' || id <= 0) continue;
      live.add(id);
      if (!this.#relevant(entity, from, id)) {
        if (this.shown.delete(id)) {
          hide.push(id);
          // Forget what it was told: coming back into range sends the whole
          // of this entity again rather than a diff against a stale memory.
          this.sent.delete(id);
        }
        continue;
      }
      this.shown.add(id);
      if (!this.known.has(id)) {
        const info = entity.spawnInfo;
        if (!info) {
          // Made with `new` rather than `game.spawn`: no recipe a client could follow.
          if (!this.warned.has(entity.name)) {
            this.warned.add(entity.name);
            console.warn(`M2D replication: '${entity.name}' was created without game.spawn and is not sent to clients`);
          }
          continue;
        }
        spawn.push({
          id, type: info.type, x: info.x, y: info.y, w: info.width, h: info.height,
          ...(this.dimensions === 3 && {
            z: info.z, d: info.depth, ...(info.mesh && { mesh: info.mesh }), ...(info.light && { light: info.light })
          }),
          sprite: info.sprite ?? null, anim: info.animation ?? null,
          options: info.options ?? {}, physics: info.physics ?? {}, owner: entity.playerId ?? null
        });
        this.known.add(id);
      }
      const record = this.#changes(entity, id, frame, entity === this.player.avatar);
      if (record) update.push(record);
    }
    for (const id of this.known) {
      if (live.has(id)) continue;
      remove.push(id);
      this.known.delete(id);
      this.sent.delete(id);
    }

    if (spawn.length) message.spawn = spawn;
    if (update.length) message.update = update;
    if (remove.length) message.remove = remove;
    if (hide.length) message.hide = hide;

    const state = JSON.stringify(this.player.state ?? {});
    if (state !== this.lastState) {
      this.lastState = state;
      message.me = JSON.parse(state);
    }
    const avatar = this.player.avatar?.netId ?? null;
    if (avatar !== this.lastAvatar) {
      this.lastAvatar = avatar;
      message.av = avatar;
    }
    const events = this.player.drainEvents();
    if (events.length) message.ev = events;
    const results = this.player.intents?.drainResults() ?? [];
    if (results.length) message.res = results;
    const world = this.worldEvents(worldEvents);
    if (world.length) message.we = world;
    return message;
  }

  /**
   * Whether this client should be told about an entity at all.
   *
   * Everything, unless the match asked for interest management. Then: the
   * player's own avatar always; anything a game declares
   * `static alwaysRelevant`; anything that cannot move, since scenery is
   * sent once and never again and hiding it would only make the level flicker
   * as the player walks; and otherwise whatever is within `radius` of the
   * avatar — `dropRadius` to stop being, so something walking the boundary
   * does not flicker either.
   */
  #relevant(entity, from, id) {
    if (!this.interest || !from) return true;
    if (entity === this.player.avatar) return true;
    if (entity.constructor.alwaysRelevant) return true;
    const type = entity.body?.bodyType;
    if (type === 'static' || type === 'kinematic') return true;
    const dx = entity.position.x - from.x;
    const dy = entity.position.y - from.y;
    const limit = this.shown.has(id) ? this.dropRadius : this.radius;
    return dx * dx + dy * dy <= limit * limit;
  }

  /**
   * The world events this client should hear: the ones that happened where
   * it can see, and the ones that happened nowhere in particular.
   * @param {Array<[string, object]>} [events]
   */
  worldEvents(events) {
    if (!events?.length) return [];
    if (!this.interest) return events;
    const from = this.player.avatar?.position;
    if (!from) return events;
    const limit = this.dropRadius * this.dropRadius;
    return events.filter(([, data]) => {
      const at = data?.at;
      if (!at || typeof at.x !== 'number' || typeof at.y !== 'number') return true;
      const dx = at.x - from.x;
      const dy = at.y - from.y;
      return dx * dx + dy * dy <= limit;
    });
  }

  #changes(entity, id, frame, force = false) {
    let sent = this.sent.get(id);
    if (!sent) this.sent.set(id, sent = { p: '', a: '', v: '', f: new Map() });
    const state = frame.of(entity);
    const record = { id };
    let changed = false;

    // The receiving player's own avatar carries its position every message,
    // changed or not. The client is predicting it, and a prediction can only
    // be checked against something: if the server's knight has not moved —
    // because the input for those ticks never arrived — saying nothing would
    // leave the client walking on with nothing to correct it.
    if (force || state.p !== sent.p) {
      sent.p = state.p;
      record.p = state.t.p;
      changed = true;
    }
    if (state.t.a !== undefined && state.a !== sent.a) {
      sent.a = state.a;
      record.a = state.t.a;
      changed = true;
    }
    if (state.t.v !== undefined && state.v !== sent.v) {
      sent.v = state.v;
      record.v = state.t.v;
      changed = true;
    }
    for (const [key, json] of state.f) {
      if (sent.f.get(key) === json) continue;
      sent.f.set(key, json);
      // `health.currentHealth` is a constraint's; `heading` is the
      // entity's. Parsed only here, for the few that changed.
      const dot = key.indexOf('.');
      if (dot === -1) {
        (record.f ??= {})[key] = JSON.parse(json);
      } else {
        const owner = key.slice(0, dot);
        ((record.c ??= {})[owner] ??= {})[key.slice(dot + 1)] = JSON.parse(json);
      }
      changed = true;
    }
    return changed ? record : null;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A field record without the fields the client predicts for itself. */
function withoutPredicted(entity, fields) {
  const mine = staticList(entity, 'predictedFields');
  if (mine.length === 0) return fields;
  const out = {};
  for (const [field, value] of Object.entries(fields)) {
    if (!mine.includes(field)) out[field] = value;
  }
  return out;
}

/**
 * Write values into an object. A plain object or array already there is
 * updated in place, so anything else holding it sees the change.
 * @returns {Set<string>} The fields written.
 */
function assignFields(target, fields) {
  const changed = new Set();
  for (const [field, value] of Object.entries(fields)) {
    const current = target[field];
    if (Array.isArray(current) && Array.isArray(value)) {
      current.length = 0;
      current.push(...value);
    } else if (isPlainObject(current) && isPlainObject(value)) {
      for (const key of Object.keys(current)) if (!(key in value)) delete current[key];
      Object.assign(current, value);
    } else {
      target[field] = value;
    }
    changed.add(field);
  }
  return changed;
}

/**
 * Apply a server message to a replica.
 * @param {import('../core/m2d.js').M2D} game
 * @param {object} message
 * @param {import('./interpolation.js').ReplicaView} [view] - Records each
 *   entity's state at this tick, for drawing between messages.
 */
export function applyState(game, message, context = {}) {
  const { view, predictor } = context;
  view?.observe(message.tick);
  for (const spawn of message.spawn ?? []) {
    if (game.entityById(spawn.id)) continue;
    game.spawn({
      type: spawn.type, x: spawn.x, y: spawn.y, width: spawn.w, height: spawn.h,
      ...(spawn.z !== undefined && { z: spawn.z }), ...(spawn.d !== undefined && { depth: spawn.d }),
      ...(spawn.mesh && { mesh: spawn.mesh }), ...(spawn.light && { light: spawn.light }),
      sprite: spawn.sprite, animation: spawn.anim ?? undefined, options: spawn.options,
      physics: spawn.physics, playerId: spawn.owner, netId: spawn.id
    });
  }
  for (const record of message.update ?? []) {
    const entity = game.entityById(record.id);
    if (!entity) continue;
    // The client runs this one itself: the server's state for it is an
    // answer to compare against, not a position to take. See net/prediction.js.
    const mine = game.physics.dimensions !== 3 && (predictor?.handles(record.id) ?? false);
    if (mine) predictor.reconcile(message.tick, record);
    if (!mine && (record.p || record.v || record.a !== undefined)) {
      const body = entity.body;
      if (game.physics.dimensions === 3) {
        if (record.p) applyTransform3D(body, record.p);
      } else {
        if (record.p) body.setPosition({ x: record.p[0], y: record.p[1] });
        if (record.a !== undefined) body.setAngle(record.a);
        if (record.v) body.setVelocity({ x: record.v[0], y: record.v[1] });
      }
      // The solver never runs here, so there is nothing to interpolate
      // between: keep the baseline on the state just applied. What is drawn
      // comes from the view, between this state and the last.
      body.syncInterpolation();
    }
    if (record.f) {
      // A predicted field is the client's own and is further on than the
      // server's copy of it; letting that land would undo it twice a
      // second. See net/prediction.js.
      const fields = mine ? withoutPredicted(entity, record.f) : record.f;
      const changed = assignFields(entity, fields);
      entity.replicaUpdated?.(changed);
    }
    for (const [key, fields] of Object.entries(record.c ?? {})) {
      const constraint = entity.getConstraint(key);
      if (!constraint) continue;
      const changed = assignFields(constraint, fields);
      constraint.replicaUpdated?.(changed);
    }
    // After the fields, so the sample carries this tick's elevation. A
    // predicted entity is drawn from its own simulation, not from samples.
    if (!mine && game.physics.dimensions !== 3) view?.record(entity, message.tick);
  }
  // Out of the player's interest: stop drawing it and forget its history.
  // Coming back into range re-sends its whole state, `visible` among it.
  for (const id of message.hide ?? []) {
    view?.forget(id);
    const entity = game.entityById(id);
    if (entity) entity.visible = false;
  }
  // Before the removals: a death event's entity is removed in the same
  // message, and an effect drawn for it wants to find it.
  if (message.we) game.events.dispatch(message.we);
  for (const id of message.remove ?? []) {
    view?.forget(id);
    const entity = game.entityById(id);
    if (!entity) continue;
    game.entities.delete(entity);
    game.physics.remove(entity.body);
    entity.destroy?.();
    if (game.player === entity) game.player = null;
  }
  const local = game.players.local;
  if (message.me) {
    for (const key of Object.keys(local.state)) delete local.state[key];
    Object.assign(local.state, message.me);
  }
  if (message.ev) local.dispatch(message.ev);
}
