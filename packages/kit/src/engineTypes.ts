import type { Entity } from 'm2d-engine';

/**
 * The engine's side of the kit's types.
 *
 * Every actor is built by the scene loader as `new Actor(body, sprite,
 * game, options)`, so the kit's classes have to take what the engine hands
 * over. The engine is still plain JavaScript with JSDoc, and its own
 * description of a body and a sprite sheet stops at the constructor (see
 * the Types item in docs/contributing/roadmap.md), so rather than writing
 * a second description of the engine here — a stand-in that would drift
 * from it silently — these aliases are *taken from* the engine's own
 * constructor. The day the engine says more about them, every kit class
 * tightens with it and nothing here changes.
 */
export type ActorBody = ConstructorParameters<typeof Entity>[0];

/**
 * The other half of that boundary: an entity's constraints live in a map
 * of whatever a scene attached, so `getConstraint('attack')` cannot be
 * typed by the engine. An actor that attached the constraint itself knows
 * which class is in the slot and says so where it reads it
 * (`this.getConstraint('attack')!`). It is the one narrowing the
 * kit makes by hand, and it is checked the moment the slot is used: the
 * class it names has to have the member the next line reads.
 */

/** The sprite sheet an actor is built with, as the engine hands it over. See `ActorBody`. */
export type ActorSprite = ConstructorParameters<typeof Entity>[1];

/** A point or a direction on the ground plane. */
export interface Vec2 {
  x: number;
  y: number;
}

/** The 2D camera's visible rectangle, for scenery that only paints flat levels. */
export type VisibleArea2D = ReturnType<import('m2d-engine').Camera['getVisibleArea']>;

/** The visible world as either camera's `getVisibleArea` reports it, taken from the cameras themselves. */
export type VisibleArea =
  | ReturnType<import('m2d-engine').Camera['getVisibleArea']>
  | ReturnType<import('m2d-engine').Camera3D['getVisibleArea']>;
