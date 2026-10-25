import { M2D } from '../../core/m2d.js';
import { sameResolution } from '../../core/viewport.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
import { Showcase } from './showcase.js';
import moteSprite from './assets/mote.png';
import reedSprite from './assets/reed.png';
import lanternSprite from './assets/lantern.png';
import lighthouseSprite from './assets/lighthouse.png';
import rainSprite from './assets/rain.png';

const VIEW = { width: 1280, height: 720 };
const WORLD = { width: 2560, height: 1440 };

const canvas = document.getElementById('screen');
const game = new M2D(canvas, {
  initialScene: 'showcase',
  width: VIEW.width,
  height: VIEW.height,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height
});

/** @type {Showcase|null} */
let showcase = null;

game.sceneManager.addScene('showcase', {
  fetch: async () => ({
    version: 1,
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

// Load control.
game.keys.addKey('[', (pressed) => { if (pressed && showcase) showcase.stepLoad(-1); });
game.keys.addKey(']', (pressed) => { if (pressed && showcase) showcase.stepLoad(1); });

// Layer toggles.
['1', '2', '3', '4', '5', '6', '7'].forEach((key, index) => {
  game.keys.addKey(key, (pressed) => {
    if (pressed && showcase) showcase.toggleLayer(index + 1);
  });
});

// Camera pause and HUD visibility.
game.keys.addKey('p', (pressed) => { if (pressed && showcase) showcase.toggleCamera(); });
game.keys.addKey('h', (pressed) => { if (pressed && showcase) showcase.toggleHud(); });

// Fullscreen. The engine's resize lifecycle does the rest: the view keeps its
// aspect ratio, the camera keeps its coordinates, and the anchored HUD moves
// to the new screen edges.
game.keys.addKey('f', (pressed) => { if (pressed) game.toggleFullscreen(); });

// Resolution, the way a settings menu would set it. Only the world gets
// coarser — the same amount of world stays visible and the HUD stays sharp.
// The hotkey keeps no index of its own: it reads `game.resolution` back, so
// it stays in step with the settings overlay changing the same setting.
const RESOLUTIONS = ['native', { width: 1280, height: 720 }, { width: 854, height: 480 }, { width: 426, height: 240 }];
game.keys.addKey('v', (pressed) => {
  if (!pressed) return;
  const index = RESOLUTIONS.findIndex(r => sameResolution(r, game.resolution));
  game.setResolution(RESOLUTIONS[(index + 1) % RESOLUTIONS.length]);
});

// Aspect behaviour, so the difference is visible side by side.
game.keys.addKey('a', (pressed) => {
  if (!pressed) return;
  game.setAspectMode(game.aspectMode === 'letterbox' ? 'expand' : 'letterbox');
});

// Backend swap. The engine already honours `?renderer=`, so swapping is a
// reload with the other name — no second code path to keep in sync.
game.keys.addKey('b', (pressed) => {
  if (!pressed) return;
  const params = new URLSearchParams(location.search);
  const current = params.get('renderer') || 'webgl';
  params.set('renderer', current === 'webgl' ? 'canvas' : 'webgl');
  location.search = params.toString();
});

// Settings overlay (O), sharing the V hotkey's preset list so the two ways of
// changing the resolution cycle through the same choices.
new SettingsMenu(game, { resolutions: RESOLUTIONS });

game.start();
