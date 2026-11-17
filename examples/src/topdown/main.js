/**
 * The Facility: a top-down walk through a dark facility, scanning.
 *
 * The page boots the project (m2d.project.json). The level is scene data
 * the editor opens: the floor, the lamps, the post pass torn by the
 * scanner's hurt (`world.postBind`), the HUD, music and rules. The main menu
 * is a scene too (`scenes/mainMenu.json`): a terminal.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { audioOption } from 'm2d-kit/audio';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'topdown/',
  setup(game) {
    game.settings.addOption(audioOption(game));
  }
});
