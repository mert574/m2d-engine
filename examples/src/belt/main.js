/**
 * Ash Row: a belt scroller.
 *
 * What this example demonstrates:
 *
 * - the `belt` projection: a side view with a depth lane, x along the
 *   street and y the depth compressed on screen, over flat physics;
 * - `elevation` as the jump, with the engine's ground shadow shrinking
 *   under a sprite in the air, and a heavier swing while airborne;
 * - the camera following one axis only (`followAxes`), locked to each
 *   section by its `bounds` until the wave is down, then released;
 * - a flat texture stretched into a projected tile layer (`stretch`);
 * - waves spawned from scene data through `game.createEntity`, and the
 *   depth sort putting whoever is lower on the street in front.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { lastTransmission, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';

const game = await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'belt/',
  options: { music: { menu: { src: lastTransmission, volume: 0.7 } } },
  setup(game) {
    registerMainMenu(game, {
      title: 'Ash Row',
      subtitle: 'a belt scroller',
      hint: 'Arrows move · Space jumps · X chains punches · C sweeps · air X drop-kicks',
      backdrop: menuBackdrop,
      items: () => [
        { text: 'Walk the row', onSelect: () => game.sceneManager.switchTo('row') },
        { text: 'Settings', onSelect: () => game.settings.open() }
      ],
      onEnter: () => game.soundManager.playMusic('menu')
    });
    game.settings.addOption(audioOption(game));
  }
});
if (new URLSearchParams(location.search).has('debug')) window.ashRow = { game };
