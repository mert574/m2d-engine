import { Trigger } from 'm2d-engine/actors/trigger.js';
import { Rogue, Thug, Lamp, Bound } from './rowActors.js';
import { Street, Foreground } from './streetScenery.js';
import layout from './layout.json';
import assetManifest from './assets.json';

/**
 * Ash Row's definition: the cast, the asset manifest its scene binds by
 * uid, and the options its simulation depends on — nothing that shows
 * them. See m2d.project.json.
 */

export const WORLD = { width: layout.length, height: 400 };

/** M2D options the row's simulation depends on. */
export const GAME = { worldWidth: WORLD.width, worldHeight: WORLD.height };

/** Register the cast and its assets, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    ObliquePlayer: Rogue, Ghost: Thug, Lamp, Bound, Street, Foreground, Trigger
  })) game.registerActor(name, actor);
  // The creatures come from the manifest, by uid: three sprite sheets and
  // the one prefab that wears them, bound into the scene by its `uses`
  // block. After the actors, so a prefab naming one that is not
  // registered fails here. It lives in the definition rather than the
  // boot script because the editor materializes the scene from this alone.
  game.loadAssets(assetManifest);
}
