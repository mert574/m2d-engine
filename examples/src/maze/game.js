import { HedgeWall, Gardener, Fountain, FlowerBed } from './gardenActors.js';
import { GardenBackdrop } from './gardenBackdrop.js';

/**
 * Hedgerow Court's definition: the cast the courts place, and nothing
 * that shows them. See m2d.project.json.
 *
 * The three gardens are scene files, laid out once by
 * `scripts/buildCourtScenes.mjs`. How the gardener walks is the engine's
 * `GlideControl`, which the player prefab attaches; what a tended bed and
 * a reached fountain mean is each court's rules.
 */

/** Register the cast, on a displayed game or the editor's. */
export function register(game) {
  for (const [name, actor] of Object.entries({
    Gardener, Hedge: HedgeWall, Fountain, FlowerBed, GardenBackdrop
  })) game.registerActor(name, actor);
}
