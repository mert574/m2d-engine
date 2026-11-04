/**
 * Cinder Keep: an isometric dungeon.
 *
 * What this example demonstrates:
 *
 * - the isometric projection: `world.projection` in the scene JSON, so
 *   every position is drawn through it while physics, movement and the
 *   depth sort stay on the flat ground plane;
 * - a tile layer drawn as diamonds over only the carved cells, with
 *   nearest-neighbour sampling for pixel art drawn at twice its size;
 * - click-to-move through `PointerMove`, which reads the pointer's ground
 *   position from the input snapshot, and arrow keys along the screen's
 *   axes through `KeyboardControl`'s `inputSpace`;
 * - wall blocks as entities on tile footprints that fade when the knight
 *   is behind them and cast torchlight shadows from their projected
 *   diamonds;
 * - Flare's isometric hero and creatures with eight facings, the engine's
 *   `Attack` swung at the heading, and the minimap drawing the ground plane.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIMinimap } from 'm2d-engine/core/ui/minimap.js';
import { UIMeter } from 'm2d-engine/core/ui/meter.js';
import { UIAbilityBar } from 'm2d-engine/core/ui/abilityBar.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Wall, Torch, Ember, Stair, Creature, Knight } from './keepActors.js';
import {
  attackSound, damageSound, coinSound, levelCompleteSound, gameOverSound,
  spawnSound, solvedSound, lastTransmission, november, audioOption
} from '../shared/audio.js';
import step1 from '../oblique/sounds/footstep-grass-1.wav';
import step2 from '../oblique/sounds/footstep-grass-2.wav';
import step3 from '../oblique/sounds/footstep-grass-3.wav';
import step4 from '../oblique/sounds/footstep-grass-4.wav';
import cleaveIcon from './textures/icons/cleave.png';
import dashIcon from './textures/icons/dash.png';
import shieldIcon from './textures/icons/emberShield.png';

const canvas = document.getElementById('screen');
await initPhysics();

const WORLD = { width: 64 * 64, height: 48 * 64 };

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 800,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  // The tiles are pixel art drawn at twice their size.
  textureFilter: 'nearest',
  basePath: import.meta.env.BASE_URL + 'iso/',
  sounds: {
    attack: attackSound, damage: damageSound, coin: coinSound,
    levelComplete: levelCompleteSound, gameOver: gameOverSound,
    dash: spawnSound, shield: solvedSound,
    step1: { src: step1, volume: 0.5 }, step2: { src: step2, volume: 0.5 },
    step3: { src: step3, volume: 0.5 }, step4: { src: step4, volume: 0.5 }
  },
  music: { menu: { src: lastTransmission, volume: 0.7 }, game: { src: november, volume: 0.6 } }
});

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}
const icons = { cleave: loadImage(cleaveIcon), dash: loadImage(dashIcon), emberShield: loadImage(shieldIcon) };

game.registerActor('ObliquePlayer', Knight);
game.registerActor('Ghost', Creature);
game.registerActor('Wall', Wall);
game.registerActor('Torch', Torch);
game.registerActor('Coin', Ember);
game.registerActor('Trigger', Stair);

registerMainMenu(game, {
  title: 'Cinder Keep',
  subtitle: 'an isometric view',
  hint: 'Click to walk · Arrows move · X swings · 1 2 3 abilities · Wheel zooms · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Descend', onSelect: () => game.sceneManager.switchTo('keep') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

let unsubscribe = [];

game.sceneManager.addScene('keep', {
  fetch: async () => (await import('./scenes/keep.json')).default,

  onEnter() {
    const scene = game.sceneManager.getCurrentScene();
    game.soundManager.playMusic('game');

    // The camera moves on the render plane, so its bounds are the
    // projected extent of the ground.
    const bounds = game.projection.boundsOf(0, 0, WORLD.width, WORLD.height);
    game.camera.bounds = bounds;
    game.camera.lerp = 0.1;
    game.camera.zoom = 1;
    const start = game.player.renderAnchor;
    game.camera.x = start.x;
    game.camera.y = start.y;

    game.renderer.setAmbientLight('#575062');
    game.renderer.setPostEffects({
      bloom: { threshold: 0.65, strength: 0.4, blur: 22 },
      vignette: { strength: 0.5, start: 0.55 },
      grade: { shadows: '#1a1422', highlights: '#ffd9b0', amount: 0.3, saturation: 1.05, contrast: 1.06 }
    });

    const entities = [...game.entities];
    const embers = entities.filter(e => e instanceof Ember);
    const stair = entities.find(e => e instanceof Stair);
    let taken = 0;

    const ui = scene.ui;
    const objective = ui.add(new UIText({ x: 20, y: 16, anchor: 'top-left', align: 'left', text: '', fontSize: '15px', letterSpacing: 1, color: '#ffc890' }));
    ui.add(new UIMeter(() => {
      const health = game.player?.getConstraint('health');
      return health ? { current: health.currentHealth, max: health.maxHealth } : null;
    }, { x: 20, y: 44, color: k => (k > 0.35 ? '#e0905a' : '#ff5a4e') }));
    const notice = ui.add(new UIText({ x: 0, y: -120, anchor: 'center', align: 'center', text: '', fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#ffe9cc' }));
    ui.add(new UIText({
      x: -20, y: -16, anchor: 'bottom-right', align: 'right',
      text: 'Click to walk · Arrows move along the screen · X swings · 1 2 3 abilities · Wheel zooms',
      fontSize: '13px', color: 'rgba(240, 230, 220, 0.55)'
    }));
    const minimap = ui.add(new UIMinimap(game, {
      size: 220, bounds: WORLD, background: 'rgba(14, 12, 18, 0.9)', borderColor: 'rgba(255, 200, 140, 0.45)',
      plot(entity) {
        if (entity instanceof Wall) return { shape: 'square', color: 'rgba(120, 110, 100, 0.9)', size: 2.4 };
        if (entity instanceof Ember) return { shape: 'dot', color: '#ff9a4a' };
        if (entity instanceof Creature) return { shape: 'dot', color: '#b0e0ff', size: 2 };
        if (entity instanceof Stair) return { shape: 'ring', color: entity.sealed ? '#9a70ff' : '#ffc878', size: 5 };
        return null;
      }
    }));
    minimap.target = stair ?? null;
    ui.add(new UIAbilityBar(() => game.player?.getConstraint('abilities') ?? null, { icons, borderColor: 'rgba(255, 200, 140, 0.45)' }));

    let noticeTimer = null;
    const say = (text) => {
      notice.text = text;
      noticeTimer?.cancel();
      noticeTimer = game.time.after(2.4, () => { notice.text = ''; }, { unscaled: true });
    };
    const refresh = () => {
      objective.text = taken < embers.length
        ? `GATHER THE EMBERS · ${taken} / ${embers.length}`
        : 'THE STAIR IS OPEN · DESCEND';
    };
    refresh();
    for (const ember of embers) {
      ember.onTaken = () => {
        taken++;
        refresh();
        if (taken === embers.length && stair) { stair.sealed = false; say('THE STAIR OPENS'); }
      };
    }
    if (stair) {
      let done = false;
      stair.onEnter = () => {
        if (done) return;
        if (stair.sealed) { say('THE STAIR IS SEALED · GATHER THE EMBERS'); return; }
        done = true;
        say('YOU DESCEND');
        game.soundManager.playSound('levelComplete');
        game.time.after(3, () => game.sceneManager.switchTo('mainMenu'), { unscaled: true });
      };
    }

    unsubscribe.push(game.input.on('scroll', (event) => {
      const factor = Math.exp(-event.scroll.y * 0.0015);
      game.camera.zoom = Math.min(1.8, Math.max(0.6, game.camera.zoom * factor));
      event.consume();
    }));
    unsubscribe.push(game.input.on('keydown', (event) => {
      if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
    }));
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

  onExit() {
    for (const stop of unsubscribe) stop();
    unsubscribe = [];
    game.camera.bounds = null;
    game.renderer.setAmbientLight(null);
    game.renderer.setPostEffects(null);
  }
});

new SettingsMenu(game).addOption(audioOption(game));

if (new URLSearchParams(location.search).has('debug')) window.cinderKeep = { game };

game.start();
