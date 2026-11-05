/**
 * The whole simulation at one tick, and the way back to it: `game.snapshot()`
 * and `game.restore(snapshot)`.
 *
 * A snapshot holds everything a tick depends on: Rapier's world and every
 * body wrapper's own state, the entities in their set order with their
 * fields and their constraints', the game-time timers, the clock, the seeded
 * generator, the network ids, each player's `state` and whatever the game
 * registered with `game.trackState`. Restore it and the ticks that follow
 * are bit-identical to the ones that followed when it was taken, given the
 * same input. That is what client prediction rewinds to, and what a match
 * rolls back to.
 *
 * ## In memory, by reference
 *
 * A snapshot lives in the process that took it. Entities, bodies, timers and
 * constraints are the same objects after a restore, so every reference game
 * code holds stays good, and an entity removed after the snapshot comes back
 * as itself. It is not a save file and not a network message; what a server
 * sends a client is a later phase.
 *
 * ## What is captured, field by field
 *
 * An entity's own fields (minus `body`, `sprite`, `game` and `constraints`)
 * and each constraint's (minus `entity`) are captured generically: numbers,
 * strings and booleans by value; plain objects, arrays, Sets and Maps by
 * content, recursively; anything else (another entity, a body, a class
 * instance, a function) by reference. Containers are restored *in place*,
 * so an object a closure holds stays the object the entity holds. A frozen
 * object is never written and is kept by reference.
 *
 * Anything the generic pass gets wrong is the entity's to say: an entity or
 * a constraint with `saveState()` and `loadState(state)` methods is saved and
 * restored through them instead. State that lives outside entities, in a
 * scene's closures or a module, is invisible to a snapshot until the game
 * registers it with `game.trackState(key, { save, load })`.
 *
 * Not captured: presentation (camera, UI, sprites' animation clocks are
 * captured only as fields), wall-time timers, and players' intent queues,
 * which hold input for ticks still to come.
 */

const ENTITY_SKIP = new Set(['body', 'sprite', 'game', 'constraints']);
const CONSTRAINT_SKIP = new Set(['entity']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A capture node: `{ v }` for a value kept as is, or `{ ref, kind, ... }`
 * for a container whose content is restored into `ref`.
 */
function capture(value, seen) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return { v: value };
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const node = { ref: value, kind: 'array', items: null };
    seen.set(value, node);
    node.items = value.map((item) => capture(item, seen));
    return node;
  }
  if (value instanceof Set) {
    const node = { ref: value, kind: 'set', items: null };
    seen.set(value, node);
    node.items = [...value].map((item) => capture(item, seen));
    return node;
  }
  if (value instanceof Map) {
    const node = { ref: value, kind: 'map', entries: null };
    seen.set(value, node);
    node.entries = [...value].map(([k, v]) => [capture(k, seen), capture(v, seen)]);
    return node;
  }
  if (isPlainObject(value)) {
    const node = { ref: value, kind: 'object', entries: null };
    seen.set(value, node);
    node.entries = Object.keys(value).map((key) => [key, capture(value[key], seen)]);
    return node;
  }
  return { v: value };
}

/** Write a node's content back into its container and return the container. */
function restore(node, done) {
  if (!('ref' in node)) return node.v;
  const target = node.ref;
  if (done.has(target)) return target;
  done.add(target);
  switch (node.kind) {
    case 'array':
      target.length = node.items.length;
      node.items.forEach((item, i) => { target[i] = restore(item, done); });
      break;
    case 'set':
      target.clear();
      for (const item of node.items) target.add(restore(item, done));
      break;
    case 'map':
      target.clear();
      for (const [k, v] of node.entries) target.set(restore(k, done), restore(v, done));
      break;
    default:
      for (const key of Object.keys(target)) delete target[key];
      for (const [key, child] of node.entries) target[key] = restore(child, done);
  }
  return target;
}

/** An object's own fields, minus `skip`, as capture nodes. */
function captureFields(object, skip, seen) {
  const fields = [];
  for (const key of Object.keys(object)) {
    if (!skip.has(key)) fields.push([key, capture(object[key], seen)]);
  }
  return fields;
}

function restoreFields(object, fields, skip, done) {
  const kept = new Set(fields.map(([key]) => key));
  // A field that did not exist at the snapshot did not exist then.
  for (const key of Object.keys(object)) {
    if (!skip.has(key) && !kept.has(key)) delete object[key];
  }
  for (const [key, node] of fields) object[key] = restore(node, done);
}

function saveObject(object, skip, seen) {
  if (typeof object.saveState === 'function') return { custom: object.saveState() };
  return { fields: captureFields(object, skip, seen) };
}

function loadObject(object, saved, skip, done) {
  if ('custom' in saved) object.loadState(saved.custom);
  else restoreFields(object, saved.fields, skip, done);
}

/** @param {import('./m2d.js').M2D} game */
export function takeSnapshot(game) {
  if (game.sceneManager.loading) throw new Error('M2D snapshot: cannot take a snapshot while a scene is loading');
  if (game.time.inStep) throw new Error('M2D snapshot: take a snapshot between ticks, not inside one');
  const seen = new Map();
  const time = game.time;
  return {
    scene: game.sceneManager.getCurrentScene(),
    tick: time.steps,
    elapsed: time.elapsed,
    rng: { seed: game.rng.seed, state: game.rng.state, draws: game.rng.draws },
    physics: game.physics.snapshot(),
    entities: [...game.entities].map((entity) => ({
      entity,
      self: saveObject(entity, ENTITY_SKIP, seen),
      constraints: [...entity.constraints].map(([key, constraint]) =>
        [key, constraint, saveObject(constraint, CONSTRAINT_SKIP, seen)])
    })),
    player: game.player,
    isGameOver: game.isGameOver,
    nextNetId: game.nextNetId,
    netIds: [...game.entitiesById],
    timers: [...time.timers].filter((timer) => !timer.unscaled)
      .map((timer) => ({ timer, at: timer.at, interval: timer.interval, fired: timer.fired })),
    players: game.players.all.map((player) => ({ player, avatar: player.avatar, state: capture(player.state, seen) })),
    tracked: [...game.trackedState].map(([key, hooks]) => [key, hooks, hooks.save()])
  };
}

/**
 * @param {import('./m2d.js').M2D} game
 * @param {ReturnType<typeof takeSnapshot>} snapshot
 */
export function restoreSnapshot(game, snapshot) {
  if (!snapshot || !snapshot.physics) throw new Error('M2D restore: not a snapshot from game.snapshot()');
  if (snapshot.scene !== game.sceneManager.getCurrentScene() || game.sceneManager.loading) {
    throw new Error('M2D restore: a snapshot restores only into the scene it was taken in');
  }
  if (game.time.inStep) throw new Error('M2D restore: restore between ticks, not inside one');
  const done = new Set();
  const time = game.time;

  time.steps = snapshot.tick;
  time.elapsed = snapshot.elapsed;
  time.accumulator = 0;
  game.rng.seed = snapshot.rng.seed;
  game.rng.state = snapshot.rng.state;
  game.rng.draws = snapshot.rng.draws;

  game.physics.restore(snapshot.physics);

  game.entities.clear();
  for (const saved of snapshot.entities) {
    const { entity } = saved;
    entity.constraints.clear();
    for (const [key, constraint] of saved.constraints) entity.constraints.set(key, constraint);
    loadObject(entity, saved.self, ENTITY_SKIP, done);
    for (const [, constraint, state] of saved.constraints) loadObject(constraint, state, CONSTRAINT_SKIP, done);
    game.entities.add(entity);
  }
  game.player = snapshot.player;
  game.isGameOver = snapshot.isGameOver;
  game.nextNetId = snapshot.nextNetId;
  game.entitiesById = new Map(snapshot.netIds);

  // Game-time timers go back to what they were; wall-time ones are
  // presentation and stay. The snapshot's come first, in their old order,
  // since timers due on the same tick fire in insertion order.
  const wallTimers = [...time.timers].filter((timer) => timer.unscaled);
  for (const timer of time.timers) if (!timer.unscaled) timer.active = false;
  time.timers.clear();
  for (const { timer, at, interval, fired } of snapshot.timers) {
    Object.assign(timer, { at, interval, fired, active: true });
    time.timers.add(timer);
  }
  for (const timer of wallTimers) time.timers.add(timer);

  for (const { player, avatar, state } of snapshot.players) {
    if (game.players.get(player.id) !== player) continue; // left since; nothing to restore into
    player.avatar = avatar;
    player.state = restore(state, done);
  }
  for (const [key, hooks, data] of snapshot.tracked) {
    if (game.trackedState.get(key) === hooks) hooks.load(data);
  }
}
