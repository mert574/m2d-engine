import type { M2D } from 'm2d-engine/core/m2d.js';
import { Behavior } from './ai/behavior.ts';

/**
 * NPC intelligence: the behaviour ladder over the engine's capabilities.
 * One entry so a game without NPCs never loads it.
 */
export { Behavior } from './ai/behavior.ts';
export type { BehaviorOptions, BehaviorState } from './ai/behavior.ts';

/** Register it under the name scenes use, marked as the kit's for the editor's catalog. */
export function registerKitAi(game: M2D): void {
  game.registerConstraint('Behavior', Behavior, { origin: 'kit' });
}
