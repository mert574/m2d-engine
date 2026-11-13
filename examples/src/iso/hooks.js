import { SatchelScreen, ShopScreen } from './satchelUI.js';

/**
 * Cinder Keep's presentation hooks: only the keep's own two screens, the
 * satchel (the `satchel` action, I) and the quartermaster's shop (`trade`,
 * E, beside him). They are full screens of the game's own making that a
 * key opens, which no scene data describes. Everything else that shows
 * the keep is its scene's (keep.json): the camera and its wheel zoom, the
 * light, the HUD (objective over the ember counters, health, minimap,
 * ability bar, satchel strip), and the notices and sounds the stair's
 * news brings, as notify rules. See m2d.project.json.
 */
export function sceneHooks(game) {
  let off = null;
  const pressed = (action, event) => game.actions.codes(action).includes(event.code) && !game.ui.capturesInput;

  return {
    keep: {
      onShow() {
        const local = game.players.local;
        const quartermaster = [...game.entities].find((entity) => entity.prefab === 'quartermaster');
        off = game.input.on('keydown', (event) => {
          if (pressed('satchel', event)) { game.ui.push(new SatchelScreen(game, local)); event.consume(); }
          // Which trader is meant follows from where the knight stands, so
          // this is a key, not an intent; what is bought is.
          else if (pressed('trade', event) && quartermaster?.playerNear) { game.ui.push(new ShopScreen(game, local, quartermaster)); event.consume(); }
        });
      },

      onHide() {
        off?.();
        off = null;
        for (const name of ['satchel', 'shop', 'itemOptions']) game.ui.get(name)?.close();
      }
    }
  };
}
