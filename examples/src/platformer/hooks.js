import { DuskLevelBackdrop } from './levelBackdrop.js';

/**
 * Ember Valley's presentation hooks: the dusk valley drawn behind and in
 * front of the level, its light and the music, and the camera kept inside
 * the map. Kept out of the definition (`game.js`) so a headless game never
 * loads them; `main.js` and the editor's play mode both build them here.
 * See m2d.project.json.
 */
export function sceneHooks(game) {
  // The level's world: the menu's valley, built per entry and torn down on
  // exit so its ambient light and post pass never leak into the menu.
  let backdrop = null;

  return {
    level1: {
      onEnter() {
        // The camera, the light, the post pass, the music and the sounds are
        // the scene's (level1.json); only the valley's drawn backdrop stays.
        backdrop = new DuskLevelBackdrop(game);
      },
      onExit() {
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
