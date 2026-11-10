import { Npc } from 'm2d-engine/actors/npc.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { Tree, Decor, Bound, Pond, Wanderer, Wisp, Lantern, Clearing, GroundDetail } from './groveActors.js';

/**
 * Hollow Grove's definition: the cast and the options its simulation
 * depends on, and nothing that shows them. `main.js` boots a game from
 * this; the editor registers the same classes to materialize the grove
 * as it really looks. The Cinder Keep split (`iso/game.js`) is the
 * precedent; see m2d.project.json.
 */

export const WORLD = { width: 3200, height: 2400 };

/** M2D options the grove's simulation depends on. */
export const GAME = { worldWidth: WORLD.width, worldHeight: WORLD.height };

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    ObliquePlayer: Wanderer, Ghost: Wisp, Tree, Decor, Bound, Pond,
    Coin: Lantern, Trigger: Clearing, Npc, GroundDetail
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  game.registerConstraint('AttackSwing', AttackSwing);
  game.registerConstraint('HitBurst', HitBurst);
}
