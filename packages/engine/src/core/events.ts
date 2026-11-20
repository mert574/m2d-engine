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
 * The simulation itself may also listen — a level rule firing on `emit`,
 * an NPC hearing a footstep — but through `since` and `sinceData`, never
 * `on`: the reader keeps its own cursor (a `raised` count) as a plain
 * field, polls inside its `fixedUpdate`, and so hears an event in the tick
 * it was raised in (or the next, when raised later in the same tick's
 * order). The count and the recent events rewind with a snapshot, so a
 * restored run hears exactly what the first one heard.
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

/** An event's payload: plain data, since it crosses a wire. */
export type WorldEventData = Record<string, unknown>;

/**
 * What `WorldEvents` reads off the game. `m2d.js` is still JavaScript;
 * this names only the members this module touches.
 */
interface EventsGame {
  replica?: unknown;
  entityById?: (id: number) => { onWorldEvent?: (name: string, data: WorldEventData) => void } | null | undefined;
  trackState?: (key: string, hooks: { save: () => unknown; load: (state: never) => void }) => void;
}

export class WorldEvents {
  game: EventsGame;
  queue: Array<[string, WorldEventData]>;
  listeners: Map<string, Set<(data: WorldEventData) => void>>;
  /** How many events have been raised, ever: what `since` counts from. */
  raised: number;
  /** The last few events with their numbers, for `since` and `sinceData`. */
  recent: Array<[number, string, WorldEventData]>;

  constructor(game: EventsGame) {
    this.game = game;
    this.queue = [];
    this.listeners = new Map();
    this.raised = 0;
    this.recent = [];
  }

  /**
   * The names of the events raised after event number `after`, oldest
   * first: what a level's `emit` rules read each tick. Simulation code,
   * unlike `on`: it hears an event in the tick it was raised in (or the
   * next, when raised after the rules ran), not after the frame.
   * `after` is a `raised` count read earlier.
   */
  since(after: number): string[] {
    return this.recent.filter(([n]) => n > after).map(([, name]) => name);
  }

  /**
   * As `since`, but with each event's data: what a constraint that hears
   * the world reads — an NPC turning toward a footstep's `at`. Simulation
   * code; treat the data as read-only, since every reader gets the same
   * object.
   * `after` is a `raised` count read earlier.
   */
  sinceData(after: number): { name: string; data: WorldEventData }[] {
    return this.recent.filter(([n]) => n > after).map(([, name, data]) => ({ name, data }));
  }

  /**
   * Raise an event. Simulation code: a constraint's `fixedUpdate`, a
   * collision handler, a scene's tick.
   *
   * `data` is plain data: `id` names the entity it is about, `at` is where
   * on the ground it happened.
   */
  emit(name: string, data: WorldEventData = {}): void {
    // A client shows the server's events and raises none of its own: one
    // raised here would be a second, local truth about the same world.
    if (this.game.replica) return;
    if (this.queue.length >= MAX_QUEUED) this.queue.shift();
    this.queue.push([name, data]);
    this.raised++;
    if (this.recent.length >= MAX_QUEUED) this.recent.shift();
    this.recent.push([this.raised, name, data]);
  }

  /**
   * Listen for events that are not one entity's. Presentation code.
   * Returns a function that stops listening.
   */
  on(name: string, handler: (data: WorldEventData) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, set = new Set());
    const listeners = set;
    listeners.add(handler);
    return () => listeners.delete(handler);
  }

  /** Take the events raised since the last take. */
  take(): Array<[string, WorldEventData]> {
    return this.queue.splice(0);
  }

  /** How many are waiting. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Deliver events: to the entity each is about, then to any listener for
   * its name. The frame loop calls this with its own `take()` on a game
   * playing alone, and `applyState` calls it with what the server sent.
   */
  dispatch(events: Array<[string, WorldEventData]>): void {
    for (const [name, data] of events) {
      const id = data?.id;
      if (typeof id === 'number') this.game.entityById?.(id)?.onWorldEvent?.(name, data);
      for (const handler of [...(this.listeners.get(name) ?? [])]) handler(data);
    }
  }

  /** Drop every listener and anything queued. A scene load calls this. */
  clear(): void {
    this.queue.length = 0;
    this.recent.length = 0;
    this.listeners.clear();
    // The raised count and the recent list are what `since` readers cursor
    // into with plain fields a snapshot carries, so both rewind with the
    // world — or a restored run would replay events of the abandoned
    // timeline as new. Registered here because a scene load clears the
    // tracked state just before it clears the events. The queue stays:
    // it is delivery, and what was already handed out cannot be unsaid.
    this.game.trackState?.('events', {
      save: () => ({ raised: this.raised, recent: this.recent.map((entry) => [...entry] as typeof entry) }),
      load: ({ raised, recent }: { raised: number; recent: Array<[number, string, WorldEventData]> }) => {
        this.raised = raised;
        this.recent = recent.map((entry) => [...entry] as typeof entry);
      }
    });
  }
}
