/**
 * Hollow Grove: a 3/4 ("oblique") walk through a grove at dusk, with a
 * small quest in it.
 *
 * What this example demonstrates:
 *
 * - the depth sort: entities draw by their feet, so the walker goes behind
 *   a tree when above it and in front when below it;
 * - prefab footprints: a tree's collider is its trunk, so its painted
 *   canopy can be walked behind;
 * - pseudo-z `elevation`: Space hops, the sprite lifts and the shadow at
 *   the feet shrinks while the collider never leaves the ground;
 * - eight-direction character sheets through `setDirectionalAnimation`,
 *   with frame rates declared in the scene JSON;
 * - a textured tile layer for the ground and free, open sprites for trees
 *   and people; only the wisps and the ground detail are drawn in code;
 * - the engine's `Abilities`, `Footsteps` and `ProximityPrompt`
 *   constraints, the `Npc` actor, the `Quest` stage machine, and the
 *   `UIDialogue`, `UIMinimap`, `UIAbilityBar` and `UIMeter` components;
 * - an `Attack` swung at the heading, so it reaches above and below;
 * - per-clip volumes in the `sounds` and `music` options, and camera zoom.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { enchantedFestival, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';
import * as hooks from './hooks.js';

const game = await bootProject(document.getElementById('screen'), {
  project,
  definition,
  hooks,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'oblique/',
  options: { music: { menu: { src: enchantedFestival, volume: 0.5 } } },
  setup(game) {
    registerMainMenu(game, {
      title: 'Hollow Grove',
      subtitle: 'a three-quarter view · a small quest',
      hint: 'Arrows move · Space hops · X swings · 1 2 3 abilities · E talks · Wheel zooms',
      backdrop: menuBackdrop,
      items: () => [
        { text: 'Enter the grove', onSelect: () => game.sceneManager.switchTo('grove') },
        { text: 'Settings', onSelect: () => game.settings.open() }
      ],
      onEnter: () => game.soundManager.playMusic('menu')
    });
    game.settings.addOption(audioOption(game));
  }
});
if (new URLSearchParams(location.search).has('debug')) window.hollowGrove = { game };
