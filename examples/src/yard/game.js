import { Hero, Ground, Crate } from './actors.js';

/**
 * The yard's definition: the cast and the options its simulation depends
 * on, and nothing that shows them. See m2d.project.json.
 */

/** M2D options the yard's simulation depends on. It is a 3D game. */
export const GAME = { dimensions: 3, worldWidth: 40, worldHeight: 40 };

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({ Hero, Ground, Crate })) {
    game.registerActor(name, actor);
  }
}
