import { Trigger } from 'm2d-engine/actors/trigger.js';
import { Rogue, Thug, Lamp, Bound } from './rowActors.js';
import { Street, Foreground } from './streetScenery.js';
import layout from './layout.json';

/**
 * Ash Row's definition: the cast and the options its simulation depends
 * on, and nothing that shows them. See m2d.project.json.
 */

export const WORLD = { width: layout.length, height: 400 };

/** M2D options the row's simulation depends on. */
export const GAME = { worldWidth: WORLD.width, worldHeight: WORLD.height };

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    ObliquePlayer: Rogue, Ghost: Thug, Lamp, Bound, Street, Foreground, Trigger
  })) game.registerActor(name, actor);
}
