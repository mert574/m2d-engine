import { M2D } from '../../core/m2d.js';
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
// B swaps the backend by reloading with ?renderer=; skip the menu on that
// reload so the two backends can be compared without re-clicking Start.
const game = new M2D(canvas, {
  initialScene: new URLSearchParams(location.search).has('renderer') ? 'showcase' : 'mainMenu',
  width: VIEW.width,
  height: VIEW.height,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height
});

/** @type {Showcase|null} */
let showcase = null;

game.sceneManager.addScene('mainMenu', {
  fetch: async () => ({
    version: 1, name: 'mainMenu', type: 'ui', title: 'Main Menu', assets: {},
    elements: [
      { type: 'rect', id: 'background', x: 0, y: 0, fill: true, color: '#05070f' },
      { type: 'text', id: 'title', anchor: 'center', x: 0, y: -250,
        properties: { text: 'Renderer Showcase', fontSize: '72px', align: 'center', color: '#cfe8ff' } },
      { type: 'button', id: 'startGame', anchor: 'center', x: 0, y: -60,
        properties: { text: 'Start', onClick: 'showcase', width: 220, height: 54, fontSize: '22px',
          backgroundColor: '#14304f', hoverColor: '#1f4a79', textColor: '#cfe8ff' } },
      { type: 'button', id: 'settings', anchor: 'center', x: 0, y: 6,
        properties: { text: 'Settings', action: 'settings', width: 220, height: 54, fontSize: '22px',
          backgroundColor: '#14304f', hoverColor: '#1f4a79', textColor: '#cfe8ff' } },
      { type: 'text', id: 'controlsLine1', anchor: 'center', x: 0, y: 70,
        properties: { text: '[ and ]: Decrease / increase load · 1-7: Toggle layers', fontSize: '20px', align: 'center', color: '#9fb6d0' } },
      { type: 'text', id: 'controlsLine2', anchor: 'center', x: 0, y: 100,
        properties: { text: 'P: Pause camera · H: Hide HUD · O: Settings', fontSize: '20px', align: 'center', color: '#9fb6d0' } }
    ]
  })
});

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

// Settings overlay (O): fullscreen, aspect mode, debug, backend swap, and
// these resolution presets (only the world gets coarser — the same amount of
// world stays visible and the HUD stays sharp).
const RESOLUTIONS = ['native', { width: 1280, height: 720 }, { width: 854, height: 480 }, { width: 426, height: 240 }];
new SettingsMenu(game, { resolutions: RESOLUTIONS });

game.start();
