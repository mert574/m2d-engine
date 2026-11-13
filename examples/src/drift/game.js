import { Ship, Meteor, Drone, Salvage, Gate, Bound, Sky } from './fieldActors.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';

/**
 * Salvage Run's definition: the cast, and nothing that shows it. The
 * field's size is its scene's. See m2d.project.json.
 */

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    Ship, Meteor, Drone, Salvage, Gate, Bound, Sky
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  game.registerConstraint('AttackSwing', AttackSwing);
  game.registerConstraint('HitBurst', HitBurst);
}
