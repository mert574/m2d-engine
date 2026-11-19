import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Showcase } from './showcase.js';
import { HOUR_MODES, FRONT_MODES } from './weather.js';
import moteSprite from './assets/mote.png';
import reedSprite from './assets/reed.png';
import lanternSprite from './assets/lantern.png';
import lighthouseSprite from './assets/lighthouse.png';
import rainSprite from './assets/rain.png';
import gullSprite from './assets/gull.png';
import { HarbourNight } from './menuBackdrop.js';
import { audioOption } from 'm2d-kit/audio';
import { registerKitScenery, sceneryPrefab as scenery } from 'm2d-kit/scenery';
// IDMf001: InDepthMelodics (CC BY 3.0); see docs/examples/music-credits.md.
import lastTransmission from './music/kloquewurk-last-transmission.ogg';
import g2Remix from './music/gbsr-g2-cockboymattt-remix.ogg';

const VIEW = { width: 1280, height: 720 };
const WORLD = { width: 2560, height: 1440 };

const canvas = document.getElementById('screen');
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: VIEW.width,
  height: VIEW.height,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  music: { menu: lastTransmission, game: g2Remix }
});

/** @type {Showcase|null} */
let showcase = null;

// The harness has no project file, so its menu scene is written here.
game.registerBackdropLayer('harbourNight', () => new HarbourNight());
registerKitScenery(game);
game.sceneManager.addScene('mainMenu', {
  fetch: async () => ({
    version: 7, name: 'mainMenu', type: 'ui', title: 'Main Menu',
    transition: { enter: 'fade', exit: 'fade', duration: 0.3 },
    stagger: 0.07,
    music: { track: 'menu' },
    elements: [
      { type: 'backdrop', id: 'harbour', properties: { vignette: 0.62, layers: ['harbourNight'], wash: { side: 'left', strength: 0.8 } } },
      {
        type: 'text', id: 'title', x: 96, y: -120, anchor: 'left',
        effects: { enter: { motion: 'slide-right', duration: 0.45 } },
        properties: { text: 'Showcase', fontSize: '$font.size.display', fontWeight: '$font.weight.thin', letterSpacing: '$font.tracking.tight', color: '$color.text.primary' }
      },
      {
        type: 'text', id: 'subtitle', x: 98, y: -48, anchor: 'left',
        properties: { text: 'RENDERER SHOWCASE', fontSize: '$font.size.caption', fontWeight: '$font.weight.medium', letterSpacing: '$font.tracking.widest', color: '$color.text.accent' }
      },
      ...[['start', 'Start', { onClick: 'showcase' }, 20], ['settings', 'Settings', { action: 'settings' }, 64]].map(([id, text, does, y]) => ({
        // The label sits 13 in from the item's edge (its bar's margin), on the title's.
        type: 'menuItem', id, x: 83, y, anchor: 'left',
        effects: { enter: { motion: 'slide-right', duration: 0.35 }, select: 'none', exit: { motion: 'fade', duration: 0.2 } },
        properties: { text, ...does, variant: 'bar' }
      })),
      {
        type: 'text', id: 'hint', x: 98, y: -76, anchor: 'bottom-left',
        properties: {
          text: '[ and ] change load · 1-9 toggle layers · C holds the hour · W holds the weather · P pauses the camera · H hides the HUD',
          fontSize: '$font.size.caption', letterSpacing: '$font.tracking.wide', color: '$color.text.muted'
        }
      }
    ]
  })
});

game.sceneManager.addScene('showcase', {
  fetch: async () => ({
    version: 7,
    name: 'showcase',
    type: 'level',
    world: { width: WORLD.width, height: WORLD.height, gravity: { x: 0, y: 0 } },
    assets: {
      spritesheets: {
        mote: { url: moteSprite, frameWidth: 32, frameHeight: 32 },
        reed: { url: reedSprite, frameWidth: 32, frameHeight: 64 },
        lantern: { url: lanternSprite, frameWidth: 32, frameHeight: 32 },
        lighthouse: { url: lighthouseSprite, frameWidth: 64, frameHeight: 160 },
        rain: { url: rainSprite, frameWidth: 8, frameHeight: 32 },
        gull: { url: gullSprite, frameWidth: 48, frameHeight: 32 }
      }
    },
    // The kit's backdrop and weather, under and over the stress layers:
    // seeded, stateless and the same on every backend.
    prefabs: {
      sky: scenery('Sky', { top: '#0b1026', middle: '#243a63', bottom: '#5c6f8a', horizon: 0.58 }),
      stars: scenery('Scatter', { kind: 'stars', count: 220, seed: 7, color: '#dce8ff', size: 2.2, opacity: 0.9, parallax: 0.05, twinkle: 0.6, band: { top: 0, bottom: 0.55 } }),
      clouds: scenery('Scatter', { kind: 'clouds', count: 14, seed: 3, color: '#8fa6c8', size: 240, opacity: 0.18, parallax: 0.25, speed: 6, band: { top: 0.05, bottom: 0.5 } }),
      fireflies: scenery('ParticleField', { kind: 'fireflies', count: 90, radius: 2.4, color: '#ffd27a', opacity: 0.9, emissive: 1, speed: 12, follow: true, seed: 11 }),
      sparks: scenery('ParticleField', { kind: 'sparks', count: 70, radius: 1.8, color: '#ffb46a', opacity: 0.8, emissive: 1, speed: 46, follow: true, seed: 5 })
    },
    layers: [{
      name: 'atmosphere',
      objects: ['sky', 'stars', 'clouds', 'fireflies', 'sparks'].map((prefab) => ({
        id: prefab, prefab, x: WORLD.width / 2, y: WORLD.height / 2, width: 16, height: 16
      }))
    }]
  }),

  onEnter() {
    game.soundManager.playMusic('game');
    const scene = game.sceneManager.getCurrentScene();
    showcase = new Showcase(game, { spriteSheets: scene.spriteSheets, bounds: WORLD });
    showcase.weather.holdHour(game.cvars.get('g_hour'));
    showcase.weather.holdFront(game.cvars.get('g_weather'));
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

// The two cycles the harbour runs on — the hour and the front crossing it —
// can each be held, so a look can be studied rather than whatever moment
// the cycle happened to reach. Kept across reloads; the HUD says when
// either is held.
game.cvars.register('g_hour', {
  type: 'string', choices: HOUR_MODES, default: 'cycle', persist: true,
  description: 'The showcase\'s light: cycle through the hours, or hold one',
  onChange: (mode) => showcase?.weather.holdHour(mode)
});
game.cvars.register('g_weather', {
  type: 'string', choices: FRONT_MODES, default: 'cross', persist: true,
  description: 'The showcase\'s weather: a front crossing, or held calm or at its squall',
  onChange: (mode) => showcase?.weather.holdFront(mode)
});

/** Set a choice cvar to the choice after its current one, wrapping. */
function stepChoice(name) {
  const { choices } = game.cvars.describe(name);
  game.cvars.set(name, choices[(choices.indexOf(game.cvars.get(name)) + 1) % choices.length]);
}

// Keyboard shortcuts, by physical key code so the bracket and digit keys
// stay where they are drawn on the HUD whatever layout the player uses.
const SHORTCUTS = {
  BracketLeft: () => showcase.stepLoad(-1),
  BracketRight: () => showcase.stepLoad(1),
  KeyC: () => stepChoice('g_hour'),
  KeyW: () => stepChoice('g_weather'),
  KeyP: () => showcase.toggleCamera(),
  KeyH: () => showcase.toggleHud()
};
for (let i = 1; i <= 9; i++) SHORTCUTS[`Digit${i}`] = () => showcase.toggleLayer(i);

game.input.on('keydown', (event) => {
  if (showcase) SHORTCUTS[event.code]?.();
});

// Settings overlay (O): fullscreen, aspect mode, debug, and these
// resolution presets (only the world gets coarser — the same amount of
// world stays visible and the HUD stays sharp).
const RESOLUTIONS = ['native', { width: 1280, height: 720 }, { width: 854, height: 480 }, { width: 426, height: 240 }];
new SettingsMenu(game, { resolutions: RESOLUTIONS }).addOption(audioOption(game));

// `?debug` exposes the engine and the director for poking at from the
// console or a harness — stepping the weather, say, without waiting for it.
if (new URLSearchParams(location.search).has('debug')) {
  window.showcase = { game, director: () => showcase };
}

game.start();
