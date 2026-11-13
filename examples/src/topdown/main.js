/**
 * The Facility: a top-down walk through a dark facility, scanning.
 *
 * The page boots the project (m2d.project.json). The level is scene data
 * the editor opens: the floor, the lamps, the post pass torn by the
 * scanner's hurt (`world.postBind`), the HUD, music and rules. Only the
 * main menu is still a code screen, added here until it becomes a UI scene.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { lastTransmission, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'topdown/',
  options: { music: { menu: lastTransmission } },
  setup(game) {
    registerMainMenu(game, {
      title: 'Top-Down',
      subtitle: 'a demonstration',
      hint: 'Arrows move · X attacks · O for settings',
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
