/**
 * Beeline: the engine's auto-scroller.
 *
 * The page boots the project (m2d.project.json). The lane is scene data
 * the editor opens: a camera in `scroll` mode running down a meadow verge
 * at the window's pace, the sun going down over its length as a three-state
 * cycle, the painted planes as scenery actors taking their silhouettes
 * from the scene, and the bee's readout as a HUD component.
 *
 * A bee keeps up, chains pollen into combos, dashes past wasps that
 * telegraph and dart, tears out of orb webs, and delivers to the hive at
 * dusk on three wing hearts. The simulation never reads the camera — the
 * `ScrollFront` entity is the window it believes in (see
 * docs/contributing/determinism.md) — so the same lane runs headless on a
 * server (simulate.mjs). The main menu is a scene too
 * (`scenes/mainMenu.json`): its lines are flowers along the bee's way.
 */
import { bootProject } from 'm2d-engine';
import { audioOption } from 'm2d-kit/audio';
import project from './m2d.project.json';
import * as definition from './game.js';

const game = await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'scroller/',
  setup(game) {
    game.settings.addOption(audioOption(game));
  }
});

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.beeline = { game };
