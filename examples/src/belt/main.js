/**
 * Ash Row: a belt scroller.
 *
 * What this example demonstrates:
 *
 * - the `belt` projection: a side view with a depth lane, x along the
 *   street and y the depth compressed on screen, over flat physics;
 * - `elevation` as the jump, with the engine's ground shadow shrinking
 *   under a sprite in the air, and a heavier swing while airborne;
 * - the camera following one axis only (`followAxes`), locked to each
 *   section by its `bounds` until the wave is down, then released;
 * - a flat texture stretched into a projected tile layer (`stretch`);
 * - waves spawned from scene data through `game.createEntity`, and the
 *   depth sort putting whoever is lower on the street in front.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Rogue, Thug, Lamp, Bound } from './rowActors.js';
import { WORLD, register } from './game.js';
import { sceneHooks } from './hooks.js';
import {
  attackSound, damageSound, jumpSound, levelCompleteSound, gameOverSound, solvedSound,
  g2Remix, lastTransmission, audioOption
} from '../shared/audio.js';
import step1 from '../oblique/sounds/footstep-grass-1.wav';
import step2 from '../oblique/sounds/footstep-grass-2.wav';
import step3 from '../oblique/sounds/footstep-grass-3.wav';
import step4 from '../oblique/sounds/footstep-grass-4.wav';

const canvas = document.getElementById('screen');
await initPhysics();

const RATIO = 0.5;

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 720,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  basePath: import.meta.env.BASE_URL + 'belt/',
  sounds: {
    attack: attackSound, damage: damageSound, jump: jumpSound,
    levelComplete: levelCompleteSound, gameOver: gameOverSound, go: solvedSound,
    step1: { src: step1, volume: 0.4 }, step2: { src: step2, volume: 0.4 },
    step3: { src: step3, volume: 0.4 }, step4: { src: step4, volume: 0.4 }
  },
  music: { menu: { src: lastTransmission, volume: 0.7 }, game: { src: g2Remix, volume: 0.6 } }
});


// The cast and the asset manifest; see game.js.
register(game);

registerMainMenu(game, {
  title: 'Ash Row',
  subtitle: 'a belt scroller',
  hint: 'Arrows move · Space jumps · X chains punches · C sweeps · air X drop-kicks',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Walk the row', onSelect: () => game.sceneManager.switchTo('row') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

game.sceneManager.addScene('row', {
  fetch: async () => (await import('./scenes/row.json')).default,
  ...sceneHooks(game).row
});

new SettingsMenu(game).addOption(audioOption(game));
if (new URLSearchParams(location.search).has('debug')) window.ashRow = { game };
game.start();
