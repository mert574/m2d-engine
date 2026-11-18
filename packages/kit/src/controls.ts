import type { M2D } from 'm2d-engine/core/m2d.js';
import { WallSlip } from './controls/wallSlip.ts';
import { GlideControl } from './controls/glideControl.ts';
import { CarControl } from './controls/carControl.ts';
import { ThrustControl } from './controls/thrustControl.ts';

/**
 * Genre controllers: how a body answers held keys in one kind of game.
 * The engine's `KeyboardControl` and `PointerMove` are the plain
 * capabilities; these are opinionated — a platformer's wall slide, a
 * corridor glide, arcade car handling, a ship's thrust — and a game
 * attaches one from a scene's `constraints` or an actor's constructor.
 */
export { WallSlip } from './controls/wallSlip.ts';
export { GlideControl } from './controls/glideControl.ts';
export { CarControl } from './controls/carControl.ts';
export { ThrustControl } from './controls/thrustControl.ts';
export type { GlideControlOptions } from './controls/glideControl.ts';
export type { CarControlOptions, CarControls } from './controls/carControl.ts';
export type { ThrustControlOptions } from './controls/thrustControl.ts';

/** Register the four under the names scenes use, marked as the kit's for the editor's catalog. */
export function registerKitControls(game: M2D): void {
  const kit = { origin: 'kit' };
  for (const [name, klass] of Object.entries({ WallSlip, GlideControl, CarControl, ThrustControl })) {
    game.registerConstraint(name, klass, kit);
  }
}
