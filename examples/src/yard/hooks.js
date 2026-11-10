import { UIText } from 'm2d-engine/core/ui/text.js';
import { loadAmbience, Footsteps } from './ambience.js';

/**
 * The yard's and the lot's presentation hooks: the camera, the light and
 * its turn to dusk, the wind, the HUD. Kept out of the definition
 * (`game.js`) so a headless game never loads them; `main.js` and the
 * editor's play mode both build them here. See m2d.project.json.
 */
export function sceneHooks(game) {
  loadAmbience(game.soundManager);

  let unsubscribe = [];
  const hooksFor = (title) => ({
    onEnter() {
      // The player and the orbit camera are the scene's (`world.player`,
      // `world.camera`), so the editor shows them; the scene set them before
      // this ran. The footsteps are presentation code the fox carries.
      game.player.footsteps = new Footsteps(game.soundManager);
    },

    onShow() {
      // A breath of wind under everything, faded in so the page does not open on a gust.
      const wind = game.soundManager.loop('wind', { volume: 0 });
      let level = 0;
      const fade = setInterval(() => { level = Math.min(1, level + 0.05); wind.setVolume(level); if (level >= 1) clearInterval(fade); }, 100);
      unsubscribe.push(() => { clearInterval(fade); wind.stop(); });
      unsubscribe.push(game.input.on('drag', (event) => {
        game.camera.orbit(-event.delta.ui.x * 0.005, event.delta.ui.y * 0.004);
        event.consume();
      }));
      unsubscribe.push(game.input.on('scroll', (event) => {
        game.camera.zoom(Math.exp(event.scroll.y * 0.0012));
        event.consume();
      }));
      unsubscribe.push(game.input.on('keydown', (event) => {
        if (event.code === 'KeyT') {
          const cycle = game.sceneManager.getCurrentScene().cycle;
          if (cycle) cycle.target = cycle.target ? 0 : 1;
          event.consume();
        }
      }));

      const ui = game.sceneManager.getCurrentScene().ui;
      ui.add(new UIText({
        x: 20, y: 16, anchor: 'top-left', text: title, fontSize: '15px', letterSpacing: 2,
        color: 'rgba(255, 248, 236, 0.9)', outlineColor: 'rgba(0, 0, 0, 0.35)', outlineWidth: 2
      }));
      ui.add(new UIText({
        x: -20, y: -16, anchor: 'bottom-right', align: 'right',
        text: 'Drag orbits · Scroll zooms · WASD walks the fox · Space jumps · T dusk · O settings · F3 stats · ` console (noclip)',
        fontSize: '13px', color: 'rgba(255, 248, 236, 0.75)', outlineColor: 'rgba(0, 0, 0, 0.3)', outlineWidth: 2
      }));
    },

    onHide() {
      for (const off of unsubscribe) off();
      unsubscribe = [];
    },

    // The look is the scene's (`world.lighting`, `world.post`, and the
    // afternoon-to-dusk `world.cycle`), applied by the engine every frame;
    // T flips the cycle's target above. Nothing to render here.
  });

  return { yard: hooksFor('THE YARD'), lot: hooksFor('THE LOT') };
}
