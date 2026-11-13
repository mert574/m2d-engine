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
 *
 * The page boots the project (m2d.project.json); the field, its HUD,
 * camera and rules are scene data. Only the main menu is still a code
 * screen, added here until it becomes a UI scene.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { symmetricalTree, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';

const game = await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'drift/',
  options: { music: { menu: { src: symmetricalTree, volume: 0.6 } } },
  setup(game) {
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
    game.settings.addOption(audioOption(game));
  }
});
if (new URLSearchParams(location.search).has('debug')) window.salvageRun = { game };
