import { Ship, Meteor, Drone, Salvage, Gate, Bound, Sky } from './fieldActors.js';
import layout from './layout.json';

/**
 * Salvage Run's definition: the cast and the options its simulation
 * depends on, and nothing that shows them. See m2d.project.json.
 */

/** M2D options the field's simulation depends on. */
export const GAME = { worldWidth: layout.world.width, worldHeight: layout.world.height };

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    Ship, Meteor, Drone, Salvage, Gate, Bound, Sky
  })) game.registerActor(name, actor);
}
