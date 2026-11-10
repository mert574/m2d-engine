import {
  FacilityWall, SpecterGhost, SentryTurret, DataCore, ExtractionPad, ScannerAgent
} from './facilityActors.js';

/**
 * The facility's definition: the cast and the options its simulation
 * depends on, and nothing that shows them. See m2d.project.json.
 */

/** M2D options the facility's simulation depends on. */
export const GAME = { worldWidth: 3840, worldHeight: 2880 };

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    TopDownPlayer: ScannerAgent, Ghost: SpecterGhost, Platform: FacilityWall,
    Coin: DataCore, Trigger: ExtractionPad, Turret: SentryTurret
  })) game.registerActor(name, actor);
}
