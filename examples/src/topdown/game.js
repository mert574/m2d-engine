import { AttackSwing, HitBurst } from '../shared/effects.js';
import {
  FacilityWall, SpecterGhost, SentryTurret, DataCore, ExtractionPad, ScannerAgent
} from './facilityActors.js';
import { FloorMarks, CeilingLamp } from './facilityFloor.js';
import { Sonar } from './sonar.js';

/**
 * The facility's definition: the cast and the options its simulation
 * depends on, and nothing that shows them. See m2d.project.json.
 */

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    TopDownPlayer: ScannerAgent, Ghost: SpecterGhost, Platform: FacilityWall,
    Coin: DataCore, Trigger: ExtractionPad, Turret: SentryTurret, FloorMarks, CeilingLamp
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  game.registerConstraint('AttackSwing', AttackSwing);
  game.registerConstraint('HitBurst', HitBurst);
  game.registerConstraint('Sonar', Sonar);
}
