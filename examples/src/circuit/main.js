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
 * What is still code here is the car's engine note and road roar, which
 * are synthesised rather than sampled (evSound.js), and the menu — a code
 * screen until it becomes a UI scene.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { starsAtDawn, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import { selectedCar } from './cars.js';
import { CarSelectScreen } from './carSelect.js';
import { evMotorLoop, roadNoiseLoop } from './evSound.js';
import { loadBest } from './replay.js';
import project from './m2d.project.json';
import * as definition from './game.js';

/** The five circuits, in the order the menu lists them: the scene files. */
const CIRCUITS = [
  { scene: 'circuit1', title: 'Sundown Ring' },
  { scene: 'circuit2', title: 'Riverside Run' },
  { scene: 'circuit3', title: 'Old Town Sprint' },
  { scene: 'circuit4', title: 'Harbour Lights' },
  { scene: 'circuit5', title: 'Nightfall Gauntlet' }
];

/** A lap time as minutes and hundredths; the menu shows each circuit's best. */
function lapTime(game, ticks) {
  const seconds = ticks * game.time.fixedTimestep;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

const game = await bootProject(document.getElementById('gameCanvas'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'circuit/',
  options: {
    // Synthesised, not sampled: an EV's note is pure tones that slide with
    // speed, and the road roar is noise shaped by it.
    sounds: { engine: evMotorLoop(), road: roadNoiseLoop() },
    music: { menu: { src: starsAtDawn, volume: 0.7 } }
  },
  setup(game) {
    registerMainMenu(game, {
      title: 'Night Circuit',
      subtitle: 'five circuits · drift, boost, replay',
      hint: 'Arrows drive · Space drifts · X nitro · Enter replays your best lap',
      backdrop: menuBackdrop,
      items: () => CIRCUITS.map((circuit, i) => {
        const best = loadBest(circuit.scene);
        return {
          text: `${i + 1} · ${circuit.title}${best ? `  —  ${lapTime(game, best.lapTicks)}` : ''}`,
          onSelect: () => game.sceneManager.switchTo(circuit.scene)
        };
      }).concat([
        {
          text: `Car · ${selectedCar().name}`,
          // Re-enter the menu so the line above shows the new car.
          onSelect: () => game.ui.push(new CarSelectScreen({ onPick: () => game.sceneManager.switchTo('mainMenu') }))
        },
        { text: 'Settings', onSelect: () => game.settings.open() }
      ]),
      onEnter: () => game.soundManager.playMusic('menu')
    });
    game.settings.addOption(audioOption(game));
  }
});

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.nightCircuit = { game };
