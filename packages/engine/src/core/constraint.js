import { s } from './schema.js';

/**
 * A reusable behaviour attached to an entity.
 *
 * Two update hooks, for two different clocks:
 *
 * - `fixedUpdate(dt)` runs once per simulation tick with the constant
 *   `dt`, before the physics step. Everything that changes the game —
 *   movement, cooldowns, damage, spawning, AI decisions — belongs here, so
 *   the simulation is identical however the frames fall.
 * - `update(deltaTime)` runs once per frame with the frame's game-time
 *   delta. It is for presentation that is not physics: a hit flash fading,
 *   an idle bob, a walk cycle. Nothing in it should feed back into the
 *   simulation.
 *
 * `draw` runs in the world pass with the frame delta.
 */
/**
 * A `keys` param: action name to physical key code (`'KeyW'`, never a
 * character). Shared by every constraint that reads the keyboard, which
 * all merge what they are given over their own defaults.
 */
export const KEY_BINDINGS = s.record(s.string({ nonEmpty: true }), {
  label: 'Key bindings',
  editor: 'keys',
  description: 'Action name to physical key code'
});

export class Constraint {
  /** Fields a server sends when they change. See `Entity.replicated`. */
  static replicated = [];

  /**
   * The constraint's tunable data, as schema descriptors keyed by option
   * name — what makes it something a scene can declare and an inspector
   * can draw. A param absent here cannot be set from a scene file.
   *
   * Only data belongs here. A constraint's callbacks (`onDeath`,
   * `onMove`) cannot be written in JSON and stay the actor's job. Each
   * param is named after the field it sets, which is what `configure`
   * assigns it to, and records its default as `initial` rather than
   * `default` — see `configure`.
   *
   * @type {Object<string, object>}
   */
  static params = {};

  /** One line on what the constraint does, for an editor's component library. @type {string} */
  static description = '';

  constructor(entity) {
    this.entity = entity;
  }

  /**
   * Apply tunables to a constraint that already exists — a scene object
   * overriding what its actor or its prefab set up.
   *
   * The default assigns each param to the field of the same name, which is
   * the convention `static params` describes. Override it when a value is
   * not simply stored: when another field is derived from it, or when
   * changing it has to invalidate something.
   *
   * @param {Object} params - Validated against `static params`.
   */
  configure(params) {
    Object.assign(this, params);
  }

  /**
   * One simulation tick.
   * @param {number} dt - Seconds; always `game.time.fixedTimestep`.
   */
  fixedUpdate(dt) {
    // Override in child classes
  }

  /**
   * One frame of presentation.
   * @param {number} deltaTime - Seconds of game time this frame.
   */
  update(deltaTime) {
    // Override in child classes
  }

  onCollisionStart(other) {
    // Override in child classes
  }

  /**
   * An event the simulation raised about this constraint's entity, after
   * the tick that raised it. Presentation: a flash, a sound, a burst. See
   * core/events.js.
   * @param {string} name
   * @param {object} data
   */
  onWorldEvent(name, data) {
    // Override in child classes
  }

  onCollisionEnd(other) {
    // Override in child classes
  }

  draw(deltaTime) {
    // Override in child classes
  }
}
