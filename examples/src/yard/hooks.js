import { loadAmbience, Footsteps } from './ambience.js';

/**
 * The yard's and the lot's presentation hooks: the turn to dusk and the
 * wind. The camera, the light and the HUD are the scenes'; see the
 * scene files. Kept out of the definition
 * (`game.js`) so a headless game never loads them; `main.js` and the
 * editor's play mode both build them here. See m2d.project.json.
 */
export function sceneHooks(game) {
  loadAmbience(game.soundManager);

  let unsubscribe = [];
  const hooksFor = () => ({
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
    },

    onHide() {
      for (const off of unsubscribe) off();
      unsubscribe = [];
    },

    // The look is the scene's (`world.lighting`, `world.post`, and the
    // afternoon-to-dusk `world.cycle`), applied by the engine every frame;
    // T flips the cycle's target above. Nothing to render here.
  });

  return { yard: hooksFor(), lot: hooksFor() };
}
