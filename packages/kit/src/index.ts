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
export { Ghost, Bee, Coin, MovingPlatform, Player, TopDownPlayer, ObliquePlayer, Platform, Turret, Rocket, Npc, GravityDial, Clip, PREFAB_TEMPLATES, registerKitActors } from './actors.ts';
export { WallSlip, GlideControl, CarControl, ThrustControl, registerKitControls } from './controls.ts';
export { Behavior, registerKitAi } from './ai.ts';
export type { BehaviorOptions, BehaviorState } from './ai.ts';
export { Sky, Scatter, ParticleField, AmbientSound, PathStrip, SCENERY_TEMPLATES, registerKitScenery } from './scenery.ts';
export { AttackSwing, HitBurst, registerEffects } from './effects.ts';
export { makeRng, range } from './random.ts';
export { tileTexture } from './textures.ts';
export { audioOption } from './audio.ts';
export type { SettingsRow } from './audio.ts';
export type { PrefabTemplate, ScenePrefab } from './templates.ts';
export type { ActorBody, ActorSprite } from './engineTypes.ts';

import type { M2D } from 'm2d-engine';
import { registerKitActors } from './actors.ts';
import { registerKitControls } from './controls.ts';
import { registerKitScenery } from './scenery.ts';
import { registerEffects } from './effects.ts';
import { registerKitAi } from './ai.ts';

/** Everything the kit registers, in one call, before the game's own registrations. */
export function registerKit(game: M2D): void {
  registerKitActors(game);
  registerKitControls(game);
  registerKitScenery(game);
  registerEffects(game);
  registerKitAi(game);
}
