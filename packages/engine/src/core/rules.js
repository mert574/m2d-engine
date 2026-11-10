/**
 * A level's rules — `world.rules` — run by the scene each tick.
 *
 * A rule is a `when` and a `then`: an event the scene watches for, and the
 * actions it takes once (or every time, with `once: false`). The events are
 * the ones every level has had in code so far: the scene starting, every
 * object of a prefab collected, the player entering an object, an object
 * (or the player) dying, the player falling below the kill plane. The
 * actions are the things those hooks did: a notice on the HUD, a sound,
 * unsealing a gate, removing an object, a scene switch or game over after
 * a moment, turning the lighting cycle, setting a field on an object.
 *
 * Simulation, so it runs headless and on a server, and in play; never in
 * edit mode, where nothing moves. Presentation actions (a notice, a sound)
 * do nothing without a display. Conditions are polled rather than listened
 * for, so a rule is a pure function of the world at the tick and a replay
 * agrees.
 */
export class SceneRules {
  /**
   * @param {import('./scene.js').Scene} scene
   * @param {Array<object>} rules - `world.rules`, validated
   */
  constructor(scene, rules = []) {
    this.scene = scene;
    this.game = scene.game;
    this.rules = rules.map((rule) => ({ ...rule, fired: false }));
    this.started = false;
    /** Set by the kill plane check, read once. */
    this.fell = false;
  }

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
        return this.#gone(this.#entity(when.object));
      case 'fall':
        return this.fell;
      default:
        return false;
    }
  }

  /** One tick: fire every rule whose event holds. */
  fixedUpdate() {
    for (const rule of this.rules) {
      if (rule.fired && rule.once !== false) continue;
      if (!this.#holds(rule.when)) continue;
      rule.fired = true;
      for (const action of rule.then ?? []) this.#run(action);
    }
    this.started = true;
    this.fell = false;
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
      case 'switch':
        after(action.after, () => { void game.sceneManager.switchTo(action.scene); });
        break;
      case 'gameOver':
        after(action.after, () => game.gameOver());
        break;
      case 'cycle': {
        const cycle = this.scene.cycle;
        if (!cycle) break;
        if (typeof action.target === 'number') cycle.target = action.target;
        if (typeof action.phase === 'number') { cycle.phase = action.phase; cycle.target = action.phase; }
        if (typeof action.ease === 'number') cycle.ease = action.ease;
        break;
      }
      default:
        break;
    }
  }
}
