/**
 * Night Circuit: five night races, drift, boost and replay.
 *
 * The page boots the project (m2d.project.json). Each circuit is a scene
 * file the editor opens: the road as a closed smooth path carrying the
 * width of the asphalt, every cone, barrel, slick, pad, gate and
 * checkpoint placed on it, the night's light and grade as the scene's
 * lighting and post, and the boost's flash as a post binding on the race
 * director. The director runs the rounds and the replays; the road draws
 * the circuit from the same path the car measures against.
 *
 * The menus are scenes too: `mainMenu.json` is a starting grid with each
 * circuit's best lap under its slot, and `garage.json` the car chooser.
 * What is still code here is the car's engine note and road roar, which
 * are synthesised rather than sampled (evSound.js).
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { audioOption } from '../shared/audio.js';
import { evMotorLoop, roadNoiseLoop } from './evSound.js';
import project from './m2d.project.json';
import * as definition from './game.js';
import * as hooks from './hooks.js';

const game = await bootProject(document.getElementById('gameCanvas'), {
  project,
  definition,
  hooks,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'circuit/',
  options: {
    // Synthesised, not sampled: an EV's note is pure tones that slide with
    // speed, and the road roar is noise shaped by it.
    sounds: { engine: evMotorLoop(), road: roadNoiseLoop() }
  },
  setup(game) {
    game.settings.addOption(audioOption(game));
  }
});

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.nightCircuit = { game };
