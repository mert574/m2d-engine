/**
 * Ember Valley: a platformer in a valley at dusk.
 *
 * The page boots the project (m2d.project.json). The level is scene data
 * the editor opens: the valley painted behind and over it, its fireflies
 * and leaves, its light, HUD, music and rules. Only the main menu is still
 * a code screen, added here until it becomes a UI scene.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { starsAtDawn, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'platformer/',
  options: { music: { menu: starsAtDawn } },
  setup(game) {
    registerMainMenu(game, {
      title: 'Platformer',
      subtitle: 'a demonstration',
      hint: 'Arrows move · Space jumps · X attacks · O for settings',
      backdrop: menuBackdrop,
      items: () => [
        { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('level1') },
        { text: 'Settings', onSelect: () => game.settings.open() }
      ],
      onEnter: () => game.soundManager.playMusic('menu')
    });
    game.settings.addOption(audioOption(game));
  }
});
