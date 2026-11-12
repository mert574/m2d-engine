/**
 * Night Circuit: arcade time trials under the lights.
 *
 * What this example demonstrates, feature by feature:
 *
 * - the fixed simulation tick: the car, gates, traffic and timers all run
 *   in `fixedUpdate`, so a lap is a pure function of its inputs;
 * - input snapshots and `setSnapshotSource`: the replay drives the engine
 *   through the same seam the keyboard does;
 * - tick-exact timing (`game.time.steps`) as the lap clock;
 * - `CarControl`: arcade handling with grip, handbrake drifts and nitro;
 * - spot lights with shadow casting: headlights and street lamps, with
 *   barriers, barrels and trees throwing real shadows across the road;
 * - silhouette drop shadows, bloom, vignette and colour grading;
 * - PathFollow driving gates and traffic deterministically.
 *
 * Five circuits, each longer, narrower and busier than the last. The best
 * lap of each is stored as its input recording and can be replayed — or
 * raced against, as a ghost.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

import { registerMainMenu } from '../shared/mainMenu.js';
import {
  audioOption, coinSound, levelCompleteSound, solvedSound, attackSound, damageSound,
  spawnSound, removeSound, starsAtDawn, longingForRain
} from '../shared/audio.js';
import { CARS, selectedCar, CarSelectScreen } from './cars.js';
import tyreSquealSound from './sounds/tyre_squeal_loop.wav';
import { evMotorLoop, roadNoiseLoop } from './evSound.js';
import { MAPS, trackFor } from './maps.js';
import { WALL_THICKNESS } from './track.js';
import { TrackRenderer } from './trackRenderer.js';
import { Race } from './race.js';
import { CAR } from './actors.js';
import { menuBackdrop } from './menuBackdrop.js';
import { loadBest } from './replay.js';

import carRed from './textures/car_red_1.png';
import carBlue from './textures/car_blue_1.png';
import carGreen from './textures/car_green_1.png';
import carBlack from './textures/car_black_3.png';
import carYellow from './textures/car_yellow_3.png';
import coneUp from './textures/cone_straight.png';
import coneDown from './textures/cone_down.png';
import barrelBlue from './textures/barrel_blue.png';
import barrelBlueDown from './textures/barrel_blue_down.png';
import barrelRed from './textures/barrel_red.png';
import barrelRedDown from './textures/barrel_red_down.png';
import oilStain from './textures/oil.png';
import arrowYellow from './textures/arrow_yellow.png';
import barrierWhite from './textures/barrier_white.png';
import barrierRed from './textures/barrier_red.png';
import curbWhite from './textures/barrier_white_race.png';
import curbRed from './textures/barrier_red_race.png';
import tiresWhite from './textures/tires_white.png';
import tiresRed from './textures/tires_red.png';
import treeSmall from './textures/tree_small.png';
import treeLarge from './textures/tree_large.png';
import tribune from './textures/tribune_full.png';
import tentBlue from './textures/tent_blue.png';
import rock from './textures/rock1.png';
import lampHead from './textures/light_white.png';
import grass from './textures/land_grass.png';
import dirt from './textures/land_dirt.png';
import sand from './textures/land_sand.png';

const SOURCES = {
  car: carBlue, carRed, carBlue, carGreen, ghost: carBlack, traffic: carYellow,
  cone: coneUp, coneDown,
  barrel: barrelBlue, barrelDown: barrelBlueDown,
  barrelRed, barrelRedDown,
  oil: oilStain, arrow: arrowYellow,
  barrierWhite, barrierRed, curbWhite, curbRed,
  gate: curbRed,
  tiresWhite, tiresRed, treeSmall, treeLarge, tribune, tent: tentBlue,
  rock, lamp: lampHead, grass, dirt, sand
};

function loadImages(sources) {
  const entries = Object.entries(sources).map(([key, url]) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([key, image]);
      image.onerror = () => reject(new Error(`circuit: failed to load ${url}`));
      image.src = url;
    }));
  return Promise.all(entries).then(Object.fromEntries);
}

await initPhysics();
const images = await loadImages(SOURCES);

const canvas = document.getElementById('gameCanvas');
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280, height: 720,
  worldWidth: 12000, worldHeight: 9000,
  pointerLock: false,
  sounds: {
    checkpoint: coinSound, lap: levelCompleteSound, boost: solvedSound,
    count: attackSound, go: solvedSound, barrel: damageSound, hit: damageSound,
    spill: spawnSound, cone: spawnSound, drift: removeSound,
    engine: evMotorLoop(), road: roadNoiseLoop(), tyres: tyreSquealSound
  },
  music: { menu: starsAtDawn, game: longingForRain }
});

new SettingsMenu(game, { pauseWhenOpen: true }).addOption(audioOption(game));
if (DEBUG) window.nightCircuit = { game };

// === HUD ===

/** The nitro gauge: a bar that drains on ignition and refills on cooldown. */
class NitroGauge extends UIElement {
  constructor(options) {
    super({ ...options, width: 150, height: 10 });
    this.race = null;
  }

  draw() {
    const drive = this.race?.car?.drive;
    if (!drive) return;
    const ready = drive.nitroReady;
    const fill = drive.boostLeft > 0
      ? drive.boostLeft / drive.nitroDuration
      : 1 - drive.nitroWait / drive.nitroCooldown;
    this.paint.drawRect({
      x: this.x, y: this.y, width: this.width, height: this.height,
      fillStyle: 'rgba(16, 20, 34, 0.7)', cornerRadius: 3
    });
    this.paint.drawRect({
      x: this.x + 2, y: this.y + 2,
      width: Math.max(0, (this.width - 4) * fill), height: this.height - 4,
      fillStyle: ready ? '#39c2ff' : drive.boostLeft > 0 ? '#a7e0ff' : '#4a5a74',
      cornerRadius: 2
    });
  }
}

function formatTicks(game, ticks) {
  const seconds = ticks * game.time.fixedTimestep;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// === Scenes: one per circuit ===

let frameHooks = null;

for (const map of MAPS) {
  let race = null;
  let trackArt = null;
  let hud = null;
  let unsubscribe = [];

  game.sceneManager.addScene(map.name, {
    fetch: async () => ({
      version: 4, name: map.name, type: 'level', title: map.title,
      world: { gravity: { x: 0, y: 0 } },
      prefabs: {}, layers: []
    }),

    onEnter() {
      const track = trackFor(map);
      const scene = game.sceneManager.getCurrentScene();
      const marks = [];

      // The barriers are physics: a static box per wall piece. Every round
      // starts from a fresh world, so a replay runs in the same world its
      // lap was recorded in, and the race builds these into each one.
      const buildWalls = () => {
        for (const wall of track.walls) {
          game.physics.add(game.physics.createBox({
            x: wall.x, y: wall.y,
            width: wall.length, height: WALL_THICKNESS,
            angle: wall.angle, bodyType: 'static',
            friction: 0.05, restitution: 0.4
          }));
        }
      };

      game.soundManager.playMusic('game');
      game.renderer.setAmbientLight(map.ambient);
      // The map's look, plus a white flash that boosts set and that decays
      // per frame. setPostEffects replaces the whole set, so the grade is
      // re-sent with each flash level.
      let flash = 0;
      const applyEffects = () => game.renderer.setPostEffects({
        bloom: { threshold: 0.62, strength: map.grade.bloom, blur: 26 },
        vignette: { strength: map.grade.vignette, start: 0.55 },
        grade: {
          shadows: map.grade.shadows ?? '#394068', highlights: map.grade.highlights ?? '#fff0d2',
          amount: 0.3, saturation: map.grade.saturation ?? 1.3, contrast: 1.08
        },
        ...(map.theme?.weather ? { grain: { strength: 0.06 } } : {}),
        ...(flash > 0 ? { flash: { color: '#dff2ff', strength: flash * 0.35 } } : {})
      });
      applyEffects();

      // HUD first, so the announcer exists before the countdown speaks.
      const ui = scene.ui;
      ui.add(new UIText({
        x: 20, y: 16, anchor: 'top-left', align: 'left',
        text: map.title.toUpperCase(), fontSize: '18px', letterSpacing: 2, color: '#ffd34d'
      }));
      const lapText = ui.add(new UIText({
        x: 20, y: 42, anchor: 'top-left', align: 'left',
        text: '0:00.00', fontSize: '30px', fontWeight: '700', color: '#eef1f8'
      }));
      const bestText = ui.add(new UIText({
        x: 20, y: 78, anchor: 'top-left', align: 'left',
        text: '', fontSize: '14px', color: '#9fb0cc'
      }));
      const speedText = ui.add(new UIText({
        x: -20, y: 42, anchor: 'top-right', align: 'right',
        text: '0', fontSize: '30px', fontWeight: '700', color: '#eef1f8'
      }));
      ui.add(new UIText({
        x: -20, y: 16, anchor: 'top-right', align: 'right',
        text: 'KM/H', fontSize: '12px', letterSpacing: 2, color: '#9fb0cc'
      }));
      const gauge = ui.add(new NitroGauge({ x: -170, y: 78, anchor: 'top-right' }));
      ui.add(new UIText({
        x: -26, y: 76, anchor: 'top-right', align: 'right',
        text: 'X', fontSize: '12px', color: '#9fb0cc'
      }));
      const announce = ui.add(new UIText({
        x: 0, y: -130, anchor: 'center', align: 'center',
        text: '', fontSize: '34px', fontWeight: '700', letterSpacing: 3, color: '#ffd34d'
      }));
      const warn = ui.add(new UIText({
        x: 0, y: -80, anchor: 'center', align: 'center',
        text: '', fontSize: '22px', fontWeight: '700', color: '#ff5a4e'
      }));
      ui.add(new UIText({
        x: 0, y: -18, anchor: 'bottom', align: 'center',
        text: 'Arrows drive · Space handbrake · X nitro · R restart · Enter replay best · O settings',
        fontSize: '13px', color: '#8292ae'
      }));

      let fadeTimer = null;
      const say = (text, sticky = false) => {
        announce.text = text;
        fadeTimer?.cancel();
        fadeTimer = null;
        if (!sticky) {
          fadeTimer = game.time.after(2.2, () => { announce.text = ''; }, { unscaled: true });
        }
      };

      race = new Race(game, map, track, images, marks, say, {
        car: selectedCar(),
        carById: (id) => CARS.find((car) => car.id === id),
        buildWalls,
        // The boost shows itself: flash, streaks and the exhaust. No caption.
        onBoost: () => { flash = 1; }
      });
      if (DEBUG) Object.assign(window.nightCircuit, { race, track });
      trackArt = new TrackRenderer(game, track, map, images, marks);
      hud = { lapText, bestText, speedText, warn, gauge };
      gauge.race = race;

      // Camera: follow a point ahead of the car, so the road coming at you
      // is on screen rather than behind the bumper.
      const lookahead = {
        body: {
          get renderPosition() {
            const car = race.car;
            if (!car) return { x: 0, y: 0 };
            const pos = car.renderPosition;
            const velocity = car.body.velocity;
            const speed = Math.hypot(velocity.x, velocity.y) || 1;
            const reach = Math.min(240, speed * 0.42);
            return {
              x: pos.x + (velocity.x / speed) * reach,
              y: pos.y + (velocity.y / speed) * reach
            };
          }
        }
      };
      game.camera.bounds = {
        left: track.bounds.left, top: track.bounds.top,
        right: track.bounds.right, bottom: track.bounds.bottom
      };
      game.camera.lerp = 0.085;
      game.camera.follow(lookahead);

      unsubscribe.push(game.input.on('keydown', (event) => {
        if (event.code === 'KeyR') { race.newRound(); event.consume(); }
        else if (event.code === 'Enter') { race.startReplay(); event.consume(); }
        else if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
      }));

      race.newRound();
      const camStart = race.car.body.position;
      game.camera.x = camStart.x;
      game.camera.y = camStart.y;

      frameHooks = {
        update() {
          const car = race.car;
          if (!car) return;
          if (flash > 0) {
            flash = Math.max(0, flash - game.time.unscaledDelta * 3);
            applyEffects();
          }
          const ticks = race.lapTicks;
          hud.lapText.text = ticks === null ? '0:00.00' : formatTicks(game, ticks);
          hud.bestText.text =
            (race.best ? `best ${formatTicks(game, race.best.lapTicks)}` : 'no best yet') +
            (race.lastLapTicks ? ` · last ${formatTicks(game, race.lastLapTicks)}` : '') +
            (race.spills.length ? ` · oil on track: ${race.spills.length}` : '');
          hud.speedText.text = String(Math.round(car.drive.speed * 0.36));
          hud.warn.text = race.wrongWayFor > 0.7 ? 'WRONG WAY' : '';
        }
      };
    },

    onExit() {
      for (const stop of unsubscribe) stop();
      unsubscribe = [];
      race?.destroy();
      race = null;
      trackArt = null;
      frameHooks = null;
      game.renderer.setAmbientLight(null);
      game.renderer.setPostEffects(null);
      game.soundManager.stopMusic();
    },

    onFixedUpdate() {
      race?.fixedTick();
    },

    onUpdate() {
      frameHooks?.update();
    },

    onDrawBackground() {
      if (!trackArt) return;
      trackArt.focus = race?.car ?? null;
      trackArt.drawUnder();
      race?.ghost.draw();
    },

    onDraw() {
      trackArt?.drawOver();
    }
  });
}

// === Menu ===

registerMainMenu(game, {
  title: 'Night Circuit',
  subtitle: 'five circuits · drift, boost, replay',
  hint: 'Arrows drive · Space drifts · X nitro · Enter replays your best lap',
  backdrop: menuBackdrop,
  items: () => MAPS.map((map, i) => {
    const best = loadBest(map.name);
    return {
      text: `${i + 1} · ${map.title}${best ? `  —  ${formatTicks(game, best.lapTicks)}` : ''}`,
      onSelect: () => {
        game.options.seed = map.seed;
        game.sceneManager.switchTo(map.name);
      }
    };
  }).concat([
    {
      text: `Car · ${selectedCar().name}`,
      onSelect: () => game.ui.push(new CarSelectScreen({
        images,
        // Re-enter the menu so the line above shows the new car.
        onPick: () => game.sceneManager.switchTo('mainMenu')
      }))
    },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ]),
  onEnter: () => game.soundManager.playMusic('menu')
});

game.start();
