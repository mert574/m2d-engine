import { Prop } from 'm2d-engine/actors';
import { registerKitScenery } from 'm2d-kit/scenery';

/**
 * The game's definition: the cast, and the options its simulation needs —
 * nothing that shows them. `main.js` boots from it, the editor runs it,
 * and a headless server or test can too. See m2d.project.json.
 */

/** M2D options the simulation depends on. */
export const GAME = { dimensions: 3, worldWidth: 40, worldHeight: 40 };

/** Register the cast, on a displayed game, a headless one or the editor's. */
export function register(game) {
  // The kit's scenery first — motes, smoke, ambient sound and their
  // templates — so anything the game registers under the same name wins.
  registerKitScenery(game);
  game.registerActor('Prop', Prop);
}
