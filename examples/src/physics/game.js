import { AmberBall, WoodCrate, Housing, Girder, Peg, Spout } from './machineActors.js';
import { WorkshopBackdrop } from './workshopBackdrop.js';

/**
 * The playground's definition: the cast the workshop places, and nothing
 * that shows it. See m2d.project.json.
 *
 * Grabbing, flinging and removing a body are the engine's `Grabbable`,
 * attached by the ball and crate prefabs; the gravity the pointer used to
 * scroll is a counter the scene's action rules turn.
 */

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    Ball: AmberBall, Box: WoodCrate, Housing, Girder, Peg, Spout, WorkshopBackdrop
  })) game.registerActor(name, actor);
}
