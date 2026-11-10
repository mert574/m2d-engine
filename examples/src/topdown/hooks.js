import { FacilityBackdrop } from './facilityBackdrop.js';

/**
 * The Facility's presentation hooks: the dark drawn under and over the
 * level, its light and the music, and the camera kept inside the map.
 * Kept out of the definition (`game.js`) so a headless game never loads
 * them; `main.js` and the editor's play mode both build them here. See
 * m2d.project.json.
 */
export function sceneHooks(game) {
  // The facility's dark, built per entry and torn down on exit so its ambient
  // light and post pass never leak into the menu.
  let backdrop = null;

  return {
    level1: {
      onEnter() {
        // Keep the camera inside the level: without bounds, following the player
        // (or an 'expand' aspect mode widening the view) reveals the void past
        // the map.
        game.camera.bounds = {
          left: 0, top: 0,
          right: game.options.worldWidth, bottom: game.options.worldHeight
        };
        game.soundManager.playMusic('game');
        backdrop = new FacilityBackdrop(game, game.sceneManager.getCurrentScene().spriteSheets.get('floor'));
        backdrop.applyAtmosphere();
      },
      onExit() {
        backdrop?.clearAtmosphere();
        backdrop = null;
      },
      onUpdate(deltaTime) {
        backdrop?.update(deltaTime);
      },
      onDrawBackground() {
        backdrop?.drawBackground();
      },
      onDraw() {
        backdrop?.drawForeground();
      }
    }
  };
}
