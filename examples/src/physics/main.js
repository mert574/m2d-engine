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
 * spout for another. The main menu is a scene too
 * (`scenes/mainMenu.json`): its lines fall into place as blocks.
 */
import { bootProject } from 'm2d-engine';
import { audioOption } from 'm2d-kit/audio';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'physics/',
  setup(game) {
    game.settings.addOption(audioOption(game));
  }
});
