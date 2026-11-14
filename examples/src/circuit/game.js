import { RaceDirector } from './raceDirector.js';
import { Road } from './road.js';
import { RaceHud } from './raceHud.js';
import { TrafficCar, Cone, Barrel, OilSlick, BoostPad, GateArm, Checkpoint, IceStretch, Tunnel } from './actors.js';
import { TouchControls } from './touchControls.js';
import { NightLap } from './menuBackdrop.js';
import { registerMenuParts } from './menuParts.js';

/**
 * Night Circuit's definition: the cast the circuits place, and nothing
 * that shows them. See m2d.project.json.
 *
 * The six tracks are scene files, seeded once by
 * `scripts/buildCircuitScenes.mjs`: each one's road is a closed smooth
 * path whose points carry the width of the asphalt, and the cones,
 * barrels, slicks, pads, gates, traffic and checkpoints are placed on it.
 * The race director (one per scene) runs the rounds, the laps and the
 * replays; the road draws the circuit from the same path.
 */

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  game.registerBackdropLayer('nightLap', () => new NightLap());
  for (const [name, actor] of Object.entries({
    Road, RaceDirector, TrafficCar, Cone, Barrel, OilSlick, BoostPad, GateArm, Checkpoint, IceStretch, Tunnel
  })) game.registerActor(name, actor);
  // The live readout and the touch controls, which each circuit's hud places by name.
  game.registerUIComponent('raceHud', (scene, element) => new RaceHud(scene, element));
  game.registerUIComponent('touchControls', (scene, element) => new TouchControls(scene, element));
  registerMenuParts(game);
}
