import { UIText } from 'm2d-engine/core/ui/text.js';

/**
 * The scenes' presentation hooks — the camera, the light, the HUD — kept
 * out of the definition so a headless game never loads them. `main.js`
 * and the editor's play mode both use these. See m2d.project.json.
 */
export function sceneHooks(game) {
  let off = [];
  return {
    level: {
      onEnter() {
        Object.assign(game.camera, { mode: 'orbit', distance: 14, yaw: 0.7, pitch: 0.42, minDistance: 3, maxDistance: 40 });
      },
      onShow() {
        off.push(game.input.on('drag', (event) => {
          game.camera.orbit(-event.delta.ui.x * 0.005, event.delta.ui.y * 0.004);
          event.consume();
        }));
        off.push(game.input.on('scroll', (event) => {
          game.camera.zoom(Math.exp(event.scroll.y * 0.0012));
          event.consume();
        }));
        game.sceneManager.getCurrentScene().ui.add(new UIText({
          x: 20, y: 16, anchor: 'top-left', text: 'Drag orbits · Scroll zooms',
          fontSize: '15px', color: 'rgba(255, 252, 244, 0.9)'
        }));
      },
      onHide() {
        for (const unsubscribe of off) unsubscribe();
        off = [];
      },
      onRender(frame) {
        // A clear late morning: a warm high sun under a pale blue sky.
        frame.sun = { direction: [0.4, -0.75, 0.35], color: [1, 0.95, 0.85], intensity: 4 };
        frame.ambient = { sky: [0.45, 0.58, 0.8], ground: [0.25, 0.22, 0.18], intensity: 0.6 };
        frame.fog = { color: [0.72, 0.82, 0.93], density: 0.005 };
      }
    }
  };
}
