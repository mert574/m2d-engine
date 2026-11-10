import { UIText } from 'm2d-engine/core/ui/text.js';

/**
 * The scenes' presentation hooks — the HUD, music, camera setup — kept out
 * of the definition so a headless game never loads them. `main.js` and
 * the editor's play mode both use these. See m2d.project.json.
 */
export function sceneHooks(game) {
  return {
    level: {
      onShow() {
        game.sceneManager.getCurrentScene().ui.add(new UIText({
          x: 20, y: 16, anchor: 'top-left', text: 'Arrows move · Space jumps',
          fontSize: '15px', color: '#2b3a4a'
        }));
      }
    }
  };
}
