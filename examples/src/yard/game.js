import { Hero, Ground, Crate } from './actors.js';
import { YardAfternoon } from './menuBackdrop.js';
import { registerKitScenery } from 'm2d-kit/scenery';

/**
 * The yard's definition: the cast and the options its simulation depends
 * on, and nothing that shows them. See m2d.project.json.
 */

/** M2D options the yard's simulation depends on. It is a 3D game. */
export const GAME = { dimensions: 3 };

/** Register the cast and the menu's painting, on a displayed game or the editor's. */
export function register(game) {
  // The wind, and the lot's motes and chimney smoke.
  registerKitScenery(game);
  for (const [name, actor] of Object.entries({ Hero, Ground, Crate })) {
    game.registerActor(name, actor);
  }
  game.registerBackdropLayer('yardAfternoon', () => new YardAfternoon());
}
