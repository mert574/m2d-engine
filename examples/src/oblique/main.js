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
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { WORLD, register } from './game.js';
import { sceneHooks } from './hooks.js';
import {
  attackSound, damageSound, coinSound, jumpSound, levelCompleteSound, gameOverSound,
  solvedSound, spawnSound, removeSound,
  woodlandFantasy, enchantedFestival, audioOption
} from '../shared/audio.js';
import step1 from './sounds/footstep-grass-1.wav';
import step2 from './sounds/footstep-grass-2.wav';
import step3 from './sounds/footstep-grass-3.wav';
import step4 from './sounds/footstep-grass-4.wav';

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

game.sceneManager.addScene('grove', {
  fetch: async () => (await import('./scenes/grove.json')).default,
  ...sceneHooks(game).grove
});

new SettingsMenu(game).addOption(audioOption(game));

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.hollowGrove = { game };

game.start();
