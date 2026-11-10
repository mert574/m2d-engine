import { Npc } from 'm2d-engine/actors/npc.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIDialogue } from 'm2d-engine/core/ui/dialogue.js';
import { UIMinimap } from 'm2d-engine/core/ui/minimap.js';
import { UIAbilityBar } from 'm2d-engine/core/ui/abilityBar.js';
import { UIMeter } from 'm2d-engine/core/ui/meter.js';
import { Tree, Pond, Wisp, Lantern, Clearing, GroundDetail } from './groveActors.js';
import { WORLD } from './game.js';
import { GroveQuest } from './quest.js';
import flareIcon from './textures/icons/flare.png';
import blinkIcon from './textures/icons/blink.png';
import wardIcon from './textures/icons/ward.png';

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}

/**
 * Hollow Grove's presentation hooks: the camera and its zoom, the dusk
 * light and grade, the HUD, the quest and the talking, and the music.
 * Kept out of the definition (`game.js`) so a headless game never loads
 * them; `main.js` and the editor's play mode both build them here. See
 * m2d.project.json.
 */
export function sceneHooks(game) {
  const icons = { flare: loadImage(flareIcon), blink: loadImage(blinkIcon), ward: loadImage(wardIcon) };

  let unsubscribe = [];
  /** The grove's per-tick rules, set up by onEnter. */
  let rules = null;

  return {
    grove: {
      onEnter() {
        const scene = game.sceneManager.getCurrentScene();
        game.soundManager.playMusic('game');

        game.camera.bounds = { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height };
        game.camera.lerp = 0.08;
        game.camera.zoom = 1;

        // Dusk: a cool ambient, warm lanterns against it, and a soft grade.
        game.renderer.setAmbientLight('#5a6078');
        game.renderer.setPostEffects({
          bloom: { threshold: 0.7, strength: 0.35, blur: 20 },
          vignette: { strength: 0.4, start: 0.6 },
          grade: { shadows: '#1c2a3a', highlights: '#ffe2b8', amount: 0.25, saturation: 1.08, contrast: 1.04 }
        });

        const entities = [...game.entities];
        const ground = entities.find(e => e instanceof GroundDetail);
        if (ground) ground.ground = scene.spriteSheets.get('ground')?.image ?? null;
        const lanterns = entities.filter(e => e instanceof Lantern);
        const npcs = entities.filter(e => e instanceof Npc);
        const clearing = entities.find(e => e instanceof Clearing);

        // HUD, from the engine's components.
        const ui = scene.ui;
        const objective = ui.add(new UIText({ x: 20, y: 16, anchor: 'top-left', align: 'left', text: '', fontSize: '15px', letterSpacing: 1, color: '#ffd9a0' }));
        const counter = ui.add(new UIText({ x: 20, y: 40, anchor: 'top-left', align: 'left', text: '', fontSize: '13px', color: 'rgba(240, 236, 220, 0.75)' }));
        ui.add(new UIMeter(() => {
          const health = game.player?.getConstraint('health');
          return health ? { current: health.currentHealth, max: health.maxHealth } : null;
        }, { x: 20, y: 62, color: k => (k > 0.35 ? '#e0905a' : '#ff5a4e') }));
        const notice = ui.add(new UIText({ x: 0, y: -120, anchor: 'center', align: 'center', text: '', fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#eef5dc' }));
        ui.add(new UIText({
          x: -20, y: -16, anchor: 'bottom-right', align: 'right',
          text: 'Arrows move · Space hops · X swings · 1 2 3 abilities · E talks · Wheel zooms',
          fontSize: '13px', color: 'rgba(230, 236, 220, 0.55)'
        }));
        const dialogue = ui.add(new UIDialogue({ borderColor: 'rgba(255, 210, 140, 0.45)', nameColor: '#ffd27a', clock: () => game.time.elapsed }));
        const minimap = ui.add(new UIMinimap(game, {
          size: 220, bounds: WORLD, paths: ground ? [ground.segments] : [],
          borderColor: 'rgba(255, 210, 140, 0.45)',
          plot(entity) {
            if (entity instanceof Pond) return { shape: 'area', color: 'rgba(60, 110, 140, 0.9)' };
            if (entity instanceof Tree) return { shape: 'dot', color: 'rgba(90, 150, 70, 0.9)', size: 2.2 };
            if (entity instanceof Lantern) return { shape: 'dot', color: '#ffd27a' };
            if (entity instanceof Wisp) return { shape: 'dot', color: '#bfeaff', size: 2 };
            if (entity instanceof Npc) return { shape: 'square', color: entity.hasNews ? '#ffd27a' : '#e6dcb8', size: 3 };
            if (entity instanceof Clearing) return { shape: 'ring', color: entity.sealed ? '#b996ff' : '#dff5d0', size: 5 };
            return null;
          }
        }));
        ui.add(new UIAbilityBar(() => game.player?.getConstraint('abilities') ?? null, { icons, borderColor: 'rgba(255, 210, 140, 0.45)' }));

        let noticeTimer = null;
        const say = (text) => {
          notice.text = text;
          noticeTimer?.cancel();
          noticeTimer = game.time.after(2.4, () => { notice.text = ''; }, { unscaled: true });
        };

        const quest = new GroveQuest(game, { npcs, clearing, lanterns }, {
          onObjective(text, lanternText) {
            objective.text = text.toUpperCase();
            counter.text = lanternText;
          },
          onStage(stage) {
            minimap.target = quest.target;
            if (stage === 'openClearing') say('WARD LEARNED · THE SEAL FADES');
            if (stage === 'done') {
              say('THE CLEARING OPENS');
              game.soundManager.playSound('levelComplete');
              game.time.after(4, () => game.sceneManager.switchTo('mainMenu'), { unscaled: true });
            }
          }
        });
        minimap.target = quest.target;

        for (const lantern of lanterns) lantern.onTaken = () => quest.lanternTaken();
        if (clearing) {
          clearing.onEnter = () => {
            if (!quest.enterClearing() && quest.stage !== 'done') say('THE STONES ARE SEALED');
          };
        }
        game.player.getConstraint('abilities').onCast = (ability, ok) => {
          if (!ok && ability.locked) say('OSWIN KNOWS THE WARD');
        };

        // Talking: E starts a conversation with whoever is near, or advances
        // one. It freezes the player and moves the quest on, so it runs on the
        // tick, from the tick's input. The player thaws once the keys that
        // closed the conversation are up, or the Space that closed it would
        // also hop.
        const TALK_KEYS = ['KeyE', 'Enter', 'Space'];
        let thawing = false;
        const talk = () => {
          if (dialogue.open) { dialogue.advance(); return; }
          if (!dialogue.canOpen) return;
          const npc = npcs.find(n => n.playerNear);
          if (!npc) return;
          const { name, lines, done } = quest.talkTo(npc);
          game.player.frozen = true;
          dialogue.start(name, lines, () => { thawing = true; done(); });
        };
        rules = {
          fixed() {
            const input = game.input.snapshot;
            if (input.justPressed('KeyE') || (dialogue.open && (input.justPressed('Enter') || input.justPressed('Space')))) talk();
            if (thawing && game.player && !TALK_KEYS.some(code => input.isDown(code))) {
              thawing = false;
              game.player.frozen = false;
            }
          }
        };

        unsubscribe.push(game.input.on('scroll', (event) => {
          const factor = Math.exp(-event.scroll.y * 0.0015);
          game.camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, game.camera.zoom * factor));
          event.consume();
        }));
        unsubscribe.push(game.input.on('keydown', (event) => {
          if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
        }));
      },

      onFixedUpdate() { rules?.fixed(); },

      onDraw() {
        // Without a lighting pass there is no dusk, so lay one over the view:
        // a blue-black wash across the visible world, under the UI.
        if (game.renderer.supports('lights')) return;
        const area = game.camera.getVisibleArea();
        game.renderer.drawRect({
          x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top,
          fillStyle: 'rgba(14, 22, 44, 0.36)'
        });
      },

      onExit() {
        for (const stop of unsubscribe) stop();
        unsubscribe = [];
        rules = null;
        game.renderer.setAmbientLight(null);
        game.renderer.setPostEffects(null);
      }
    }
  };
}
