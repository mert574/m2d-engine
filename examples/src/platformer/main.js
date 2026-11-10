import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { register } from './game.js';
import { sceneHooks } from './hooks.js';
import {
  EmberPlayer, DuskPlatform, DuskMovingPlatform, GlowCoin, DuskBee, ValleyGate
} from './duskActors.js';

import {
  jumpSound, coinSound, gameOverSound, levelCompleteSound,
  attackSound, damageSound, starsAtDawn, perfectUnion, audioOption
} from '../shared/audio.js';

const canvas = document.getElementById('screen');
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
  // Where sprite URLs in scene JSON resolve. Vite's BASE_URL is '/' on the
  // dev server and '/m2d-engine/examples/' in the published build (set in
  // vite.config.js), so deriving the prefix from it keeps both in step with
  // however the site is actually served, instead of hardcoding each one.
  basePath: import.meta.env.BASE_URL + 'platformer/',
  sounds: {
    jump: jumpSound,
    coin: coinSound,
    gameOver: gameOverSound,
    levelComplete: levelCompleteSound,
    attack: attackSound,
    damage: damageSound
  },
  music: {
    menu: starsAtDawn,
    game: perfectUnion
  }
});

// Register actors. The scene JSON names the stock actors; what answers to
// those names here is the dusk cast from duskActors.js, which keeps every
// behaviour and replaces the tiled sprites with drawn terrain.
register(game);

// Constraints the scene may attach and tune by name. The higher bee is a
// faster, longer-sighted hunter than the lower one, set in level1.json
// rather than in a second actor or a second prefab.

// Register scenes
registerMainMenu(game, {
  title: 'Platformer',
  subtitle: 'a demonstration',
  hint: 'Arrows move · Space jumps · X attacks · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('level1') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  ...sceneHooks(game).level1
});

// Settings overlay (O), with the demos' shared Audio row added on.
new SettingsMenu(game).addOption(audioOption(game));

game.start();
