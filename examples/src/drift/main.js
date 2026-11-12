/**
 * Salvage Run: a rotating top-down space flight.
 *
 * What this example demonstrates:
 *
 * - the camera's `followRotation`: the view turns with the ship so the nose
 *   is always up the screen, and `zoom` eases out with speed;
 * - `ThrustControl`: turn, thrust, reverse and a boost, driven from the
 *   tick's input snapshot;
 * - two star tile layers at different `parallax` depths under a rotating
 *   camera, and a nebula drawn in the background hook;
 * - projectiles through `Projectile` for the ship's and the drones' lasers;
 * - meteors that split through `game.createEntity` on death, drones on
 *   `Chase`, and a minimap of the whole field.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Ship, Bound, Sky } from './fieldActors.js';
import { register } from './game.js';
import { sceneHooks } from './hooks.js';
import { symmetricalTree, audioOption } from '../shared/audio.js';
import layout from './layout.json';

const canvas = document.getElementById('screen');
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 800,
  worldWidth: layout.world.width,
  worldHeight: layout.world.height,
  basePath: import.meta.env.BASE_URL + 'drift/',
  // The level's sounds and music are the scene's (assets.sounds, assets.music
  // in field.json); the menu is a code screen, so its track stays here.
  music: { menu: { src: symmetricalTree, volume: 0.6 } }
});

register(game);

registerMainMenu(game, {
  title: 'Salvage Run',
  subtitle: 'a rotating top-down view',
  hint: 'Arrows steer and thrust · X fires · C boosts · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Launch', onSelect: () => game.sceneManager.switchTo('field') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

game.sceneManager.addScene('field', {
  // The scene needs the runtime sheets before its actors are built, so they
  // are merged into the fetched config's sheet map through the scene object.
  fetch: async () => (await import('./scenes/field.json')).default,
  ...sceneHooks(game).field
});

new SettingsMenu(game).addOption(audioOption(game));
if (new URLSearchParams(location.search).has('debug')) window.salvageRun = { game };
game.start();
