import { Prop } from 'm2d-engine/actors/prop.js';

/**
 * The game's definition: the cast, and the options its simulation needs —
 * nothing that shows them. `main.js` boots from it, the editor runs it,
 * and a headless server or test can too. See m2d.project.json.
 */

/** M2D options the simulation depends on. */
export const GAME = { dimensions: 3, worldWidth: 40, worldHeight: 40 };

/** Register the cast, on a displayed game, a headless one or the editor's. */
export function register(game) {
  game.registerActor('Prop', Prop);
}
