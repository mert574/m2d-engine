/**
 * A level's rules — `world.rules` — run by the scene each tick.
 *
 * A rule is a `when` and a `then`: an event the scene watches for, and the
 * actions it takes once (or every time, with `once: false`). The events:
 * the scene starting, every object of a prefab collected, the player
 * entering an object, an object (or the player, or every one of a group)
 * dying, the player falling below the kill plane, a counter reaching a
 * value, a named input action pressed, a world event game code raised
 * (`emit`), and an event the simulation told the player (`notify`). The
 * actions: a notice, an objective line or a dialogue on the HUD, a sound,
 * unsealing a gate, removing an object, setting a field, changing a
 * counter, a scene switch or game over after a moment, turning the
 * lighting cycle, moving the camera's bounds.
 *
 * Rules chain by id: `after` waits for the named rules to have fired, and
 * `before` stops a rule once they have — a wave arming only once the one
 * before it is cleared, a sealed door saying so until it opens.
 *
 * Simulation, so it runs headless and on a server, and in play; never in
 * edit mode, where nothing moves. Presentation actions (a notice, a sound)
 * do nothing without a display. Conditions are polled rather than listened
 * for, so a rule is a pure function of the world at the tick and a replay
 * agrees.
 *
 * The one exception is `notify`. What the simulation tells a player
 * reaches that player's screen after the tick — on a client, from the
 * server — so a notify rule is heard rather than polled, runs where the
 * screen is (a client too), and may only change what is shown and heard
 * (the schema holds it to `PRESENTATION_ACTIONS`).
 */
export class SceneRules {
  /**
   * @param {import('./scene.js').Scene} scene
   * @param {Array<object>} rules - `world.rules`, validated
   * @param {Object} [options]
   * @param {boolean} [options.simulate=true] - Poll the rules each tick.
   *   False on a client, whose world the server simulates: only its notify
   *   rules run there
   */
  constructor(scene, rules = [], { simulate = true } = {}) {
    this.scene = scene;
    this.game = scene.game;
    this.simulate = simulate;
    this.rules = rules.map((rule) => ({ ...rule, fired: false }));
    /** The rules with an id, for after and before. */
    this.byId = new Map(this.rules.filter((rule) => rule.id).map((rule) => [rule.id, rule]));
    this.started = false;
    /** Set by the kill plane check, read once. */
    this.fell = false;
    /** World events already looked at, as `game.events.raised` counts them. */
    this.seenEvents = this.game.events?.raised ?? 0;
    /** The names `emit` rules hear this tick. @type {Set<string>} */
    this.emitted = new Set();
    /** The notify listeners, dropped by `unlisten`. */
    this.#off = [];
  }

  #off;

  /** The entity for an object id, or the player for `'player'`. */
  #entity(id) {
    if (id === 'player' || id === undefined) return this.game.player ?? null;
    return this.scene.entitiesById.get(id) ?? null;
  }

  #gone(entity) {
    return !entity || entity.dead || !this.game.entities.has(entity);
  }

  /** Whether a rule's event holds at this tick. */
  #holds(when) {
    switch (when.event) {
      case 'start':
        return !this.started;
      case 'collected': {
        for (const entity of this.game.entities) {
          if (entity.prefab === when.prefab && !entity.dead) return false;
        }
        // Only true when there was something to collect in the first place.
        return this.scene.config.layers?.some((layer) => layer.objects?.some((object) => object.prefab === when.prefab)) ?? false;
      }
      case 'enter': {
        const target = this.#entity(when.object);
        const player = this.game.player;
        if (!target || !player || this.#gone(target) || this.#gone(player)) return false;
        for (const body of target._contacts) if (body.entity === player) return true;
        for (const body of player._contacts) if (body.entity === target) return true;
        return false;
      }
      case 'death':
        if (when.objects) return when.objects.every((id) => this.#gone(this.#entity(id)));
        return this.#gone(this.#entity(when.object));
      case 'fall':
        return this.fell;
      case 'count': {
        const value = this.scene.counters?.get(when.counter) ?? 0;
        if (typeof when.atLeast === 'number' && value < when.atLeast) return false;
        if (typeof when.atMost === 'number' && value > when.atMost) return false;
        return typeof when.atLeast === 'number' || typeof when.atMost === 'number';
      }
      case 'action':
        return this.game.actions?.pressed(when.action, this.game.input?.snapshot) ?? false;
      case 'emit':
        return this.emitted.has(when.name);
      default:
        return false;
    }
  }

  /** Whether a rule's place in its chain lets it fire now. */
  #ready(rule) {
    const fired = (id) => this.byId.get(id)?.fired === true;
    return (rule.after ?? []).every(fired) && !(rule.before ?? []).some(fired);
  }

  /** One tick: fire every rule whose event holds, in order, so a chain can run through in one tick. */
  fixedUpdate() {
    if (!this.simulate) return;
    this.#hearEmitted();
    for (const rule of this.rules) {
      if (rule.when?.event === 'notify') continue;
      if (rule.fired && rule.once !== false) continue;
      if (!this.#ready(rule) || !this.#holds(rule.when)) continue;
      this.#fire(rule);
    }
    this.started = true;
    this.fell = false;
  }

  /** The world events raised since the last tick looked. */
  #hearEmitted() {
    this.emitted.clear();
    const events = this.game.events;
    if (!events) return;
    for (const name of events.since(this.seenEvents)) this.emitted.add(name);
    this.seenEvents = events.raised;
  }

  #fire(rule) {
    rule.fired = true;
    for (const action of rule.then ?? []) this.#run(action);
  }

  /**
   * Hear what the simulation tells the local player, for the notify
   * rules. Presentation: the scene calls it when it shows, with a display.
   */
  listen() {
    const player = this.game.players?.local;
    if (!player) return;
    for (const rule of this.rules) {
      if (rule.when?.event !== 'notify') continue;
      this.#off.push(player.on(rule.when.name, () => {
        if (rule.fired && rule.once !== false) return;
        if (!this.#ready(rule)) return;
        this.#fire(rule);
      }));
    }
  }

  unlisten() {
    for (const off of this.#off) off();
    this.#off = [];
  }

  #run(action) {
    const game = this.game;
    const after = (seconds, run) => (seconds ? game.time.after(seconds, run) : run());
    switch (action.do) {
      case 'notice':
        this.scene.hud?.notice(action.text, action.seconds, action.element);
        break;
      case 'objective':
        this.scene.hud?.setText(action.element ?? 'objective', action.text);
        break;
      case 'say':
        this.scene.hud?.say(action.speaker ?? '', action.lines, action.element);
        break;
      case 'sound':
        game.soundManager?.playSound(action.key);
        break;
      case 'unseal': {
        const entity = this.#entity(action.object);
        if (!entity) break;
        // The two words the demos' gates use for "closed": a Trigger's `active`, a gate's `sealed`.
        if ('sealed' in entity) entity.sealed = false;
        if ('active' in entity) entity.active = true;
        entity.onUnseal?.();
        break;
      }
      case 'remove': {
        const entity = this.#entity(action.object);
        if (entity && !this.#gone(entity)) {
          entity.dead = true;
          game.entities.delete(entity);
          game.physics.remove(entity.body);
        }
        break;
      }
      case 'set': {
        const entity = this.#entity(action.object);
        if (entity && typeof action.property === 'string') entity[action.property] = action.value;
        break;
      }
      case 'count': {
        const counters = this.scene.counters;
        if (!counters) break;
        if (typeof action.set === 'number') counters.set(action.counter, action.set);
        else counters.add(action.counter, action.add ?? 1);
        break;
      }
      case 'switch':
        after(action.after, () => { void game.sceneManager.switchTo(action.scene); });
        break;
      case 'gameOver':
        after(action.after, () => game.gameOver());
        break;
      case 'camera': {
        // Presentation: a headless game and a server have no view to bound.
        if (game.headless || !game.camera) break;
        const edges = ['left', 'top', 'right', 'bottom'].filter((key) => typeof action[key] === 'number');
        if (!edges.length) break;
        game.camera.bounds = { ...(game.camera.bounds ?? {}), ...Object.fromEntries(edges.map((key) => [key, action[key]])) };
        break;
      }
      case 'cycle': {
        const cycle = this.scene.cycle;
        if (!cycle) break;
        if (typeof action.phase === 'number') { cycle.phase = action.phase; cycle.target = action.phase; }
        if (typeof action.target === 'number') {
          cycle.target = action.toggle && cycle.target === action.target ? 0 : action.target;
        }
        if (typeof action.ease === 'number') cycle.ease = action.ease;
        break;
      }
      default:
        break;
    }
  }
}
