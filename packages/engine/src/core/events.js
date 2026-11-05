/**
 * Things that happened in the world and are worth showing, as `game.events`.
 *
 * A hit, a death, a footstep, a door unlatching: the simulation decides
 * they happened, and presentation decides what they look and sound like.
 * Alone those two live in the same process and a constraint could simply
 * do both. On a server they do not: `fixedUpdate` runs in Node with no
 * speakers and nothing drawn, so a flash or a sound written there is lost,
 * and the clients — which never run the tick that caused it — have no way
 * to know it happened. Replicated *state* does not cover it either: a hit
 * that takes 10 health is visible in `currentHealth`, but a hit that is
 * blocked, a footstep, a spark are events, not state, and two hits in one
 * send interval look like one change.
 *
 * So simulation code raises them:
 *
 *   game.events.emit('damage', { id: entity.netId, amount, at });
 *
 * and presentation reacts. Where that reaction runs depends on nothing the
 * emitting code has to know:
 *
 * | Running as | What happens |
 * | --- | --- |
 * | A game on its own | Queued, delivered after the frame's ticks |
 * | A server | Queued, sent to the clients they are relevant to, delivered there |
 * | A client | Never emitted locally; delivered as it arrives from the server |
 *
 * Always after the tick that raised it, never inside it, so presentation
 * cannot feed back into the simulation it is reacting to, and so a game
 * behaves the same way alone and online.
 *
 * ## Who hears one
 *
 * An event that names an entity (`id`, a network id) reaches that entity's
 * `onWorldEvent(name, data)`, which by default offers it to each of its
 * constraints — the same path `onCollisionStart` takes. That is how
 * `DamageFlash` flashes and `Footsteps` makes a sound without subscribing
 * to anything, and it costs one lookup per event rather than a call to
 * every entity in the world.
 *
 * `on(name, handler)` is for presentation that is not one entity's: a
 * scene shaking the camera, a HUD counting kills.
 *
 * ## Rules
 *
 * `data` must be plain data; it crosses a wire. Give an event an `at`
 * (`{x, y}` on the ground) when it happens somewhere, since that is what
 * decides which clients are told, and a `sound` key rather than playing
 * one directly if the sound should follow the event.
 */

/** Events held for a drain that never comes; the queue cannot grow without bound. */
const MAX_QUEUED = 256;

export class WorldEvents {
  /** @param {import('./m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
    /** @type {Array<[string, object]>} */
    this.queue = [];
    this.listeners = new Map();
  }

  /**
   * Raise an event. Simulation code: a constraint's `fixedUpdate`, a
   * collision handler, a scene's tick.
   *
   * @param {string} name
   * @param {object} [data] - Plain data. `id` names the entity it is about;
   *   `at` is where on the ground it happened
   */
  emit(name, data = {}) {
    // A client shows the server's events and raises none of its own: one
    // raised here would be a second, local truth about the same world.
    if (this.game.replica) return;
    if (this.queue.length >= MAX_QUEUED) this.queue.shift();
    this.queue.push([name, data]);
  }

  /**
   * Listen for events that are not one entity's. Presentation code.
   * Returns a function that stops listening.
   * @param {string} name
   * @param {(data: object) => void} handler
   */
  on(name, handler) {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, set = new Set());
    set.add(handler);
    return () => set.delete(handler);
  }

  /** Take the events raised since the last take. */
  take() {
    return this.queue.splice(0);
  }

  /** How many are waiting. */
  get pending() {
    return this.queue.length;
  }

  /**
   * Deliver events: to the entity each is about, then to any listener for
   * its name. The frame loop calls this with its own `take()` on a game
   * playing alone, and `applyState` calls it with what the server sent.
   * @param {Array<[string, object]>} events
   */
  dispatch(events) {
    for (const [name, data] of events) {
      const id = data?.id;
      if (typeof id === 'number') this.game.entityById?.(id)?.onWorldEvent?.(name, data);
      for (const handler of [...(this.listeners.get(name) ?? [])]) handler(data);
    }
  }

  /** Drop every listener and anything queued. A scene load calls this. */
  clear() {
    this.queue.length = 0;
    this.listeners.clear();
  }
}
