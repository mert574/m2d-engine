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
export class Constraint {
  constructor(entity) {
    this.entity = entity;
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
