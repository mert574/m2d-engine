import { UIText } from 'm2d-engine/core/ui/text.js';
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
        game.soundManager.playMusic('game');

        game.camera.bounds = { left: 0, top: 0, right: layout.world.width, bottom: layout.world.height };
        game.camera.lerp = 0.1;
        game.camera.followRotation = true;
        // Slow and capped: the field drifts round rather than whipping.
        game.camera.rotationLerp = 0.03;
        game.camera.rotationMaxRate = 1.1;
        game.camera.zoom = 1;
        const start = game.player.renderAnchor;
        game.camera.x = start.x;
        game.camera.y = start.y;
        game.camera.rotation = game.player.body.angle - Math.PI / 2;

        // Space is lit by nothing, so the sprites carry their own light: a near
        // white ambient, and the lights pass only for glow and bloom.
        game.renderer.setAmbientLight('#eceef6');
        game.renderer.setPostEffects({
          bloom: { threshold: 0.6, strength: 0.55, blur: 26 },
          vignette: { strength: 0.35, start: 0.65 },
          grade: { shadows: '#10142a', highlights: '#e8f0ff', amount: 0.25, saturation: 1.1, contrast: 1.05 }
        });

        const entities = [...game.entities];
        const pods = entities.filter(e => e instanceof Salvage);
        const gate = entities.find(e => e instanceof Gate);
        let taken = 0;

        const ui = scene.ui;
        const objective = ui.add(new UIText({ x: 20, y: 16, anchor: 'top-left', align: 'left', text: '', fontSize: '15px', letterSpacing: 1, color: '#ffd66e' }));
        ui.add(new UIMeter(() => { const h = game.player?.getConstraint('health'); return h ? { current: h.currentHealth, max: h.maxHealth } : null; }, { x: 20, y: 44, width: 200, color: k => (k > 0.35 ? '#7fd4ff' : '#ff6a5a'), label: 'HULL' }));
        ui.add(new UIMeter(() => { const c = game.player?.getConstraint('control'); return c ? (c.boosting ? 1 : 1 - c.boostWait / c.boostCooldown) : null; }, { x: 20, y: 76, width: 200, height: 6, color: k => (k >= 1 ? '#ffd66e' : '#6a7a9a'), label: 'BOOST · C' }));
        const notice = ui.add(new UIText({ x: 0, y: -120, anchor: 'center', align: 'center', text: '', fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#e8f0ff' }));
        ui.add(new UIText({ x: -20, y: -16, anchor: 'bottom-right', align: 'right', text: 'Arrows steer and thrust · Down brakes · X fires · C boosts · the view turns with you', fontSize: '13px', color: 'rgba(220, 228, 255, 0.55)' }));
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

        let noticeTimer = null;
        const say = (text) => {
          notice.text = text;
          noticeTimer?.cancel();
          noticeTimer = game.time.after(2.6, () => { notice.text = ''; }, { unscaled: true });
        };
        const refresh = () => {
          objective.text = taken < pods.length ? `SALVAGE · ${taken} / ${pods.length} · THE GATE IS SEALED` : 'THE GATE IS OPEN · FLY THROUGH';
        };
        refresh();
        for (const pod of pods) {
          pod.onTaken = () => {
            taken++;
            refresh();
            if (taken === pods.length && gate) { gate.sealed = false; game.soundManager.playSound('gate'); say('THE GATE OPENS'); }
          };
        }
        if (gate) {
          let done = false;
          gate.onEnter = () => {
            if (done) return;
            if (gate.sealed) { say('SEALED · BRING THE SALVAGE'); return; }
            done = true;
            say('JUMP');
            game.time.after(2.5, () => game.sceneManager.switchTo('mainMenu'), { unscaled: true });
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
        game.renderer.setAmbientLight(null);
        game.renderer.setPostEffects(null);
      }
    }
  };
}
