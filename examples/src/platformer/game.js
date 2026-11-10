import { Chase } from 'm2d-engine/constraints/chase.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import {
  EmberPlayer, DuskPlatform, DuskMovingPlatform, GlowCoin, DuskBee, ValleyGate
} from './duskActors.js';

/**
 * Ember Valley's definition: the cast and the options its simulation
 * depends on, and nothing that shows them. See m2d.project.json.
 */

/** M2D options the valley's simulation depends on. */
export const GAME = { worldWidth: 1920, worldHeight: 1440 };

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    Player: EmberPlayer, Bee: DuskBee, Platform: DuskPlatform,
    MovingPlatform: DuskMovingPlatform, Coin: GlowCoin, Trigger: ValleyGate
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  game.registerConstraint('AttackSwing', AttackSwing);
  game.registerConstraint('HitBurst', HitBurst);
  game.registerConstraint('Chase', Chase);
}
