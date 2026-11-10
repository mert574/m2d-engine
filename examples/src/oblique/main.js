/**
 * Hollow Grove: a 3/4 ("oblique") walk through a grove at dusk, with a
 * small quest in it.
 *
 * What this example demonstrates:
 *
 * - the depth sort: entities draw by their feet, so the walker goes behind
 *   a tree when above it and in front when below it;
 * - prefab footprints: a tree's collider is its trunk, so its painted
 *   canopy can be walked behind;
 * - pseudo-z `elevation`: Space hops, the sprite lifts and the shadow at
 *   the feet shrinks while the collider never leaves the ground;
 * - eight-direction character sheets through `setDirectionalAnimation`,
 *   with frame rates declared in the scene JSON;
 * - a textured tile layer for the ground and free, open sprites for trees
 *   and people; only the wisps and the ground detail are drawn in code;
 * - the engine's `Abilities`, `Footsteps` and `ProximityPrompt`
 *   constraints, the `Npc` actor, the `Quest` stage machine, and the
 *   `UIDialogue`, `UIMinimap`, `UIAbilityBar` and `UIMeter` components;
 * - an `Attack` swung at the heading, so it reaches above and below;
 * - per-clip volumes in the `sounds` and `music` options, and camera zoom.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIDialogue } from 'm2d-engine/core/ui/dialogue.js';
import { UIMinimap } from 'm2d-engine/core/ui/minimap.js';
import { UIAbilityBar } from 'm2d-engine/core/ui/abilityBar.js';
import { UIMeter } from 'm2d-engine/core/ui/meter.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Tree, Decor, Bound, Pond, Wanderer, Wisp, Lantern, Clearing, GroundDetail } from './groveActors.js';
import { WORLD, register } from './game.js';
import { GroveQuest } from './quest.js';
import {
  attackSound, damageSound, coinSound, jumpSound, levelCompleteSound, gameOverSound,
  solvedSound, spawnSound, removeSound,
  woodlandFantasy, enchantedFestival, audioOption
} from '../shared/audio.js';
import step1 from './sounds/footstep-grass-1.wav';
import step2 from './sounds/footstep-grass-2.wav';
import step3 from './sounds/footstep-grass-3.wav';
import step4 from './sounds/footstep-grass-4.wav';
import flareIcon from './textures/icons/flare.png';
import blinkIcon from './textures/icons/blink.png';
import wardIcon from './textures/icons/ward.png';

const canvas = document.getElementById('screen');
await initPhysics();

const STEP_VOLUME = 0.7;

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 800,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  basePath: import.meta.env.BASE_URL + 'oblique/',
  sounds: {
    attack: attackSound,
    damage: damageSound,
    coin: coinSound,
    jump: jumpSound,
    levelComplete: levelCompleteSound,
    gameOver: gameOverSound,
    flare: solvedSound,
    blink: spawnSound,
    ward: removeSound,
    step1: { src: step1, volume: STEP_VOLUME },
    step2: { src: step2, volume: STEP_VOLUME },
    step3: { src: step3, volume: STEP_VOLUME },
    step4: { src: step4, volume: STEP_VOLUME }
  },
  // The tracks are mastered hot for a game that plays under speech, so
  // they come in at half the engine's music volume.
  music: {
    menu: { src: enchantedFestival, volume: 0.5 },
    game: { src: woodlandFantasy, volume: 0.5 }
  }
});

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}
const icons = { flare: loadImage(flareIcon), blink: loadImage(blinkIcon), ward: loadImage(wardIcon) };

// The scene JSON names the stock actors; the grove's cast answers.
register(game);

registerMainMenu(game, {
  title: 'Hollow Grove',
  subtitle: 'a three-quarter view · a small quest',
  hint: 'Arrows move · Space hops · X swings · 1 2 3 abilities · E talks · Wheel zooms',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Enter the grove', onSelect: () => game.sceneManager.switchTo('grove') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;

let unsubscribe = [];
/** The grove's per-tick rules, set up by onEnter. */
let rules = null;

game.sceneManager.addScene('grove', {
  fetch: async () => (await import('./scenes/grove.json')).default,

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
});

new SettingsMenu(game).addOption(audioOption(game));

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.hollowGrove = { game };

game.start();
