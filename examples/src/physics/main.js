/**
 * Physics playground: a machine in a workshop, and a hand to play with it.
 *
 * The page boots the project (m2d.project.json). The machine is scene
 * data the editor opens: the funnel, splitter and peg field as placed
 * parts, the room as scenery, the lamp's light and the film grade as the
 * scene's lighting and post, and the gravity the keys turn as a counter
 * the scene's rules move.
 *
 * It is the engine's pointer demo too: dragging a body steers it with the
 * engine's `Grabbable` constraint, which the ball and crate prefabs
 * attach, right-clicking removes one, and a click on bare room asks the
 * spout for another. Only the main menu is still a code screen, added
 * here until it becomes a UI scene.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'physics/',
  setup(game) {
    registerMainMenu(game, {
      title: 'Physics',
      subtitle: 'a playground',
      hint: 'Drag to grab · Right-click removes · Click or Space drops · ↑ ↓ gravity · O for settings',
      backdrop: menuBackdrop,
      items: () => [
        { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('workshop') },
        { text: 'Settings', onSelect: () => game.settings.open() }
      ]
    });
    game.settings.addOption(audioOption(game));
  }
});
