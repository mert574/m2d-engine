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
   * name. See `core/schema.js`.
   *
   * This is what makes a constraint something a scene can declare and an
   * editor can show: the loader validates declared params against it, and
   * an inspector reads the type, default and range of each one to draw the
   * right control. A constraint with no entry here cannot be configured
   * from a scene file at all.
   *
   * **Only data belongs here.** The callbacks a constraint takes —
   * `onDeath`, `onMove`, `canCast` — are code, cannot be written in JSON,
   * and are deliberately absent, so an actor still wires those up itself.
   *
   * A param is named after the field it sets, because that is what
   * `configure` assigns it to.
   *
   * @type {Object<string, object>}
   */
  static params = {};

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

  onCollisionEnd(other) {
    // Override in child classes
  }

  draw(deltaTime) {
    // Override in child classes
  }
}
