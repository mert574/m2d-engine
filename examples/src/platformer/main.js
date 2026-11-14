/**
 * Ember Valley: a platformer in a valley at dusk.
 *
 * The page boots the project (m2d.project.json). The level is scene data
 * the editor opens: the valley painted behind and over it, its fireflies
 * and leaves, its light, HUD, music and rules. The main menu is a scene too
 * (`scenes/mainMenu.json`): a low row across the valley.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { audioOption } from '../shared/audio.js';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'platformer/',
  setup(game) {
    game.settings.addOption(audioOption(game));
  }
});
