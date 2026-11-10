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
        // Keep the camera inside the level: without bounds, following the
        // player (or an 'expand' aspect mode widening the view) reveals the
        // void past the map.
        game.camera.bounds = {
          left: 0, top: 0,
          right: game.options.worldWidth, bottom: game.options.worldHeight
        };
        game.soundManager.playMusic('game');
        backdrop = new DuskLevelBackdrop(game);
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
