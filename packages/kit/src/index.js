/**
 * The kit: what games on m2d compose from that is too opinionated for the
 * engine and too reusable to live in one game. Each piece has its own
 * entry (`m2d-kit/effects`, `m2d-kit/random`, …) so a game imports what it
 * uses; this module re-exports them all for convenience.
 *
 * What belongs here is decided by the engine-surface project's test
 * (knowledge-base/projects/engine-surface/): two games or a template want
 * it, it declares its properties or params, it works in 2D and 3D or says
 * which, and it ships with its test and its docs page.
 */
export { Ghost, Bee, Coin, MovingPlatform, Player, TopDownPlayer, ObliquePlayer, Platform, Turret, Rocket, Npc, PREFAB_TEMPLATES, registerKitActors } from './actors.js';
export { WallSlip, GlideControl, CarControl, ThrustControl, registerKitControls } from './controls.js';
export { Sky, Scatter, ParticleField, AmbientSound, SCENERY_TEMPLATES, registerKitScenery } from './scenery.js';
export { AttackSwing, HitBurst, registerEffects } from './effects.js';
export { makeRng, range } from './random.js';
export { tileTexture } from './textures.js';
export { audioOption } from './audio.js';

import { registerKitActors } from './actors.js';
import { registerKitControls } from './controls.js';
import { registerKitScenery } from './scenery.js';
import { registerEffects } from './effects.js';

/** Everything the kit registers, in one call, before the game's own registrations. */
export function registerKit(game) {
  registerKitActors(game);
  registerKitControls(game);
  registerKitScenery(game);
  registerEffects(game);
}
