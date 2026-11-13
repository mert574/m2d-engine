/**
 * Hedgerow Court: a hedge-maze garden in three courts, and the engine's
 * single-screen perspective.
 *
 * The page boots the project (m2d.project.json). Each garden is a scene
 * file the editor opens: the hedges, the fountain and the flower beds as
 * placed things, the lawn and the sky as scenery, the morning light and
 * the warm grade as the scene's lighting and post, and the titles,
 * tending and the walk to the next court as rules.
 *
 * Each court is exactly one screen; the camera's `rooms` mode holds it
 * there and glides to the next court as the gardener walks through a
 * gate. Movement is the engine's `GlideControl`: one press and the
 * gardener keeps walking, with buffered, forgiving turns. Only the main
 * menu is still a code screen, added here until it becomes a UI scene.
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
  basePath: import.meta.env.BASE_URL + 'maze/',
  options: { music: { menu: symmetricalTree } },
  setup(game) {
    registerMainMenu(game, {
      title: 'Hedgerow Court',
      subtitle: 'a garden in three courts',
      hint: 'Press an arrow to set off, the same one to stop · tend the beds · O for settings',
      backdrop: menuBackdrop,
      items: () => [
        { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('court1') },
        { text: 'Settings', onSelect: () => game.settings.open() }
      ],
      onEnter: () => game.soundManager.playMusic('menu')
    });
    game.settings.addOption(audioOption(game));
  }
});

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.hedgerowCourt = { game };
