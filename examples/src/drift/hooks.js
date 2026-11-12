import { UIMeter } from 'm2d-engine/core/ui/meter.js';
import { UIMinimap } from 'm2d-engine/core/ui/minimap.js';
import { SpriteSheet } from 'm2d-engine/core/spriteSheet.js';
import { Meteor, Drone, Salvage, Gate } from './fieldActors.js';
import laserBlueUrl from './textures/effects/laser-blue.png';
import laserRedUrl from './textures/effects/laser-red.png';
import flameUrl from './textures/effects/flame.png';
import flameBoostUrl from './textures/effects/flame-boost.png';
import shieldUrl from './textures/effects/shield.png';
import damage1Url from './textures/ships/player-damage1.png';
import damage2Url from './textures/ships/player-damage2.png';
import damage3Url from './textures/ships/player-damage3.png';
import layout from './layout.json';

/**
 * Salvage Run's presentation hooks: the camera turning with the ship and
 * easing out with speed, the sprites the actors spawn at runtime, the
 * light, the HUD and minimap, and the salvage that opens the gate. Kept
 * out of the definition (`game.js`) so a headless game never loads them;
 * `main.js` and the editor's play mode both build them here. See
 * m2d.project.json.
 */
export function sceneHooks(game) {
  /**
   * Sprites the actors spawn at runtime (lasers, flames, damage overlays) are
   * not placed by the scene, so they are not in its JSON; they load here and
   * join the scene's sheet map on entry.
   */
  function loadSheet(url, w, h) {
    const image = new Image();
    image.src = url;
    const sheet = new SpriteSheet(image, w, h, game);
    sheet.define('default', 0, 0);
    return sheet;
  }
  const extraSheets = {
    laserBlue: loadSheet(laserBlueUrl, 9, 54), laserRed: loadSheet(laserRedUrl, 9, 54),
    flame: loadSheet(flameUrl, 14, 31), flameBoost: loadSheet(flameBoostUrl, 14, 32), shield: loadSheet(shieldUrl, 133, 108),
    playerDamage1: loadSheet(damage1Url, 112, 75), playerDamage2: loadSheet(damage2Url, 112, 75), playerDamage3: loadSheet(damage3Url, 112, 75)
  };

  let unsubscribe = [];

  return {
    field: {
      onEnter() {
        const scene = game.sceneManager.getCurrentScene();
        for (const [name, sheet] of Object.entries(extraSheets)) scene.spriteSheets.set(name, sheet);
        // The ship was built before the sheets were in; hand them over now.
        game.player.damageSheets = [1, 2, 3].map(n => extraSheets[`playerDamage${n}`]);
        game.player.flame = extraSheets.flame;
        game.player.flameBoost = extraSheets.flameBoost;
        game.player.shieldSprite = extraSheets.shield;
        // The camera's follow, bounds and rotation are the scene's
        // (world.camera in field.json); only the first frame's pose is
        // snapped here, so entering the field never swings the view.
        game.camera.zoom = 1;
        const start = game.player.renderAnchor;
        game.camera.x = start.x;
        game.camera.y = start.y;
        game.camera.rotation = game.player.body.angle - Math.PI / 2;

        const entities = [...game.entities];
        const pods = entities.filter(e => e instanceof Salvage);
        const gate = entities.find(e => e instanceof Gate);
        let taken = 0;

        // The HUD's static parts are the scene's (hud in field.json). The
        // boost meter computes its fill from the control constraint and the
        // minimap plots by class with live colours, so both stay here.
        const ui = scene.ui;
        const objective = scene.hud?.elements.get('objective') ?? { text: '' };
        ui.add(new UIMeter(() => { const c = game.player?.getConstraint('control'); return c ? (c.boosting ? 1 : 1 - c.boostWait / c.boostCooldown) : null; }, { x: 20, y: 76, width: 200, height: 6, color: k => (k >= 1 ? '#ffd66e' : '#6a7a9a'), label: 'BOOST · C' }));
        const minimap = ui.add(new UIMinimap(game, {
          size: 200, bounds: layout.world, background: 'rgba(8, 10, 22, 0.88)', borderColor: 'rgba(127, 212, 255, 0.45)',
          plot(entity) {
            if (entity instanceof Meteor) return { shape: 'dot', color: 'rgba(170, 150, 130, 0.5)', size: entity.sizeClass === 'big' ? 2 : 1.2 };
            if (entity instanceof Salvage) return { shape: 'dot', color: '#ffd66e', size: 2.5 };
            if (entity instanceof Drone) return { shape: 'dot', color: '#ff6a5a', size: 2.2 };
            if (entity instanceof Gate) return { shape: 'ring', color: entity.sealed ? '#9a70ff' : '#78dcff', size: 5 };
            return null;
          }
        }));
        minimap.target = gate ?? null;

        // The gate opening, its warning while sealed and the jump out are
        // world.rules in field.json; only the running count is code.
        const count = () => { objective.text = `SALVAGE · ${taken} / ${pods.length} · THE GATE IS SEALED`; };
        count();
        for (const pod of pods) {
          pod.onTaken = () => {
            taken++;
            if (taken < pods.length) count();
          };
        }

        unsubscribe.push(game.input.on('keydown', (event) => {
          if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
        }));
      },

      onUpdate() {
        // Pull the view out a little as the ship picks up speed.
        const player = game.player;
        if (!player) return;
        const v = player.velocity;
        const speed = Math.hypot(v.x, v.y);
        const wanted = 1 - Math.min(0.22, speed / 2600);
        game.camera.zoom += (wanted - game.camera.zoom) * 0.05;
      },

      onDrawBackground() {
        // Under the far star tile: the void's colour, so a rotated view never
        // shows the clear colour at its corners.
        const area = game.camera.getVisibleArea();
        game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#0a0914' });
      },

      onExit() {
        for (const stop of unsubscribe) stop();
        unsubscribe = [];
        game.camera.rotation = 0;
      }
    }
  };
}
