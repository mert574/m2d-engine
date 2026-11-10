import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { register } from './game.js';
import { FacilityBackdrop } from './facilityBackdrop.js';
import {
  FacilityWall, SpecterGhost, SentryTurret, DataCore, ExtractionPad, ScannerAgent
} from './facilityActors.js';
import {
  attackSound, damageSound, coinSound, levelCompleteSound, gameOverSound,
  lastTransmission, november, audioOption
} from '../shared/audio.js';

const canvas = document.getElementById('screen');
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 3840,
  worldHeight: 2880,
  // Where sprite URLs in scene JSON resolve. Vite's BASE_URL is '/' on the
  // dev server and '/m2d-engine/examples/' in the published build (set in
  // vite.config.js), so deriving the prefix from it keeps both in step with
  // however the site is actually served, instead of hardcoding each one.
  basePath: import.meta.env.BASE_URL + 'topdown/',
  sounds: {
    attack: attackSound,
    damage: damageSound,
    coin: coinSound,
    levelComplete: levelCompleteSound,
    gameOver: gameOverSound
  },
  music: {
    menu: lastTransmission,
    game: november
  }
});

// Register actors. The scene JSON names the stock actors; what answers to
// those names here is the facility cast from facilityActors.js, which keeps
// every behaviour and replaces the tiled sprites with drawn hardware.
register(game);

// Register scenes
registerMainMenu(game, {
  title: 'Top-Down',
  subtitle: 'a demonstration',
  hint: 'Arrows move · X attacks · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('level1') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

// The facility's dark, built per entry and torn down on exit so its ambient
// light and post pass never leak into the menu.
let backdrop = null;

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() {
    // Keep the camera inside the level: without bounds, following the player
    // (or an 'expand' aspect mode widening the view) reveals the void past
    // the map.
    game.camera.bounds = {
      left: 0, top: 0,
      right: game.options.worldWidth, bottom: game.options.worldHeight
    };
    game.soundManager.playMusic('game');
    backdrop = new FacilityBackdrop(game, game.sceneManager.getCurrentScene().spriteSheets.get('floor'));
    backdrop.applyAtmosphere();
  },
  onExit() {
    backdrop?.clearAtmosphere();
    backdrop = null;
  },
  onUpdate(deltaTime) {
    backdrop?.update(deltaTime);
  },
  onDrawBackground() {
    backdrop?.drawBackground();
  },
  onDraw() {
    backdrop?.drawForeground();
  }
});

// Settings overlay (O), with the demos' shared Audio row added on.
new SettingsMenu(game).addOption(audioOption(game));

game.start();
