import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Showcase } from './showcase.js';
import moteSprite from './assets/mote.png';
import reedSprite from './assets/reed.png';
import lanternSprite from './assets/lantern.png';
import lighthouseSprite from './assets/lighthouse.png';
import rainSprite from './assets/rain.png';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { lastTransmission, g2Remix, audioOption } from '../shared/audio.js';

const VIEW = { width: 1280, height: 720 };
const WORLD = { width: 2560, height: 1440 };

const canvas = document.getElementById('screen');
// B swaps the backend by reloading with ?renderer=; skip the menu on that
// reload so the two backends can be compared without re-clicking Start.
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: new URLSearchParams(location.search).has('renderer') ? 'showcase' : 'mainMenu',
  width: VIEW.width,
  height: VIEW.height,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  music: { menu: lastTransmission, game: g2Remix }
});

/** @type {Showcase|null} */
let showcase = null;

registerMainMenu(game, {
  title: 'Showcase',
  subtitle: 'renderer comparison',
  hint: '[ and ] change load · 1-7 toggle layers · P pauses the camera · H hides the HUD',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start', onSelect: () => game.sceneManager.switchTo('showcase') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

game.sceneManager.addScene('showcase', {
  fetch: async () => ({
    version: 2,
    name: 'showcase',
    type: 'level',
    world: { width: WORLD.width, height: WORLD.height, gravity: { x: 0, y: 0 } },
    assets: {
      spritesheets: {
        mote: { url: moteSprite, frameWidth: 32, frameHeight: 32 },
        reed: { url: reedSprite, frameWidth: 32, frameHeight: 64 },
        lantern: { url: lanternSprite, frameWidth: 32, frameHeight: 32 },
        lighthouse: { url: lighthouseSprite, frameWidth: 64, frameHeight: 160 },
        rain: { url: rainSprite, frameWidth: 8, frameHeight: 32 }
      }
    },
    prefabs: {},
    layers: []
  }),

  onEnter() {
    game.soundManager.playMusic('game');
    const scene = game.sceneManager.getCurrentScene();
    showcase = new Showcase(game, { spriteSheets: scene.spriteSheets, bounds: WORLD });
    showcase.attachUI(scene.ui);
  },

  onExit() {
    showcase = null;
  },

  onUpdate(deltaTime) {
    if (showcase) showcase.update(deltaTime);
  },

  onDraw() {
    if (showcase) showcase.draw();
  }
});

// Keyboard shortcuts, by physical key code so the bracket and digit keys
// stay where they are drawn on the HUD whatever layout the player uses.
const SHORTCUTS = {
  BracketLeft: () => showcase.stepLoad(-1),
  BracketRight: () => showcase.stepLoad(1),
  KeyP: () => showcase.toggleCamera(),
  KeyH: () => showcase.toggleHud()
};
for (let i = 1; i <= 7; i++) SHORTCUTS[`Digit${i}`] = () => showcase.toggleLayer(i);

game.input.on('keydown', (event) => {
  if (showcase) SHORTCUTS[event.code]?.();
});

// Settings overlay (O): fullscreen, aspect mode, debug, backend swap, and
// these resolution presets (only the world gets coarser — the same amount of
// world stays visible and the HUD stays sharp).
const RESOLUTIONS = ['native', { width: 1280, height: 720 }, { width: 854, height: 480 }, { width: 426, height: 240 }];
new SettingsMenu(game, { resolutions: RESOLUTIONS }).addOption(audioOption(game));

game.start();
