import { Trigger } from 'm2d-engine/actors/trigger.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { Rogue, Thug, Lamp, Bound } from './rowActors.js';
import { Street, Foreground } from './streetScenery.js';
import assetManifest from './assets.json';

/**
 * Ash Row's definition: the cast, the asset manifest its scene binds by
 * uid — nothing that shows them. The row's size is its scene's. See
 * m2d.project.json.
 */

/** Register the cast and its assets, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    ObliquePlayer: Rogue, Ghost: Thug, Lamp, Bound, Street, Foreground, Trigger
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  game.registerConstraint('AttackSwing', AttackSwing);
  game.registerConstraint('HitBurst', HitBurst);
  // The creatures come from the manifest, by uid: three sprite sheets and
  // the one prefab that wears them, bound into the scene by its `uses`
  // block. After the actors, so a prefab naming one that is not
  // registered fails here. It lives in the definition rather than the
  // boot script because the editor materializes the scene from this alone.
  game.loadAssets(assetManifest);
}
