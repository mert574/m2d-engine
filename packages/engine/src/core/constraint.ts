import { s } from './schema.ts';
import type { SchemaDescriptor } from './schema.ts';
import type { Entity } from './entity.ts';
import type { PhysicsBody } from './physics/index.ts';

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
  static replicated: string[] = [];

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
   * Null declares that the constraint takes any params, unchecked.
   */
  static params: Record<string, SchemaDescriptor> | null = {};

  /** One line on what the constraint does, for an editor's component library. */
  static description = '';

  entity: Entity;
  /**
   * Set, the entity skips this constraint's ticks (it still draws): a
   * stun, a repel, a cutscene holding an actor still without detaching
   * what it was doing.
   */
  suspended: boolean;

  constructor(entity: Entity) {
    this.entity = entity;
    this.suspended = false;
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
   * `params` is validated against `static params`.
   */
  configure(params: Record<string, unknown>): void {
    Object.assign(this, params);
  }

  /**
   * One simulation tick. `dt` is seconds; always `game.time.fixedTimestep`.
   */
  fixedUpdate(dt: number): void {
    // Override in child classes
  }

  /**
   * One frame of presentation. `deltaTime` is seconds of game time this frame.
   */
  update(deltaTime: number): void {
    // Override in child classes
  }

  onCollisionStart(other: PhysicsBody): void {
    // Override in child classes
  }

  /**
   * An event the simulation raised about this constraint's entity, after
   * the tick that raised it. Presentation: a flash, a sound, a burst. See
   * core/events.js.
   */
  onWorldEvent(name: string, data: Record<string, unknown>): void {
    // Override in child classes
  }

  onCollisionEnd(other: PhysicsBody): void {
    // Override in child classes
  }

  draw(deltaTime: number): void {
    // Override in child classes
  }

  /** Release what the constraint registered elsewhere; see `Entity.destroy`. */
  destroy?(): void;

  /** Take back what `destroy` let go of; see `Entity.revive`. */
  revive?(): void;
}
