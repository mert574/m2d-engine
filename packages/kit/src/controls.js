/**
 * Genre controllers: how a body answers held keys in one kind of game.
 * The engine's `KeyboardControl` and `PointerMove` are the plain
 * capabilities; these are opinionated — a platformer's wall slide, a
 * corridor glide, arcade car handling, a ship's thrust — and a game
 * attaches one from a scene's `constraints` or an actor's constructor.
 */
export { WallSlip } from './controls/wallSlip.js';
export { GlideControl } from './controls/glideControl.js';
export { CarControl } from './controls/carControl.js';
export { ThrustControl } from './controls/thrustControl.js';

import { WallSlip } from './controls/wallSlip.js';
import { GlideControl } from './controls/glideControl.js';
import { CarControl } from './controls/carControl.js';
import { ThrustControl } from './controls/thrustControl.js';

/** Register the four under the names scenes use, marked as the kit's for the editor's catalog. */
export function registerKitControls(game) {
  const kit = { origin: 'kit' };
  for (const [name, klass] of Object.entries({ WallSlip, GlideControl, CarControl, ThrustControl })) {
    game.registerConstraint(name, klass, kit);
  }
}
