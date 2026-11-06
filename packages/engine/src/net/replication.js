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
 *     update: [{ id, p: [x, y, angle, vx, vy], f: { heading: 1.2 }, c: { health: { currentHealth: 80 } } }],
 *     remove: [id],
 *     me:  { ...the receiving player's state },
 *     av:  the receiving player's avatar's id, or null,
 *     ev:  [[name, data]],
 *     res: [{ seq, ok, reason }] }
 *
 * `spawn` is for an entity the client does not have: one made at runtime
 * through `game.spawn`, which records how. `update` carries the transform
 * when it moved and the declared fields (`static replicated` on the entity
 * class chain and on each constraint's) when their value changed. `me` is
 * the receiving player's `state` and goes to that player alone, as do `ev`
 * and `res`. Every array is left out when empty.
 *
 * The transport is ordered and reliable, so each change is sent once and a
 * `Replicator` diffs against what it last sent to its own client.
 */

/** Transform precision: positions to 1/100 px, angles to 1/1000 rad, speeds to 1/10 px/s. */
const round = (value, scale) => Math.round(value * scale) / scale;

const fieldCache = new WeakMap();

/** Every `static replicated` field along a class chain, base first, without repeats. */
export function replicatedFields(object) {
  const ctor = object.constructor;
  if (fieldCache.has(ctor)) return fieldCache.get(ctor);
  const chain = [];
  for (let c = ctor; c && c !== Object; c = Object.getPrototypeOf(c)) {
    if (Object.prototype.hasOwnProperty.call(c, 'replicated')) chain.unshift(c.replicated);
  }
  const fields = [...new Set(chain.flat())];
  fieldCache.set(ctor, fields);
  return fields;
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

function transform(entity) {
  const { x, y } = entity.body.position;
  const v = entity.body.velocity;
  return [round(x, 100), round(y, 100), round(entity.body.angle, 1000), round(v.x, 10), round(v.y, 10)];
}

/** Per client: what it has, and what it was last told about each entity. */
export class Replicator {
  /**
   * @param {import('../core/m2d.js').M2D} game
   * @param {import('../core/players.js').Player} player - Who receives this stream
   */
  constructor(game, player) {
    this.game = game;
    this.player = player;
    /** @type {Map<number, {p: string, f: Map<string, string>}>} */
    this.sent = new Map();
    /** Network ids the client has an entity for. */
    this.known = new Set();
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
    this.lastState = undefined;
    this.lastAvatar = undefined;
    return this.delta();
  }

  /** What changed since the last call. */
  delta() {
    const game = this.game;
    const message = { tick: game.time.steps };
    const spawn = [];
    const update = [];
    const remove = [];
    const live = new Set();

    for (const entity of game.entities) {
      const id = entity.netId;
      if (typeof id !== 'number' || id <= 0) continue;
      live.add(id);
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
          sprite: info.sprite ?? null, anim: info.animation ?? null,
          options: info.options ?? {}, physics: info.physics ?? {}, owner: entity.playerId ?? null
        });
        this.known.add(id);
      }
      const record = this.#changes(entity, id);
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
    return message;
  }

  #changes(entity, id) {
    let sent = this.sent.get(id);
    if (!sent) this.sent.set(id, sent = { p: '', f: new Map() });
    const record = { id };
    let changed = false;

    const p = transform(entity);
    const pKey = p.join(',');
    if (pKey !== sent.p) {
      sent.p = pKey;
      record.p = p;
      changed = true;
    }
    const f = this.#diff(sent.f, '', readFields(entity));
    if (f) { record.f = f; changed = true; }
    for (const [key, constraint] of entity.constraints) {
      const c = this.#diff(sent.f, `${key}.`, readFields(constraint));
      if (c) { (record.c ??= {})[key] = c; changed = true; }
    }
    return changed ? record : null;
  }

  /** The fields whose JSON differs from what was last sent under `prefix`. */
  #diff(sent, prefix, fields) {
    let out = null;
    for (const [field, value] of Object.entries(fields)) {
      const json = JSON.stringify(value);
      if (json === undefined) continue;
      const key = prefix + field;
      if (sent.get(key) === json) continue;
      sent.set(key, json);
      (out ??= {})[field] = JSON.parse(json);
    }
    return out;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
 */
export function applyState(game, message) {
  for (const spawn of message.spawn ?? []) {
    if (game.entityById(spawn.id)) continue;
    game.spawn({
      type: spawn.type, x: spawn.x, y: spawn.y, width: spawn.w, height: spawn.h,
      sprite: spawn.sprite, animation: spawn.anim ?? undefined, options: spawn.options,
      physics: spawn.physics, playerId: spawn.owner, netId: spawn.id
    });
  }
  for (const record of message.update ?? []) {
    const entity = game.entityById(record.id);
    if (!entity) continue;
    if (record.p) {
      const [x, y, angle, vx, vy] = record.p;
      const body = entity.body;
      body.setPosition({ x, y });
      body.setAngle(angle);
      body.setVelocity({ x: vx, y: vy });
      // Interpolation between server states is phase 6; for now, draw where it is.
      body.syncInterpolation();
    }
    if (record.f) {
      const changed = assignFields(entity, record.f);
      entity.replicaUpdated?.(changed);
    }
    for (const [key, fields] of Object.entries(record.c ?? {})) {
      const constraint = entity.getConstraint(key);
      if (!constraint) continue;
      const changed = assignFields(constraint, fields);
      constraint.replicaUpdated?.(changed);
    }
  }
  for (const id of message.remove ?? []) {
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
