import { UIMinimap } from 'm2d-engine/core/ui/minimap.js';
import { UIAbilityBar } from 'm2d-engine/core/ui/abilityBar.js';
import { Wall, Ember, Stair, Creature, Quartermaster } from './keepActors.js';
import { WORLD, keepScene } from './game.js';
import { SatchelBar, SatchelScreen, ShopScreen } from './satchelUI.js';
import cleaveIcon from './textures/icons/cleave.png';
import dashIcon from './textures/icons/dash.png';
import shieldIcon from './textures/icons/emberShield.png';

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}

/**
 * M2D options the keep's look depends on, which the editor applies when it
 * edits and plays the keep as the page does: pixel art stays crisp.
 */
export const OPTIONS = { textureFilter: 'nearest' };

/**
 * Cinder Keep's presentation hooks: the camera on the projected ground,
 * the torchlit grade, the HUD and minimap, the satchel and the
 * quartermaster's shop, and the keep's sounds. Kept out of the definition
 * (`game.js`) so a headless game and the match server never load them;
 * `main.js` lays them over `keepScene` and the editor's play mode builds
 * them here. See m2d.project.json.
 *
 * @param {import('m2d-engine/core/m2d.js').M2D} game
 * @param {object} [options]
 * @param {() => void} [options.leave] - Out of the keep, on Escape or after descending: back to the menu, unless the page has a match to leave
 */
export function sceneHooks(game, { leave = () => game.sceneManager.switchTo('mainMenu') } = {}) {
  const icons = { cleave: loadImage(cleaveIcon), dash: loadImage(dashIcon), emberShield: loadImage(shieldIcon) };

  let unsubscribe = [];
  /** The trader in the start room, while the keep is loaded. */
  let quartermaster = null;
  /** Presentation state for the HUD. */
  let hud = null;

  // The scene's simulation hooks (the purse, the embers, the stair) are
  // the definition's; the keep here carries them too, so a game built from
  // these hooks alone — the editor's play — plays the whole keep.
  const { fetch: _fetch, ...simulation } = keepScene(game, { loadScene: async () => null });

  return {
    keep: {
      ...simulation,
      onShow() {
        const scene = game.sceneManager.getCurrentScene();
        // The camera, light, post pass, music and the HUD's static parts are
        // the scene's (world and hud in keep.json); the first frame's pose is
        // snapped here so entering the keep never swings the view.
        game.camera.zoom = 1;
        const start = game.player.renderAnchor;
        game.camera.x = start.x;
        game.camera.y = start.y;

        const entities = [...game.entities];
        const stair = entities.find(e => e instanceof Stair);
        quartermaster = entities.find(e => e instanceof Quartermaster) ?? null;
        const local = game.players.local;

        const ui = scene.ui;
        const objective = scene.hud?.elements.get('objective') ?? { text: '' };
        const notice = scene.hud?.elements.get('notice') ?? { text: '' };
        // The minimap plots by class with live colours, and the ability bar
        // and satchel are the keep's own screens: they stay here.
        const minimap = ui.add(new UIMinimap(game, {
          size: 220, bounds: WORLD, background: 'rgba(14, 12, 18, 0.9)', borderColor: 'rgba(255, 200, 140, 0.45)',
          plot(entity) {
            if (entity instanceof Wall) return { shape: 'square', color: 'rgba(120, 110, 100, 0.9)', size: 2.4 };
            if (entity instanceof Ember) return { shape: 'dot', color: '#ff9a4a' };
            if (entity instanceof Creature) return { shape: 'dot', color: '#b0e0ff', size: 2 };
            if (entity instanceof Stair) return { shape: 'ring', color: entity.sealed ? '#9a70ff' : '#ffc878', size: 5 };
            if (entity.name === 'Player' && entity !== game.player && !entity.dead) return { shape: 'dot', color: '#ffe3b0', size: 3 };
            return null;
          }
        }));
        minimap.target = stair ?? null;
        ui.add(new UIAbilityBar(() => game.player?.getConstraint('abilities') ?? null, { icons, borderColor: 'rgba(255, 200, 140, 0.45)' }));
        ui.add(new SatchelBar(local));

        let noticeTimer = null;
        const say = (text) => {
          notice.text = text;
          noticeTimer?.cancel();
          noticeTimer = game.time.after(2.4, () => { notice.text = ''; }, { unscaled: true });
        };
        // Counted from what is in the world, so a client sees the same as the server.
        hud = { objective, stair, total: entities.filter(e => e instanceof Ember).length };

        // What the keep's rules (game.js) tell this player.
        let descending = false;
        unsubscribe.push(
          local.on('stair-open', () => say('THE STAIR OPENS')),
          local.on('stair-sealed', () => say('THE STAIR IS SEALED · GATHER THE EMBERS')),
          local.on('fallen', () => say('YOU FELL · BACK IN A MOMENT')),
          local.on('descended', () => {
            if (descending) return;
            descending = true;
            say('YOU DESCEND');
            game.soundManager.playSound('levelComplete');
            game.time.after(3, leave, { unscaled: true });
          })
        );

        unsubscribe.push(game.input.on('scroll', (event) => {
          const factor = Math.exp(-event.scroll.y * 0.0015);
          game.camera.zoom = Math.min(1.8, Math.max(0.6, game.camera.zoom * factor));
          event.consume();
        }));
        unsubscribe.push(game.input.on('keydown', (event) => {
          if (event.code === 'Escape') { leave(); event.consume(); }
          else if (event.code === 'KeyI' && !game.ui.capturesInput) { game.ui.push(new SatchelScreen(game, local)); event.consume(); }
        }));
      },

      onUpdate() {
        if (hud) {
          const left = [...game.entities].filter(e => e instanceof Ember).length;
          hud.objective.text = hud.stair?.sealed === false
            ? 'THE STAIR IS OPEN · DESCEND'
            : `GATHER THE EMBERS · ${hud.total - left} / ${hud.total}`;
        }
        // E by the quartermaster opens the shop. Which trader is meant follows
        // from where the knight stands, so this is a key, not an intent; what
        // is bought is.
        if (quartermaster?.playerNear && game.input.justPressed('KeyE') && !game.ui.capturesInput) {
          game.ui.push(new ShopScreen(game, game.players.local, quartermaster));
        }
      },

      onDrawBackground() {
        // The rock beyond the floor: a dark wash under everything so the view
        // never shows the clear colour at the edges of the keep.
        const area = game.camera.getVisibleArea();
        game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#0b0a10' });
      },

      onDraw() {
        if (game.renderer.supports('lights')) return;
        const area = game.camera.getVisibleArea();
        game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: 'rgba(20, 14, 30, 0.35)' });
      },

      onHide() {
        for (const stop of unsubscribe) stop();
        unsubscribe = [];
        quartermaster = null;
        hud = null;
        for (const name of ['satchel', 'shop', 'itemOptions']) game.ui.get(name)?.close();
      }
    }
  };
}
