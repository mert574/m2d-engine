import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Meadow, ForeMeadow, progress } from './meadowScenery.js';
import { ScrollFront, Bee, Flower, Pollen, Thistle, Wasp, Web, Hive } from './meadowActors.js';
import { LENGTH, HEIGHT, SPEED, buildMeadow } from './meadow.js';
import {
  starsAtDawn, perfectUnion, audioOption,
  coinSound, damageSound, levelCompleteSound, jumpSound, removeSound, attackSound
} from '../shared/audio.js';

/**
 * Beeline: the engine's auto-scroller. The camera runs in `'scroll'` mode
 * down a meadow verge while the sun goes down over the length of the lane;
 * a bee keeps up, chains pollen into combos, dashes past wasps that
 * telegraph and dart, tears out of orb webs, and delivers to the hive at
 * dusk on three wing hearts. The simulation never reads the camera — the
 * `ScrollFront` entity is the window it believes in (see
 * docs/contributing/determinism.md).
 */

// Every silhouette in one folder, pre-tinted to the meadow's palette at
// asset time (the canvas backend has no per-draw tint).
const foliageUrls = import.meta.glob('./textures/foliage/*.png', { eager: true, query: '?url', import: 'default' });
const foliageUrl = (name) => foliageUrls[`./textures/foliage/${name}.png`];

const canvas = document.getElementById('screen');
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 960,
  height: 540,
  worldWidth: LENGTH,
  worldHeight: HEIGHT,
  sounds: {
    collect: { src: coinSound, volume: 0.45 },
    damage: damageSound,
    dash: { src: jumpSound, volume: 0.5 },
    web: { src: removeSound, volume: 0.5 },
    tear: { src: attackSound, volume: 0.6 },
    arrived: levelCompleteSound
  },
  music: { menu: { src: starsAtDawn, volume: 0.7 }, game: { src: perfectUnion, volume: 0.6 } }
});

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}
const sceneryTextures = Object.fromEntries(
  ['tree-a', 'tree-b', 'tree-c',
    'far-grass-a', 'far-grass-b', 'far-bush',
    'mid-grass-a', 'mid-grass-b', 'mid-flowers', 'mid-sprouts',
    'play-grass-a', 'play-grass-b', 'play-grass-c',
    'fore-grass-a', 'fore-grass-b', 'fore-bush'
  ].map(name => [name, loadImage(foliageUrl(name))])
);

game.registerActor('Meadow', Meadow);
game.registerActor('ForeMeadow', ForeMeadow);
game.registerActor('ScrollFront', ScrollFront);
game.registerActor('Bee', Bee);
game.registerActor('Flower', Flower);
game.registerActor('Pollen', Pollen);
game.registerActor('Thistle', Thistle);
game.registerActor('Wasp', Wasp);
game.registerActor('Web', Web);
game.registerActor('Hive', Hive);

registerMainMenu(game, {
  title: 'Beeline',
  subtitle: 'an auto-scroller into the dusk',
  hint: 'Arrows fly · Space dashes · chain pollen, read the wasps, tear the webs',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Fly the lane', onSelect: () => game.sceneManager.switchTo('lane') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

// The lane is deterministic: built once, shared by the scene and its HUD.
const meadow = buildMeadow();
const totalPollen = meadow.pollen.length;

/** Sensor prefabs never resolve collisions; they only report them. */
const sensor = { bodyType: 'static', isSensor: true };

/**
 * The post pass keeps the sky's time in three movements. Swapped only at
 * the boundaries: rebuilding the pipeline per frame would be waste.
 */
const LIGHT_PHASES = [
  {
    until: 0.38, ambient: '#fff8e8',
    post: {
      bloom: { threshold: 0.8, strength: 0.45, blur: 20 },
      vignette: { strength: 0.12, start: 0.66 },
      grade: { shadows: '#9a9a6e', highlights: '#fff6da', amount: 0.32, saturation: 1.08, contrast: 1.02 },
      grain: { strength: 0.03 }
    }
  },
  {
    until: 0.72, ambient: '#f3dcd8',
    post: {
      bloom: { threshold: 0.72, strength: 0.55, blur: 24 },
      vignette: { strength: 0.16, start: 0.62 },
      grade: { shadows: '#7a6a8a', highlights: '#ffdcae', amount: 0.4, saturation: 1.12, contrast: 1.04 },
      grain: { strength: 0.035 }
    }
  },
  {
    until: Infinity, ambient: '#d6c4ea',
    post: {
      bloom: { threshold: 0.6, strength: 0.7, blur: 26 },
      vignette: { strength: 0.2, start: 0.58 },
      grade: { shadows: '#4e4a7a', highlights: '#ffc994', amount: 0.45, saturation: 1.08, contrast: 1.05 },
      grain: { strength: 0.04 }
    }
  }
];

let hud = null;
let phase = -1;

/** The send-off, by how the run went. */
function rank(bee) {
  const pct = bee.pollen / totalPollen;
  if (pct >= 0.95 && bee.hearts === 3) return "QUEEN'S OWN — a perfect beeline";
  if (pct >= 0.8) return 'HEAD FORAGER';
  if (pct >= 0.55) return 'FORAGER';
  return 'WORKER — the lane will still be there tomorrow';
}

game.sceneManager.addScene('lane', {
  fetch: async () => ({
    version: 1, name: 'lane', type: 'level', gameType: 'autoScroller',
    world: { width: LENGTH, height: HEIGHT, gravity: { x: 0, y: 0 } },
    assets: { spritesheets: Object.fromEntries(
      ['flowerballs', 'seedheads', 'flowerspikes', 'cattails', 'bramble-a', 'bramble-b']
        .map(name => [name, { url: foliageUrl(name), frameWidth: 256, frameHeight: 256 }])
    ) },
    prefabs: {
      meadow: { actor: 'Meadow', physics: sensor },
      foreMeadow: { actor: 'ForeMeadow', physics: sensor },
      front: { actor: 'ScrollFront', physics: sensor },
      player: { actor: 'Bee', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, frictionAir: 0.12 } },
      flowerballs: { actor: 'Flower', spritesheet: 'flowerballs', physics: sensor },
      seedheads: { actor: 'Flower', spritesheet: 'seedheads', physics: sensor },
      flowerspikes: { actor: 'Flower', spritesheet: 'flowerspikes', physics: sensor },
      cattails: { actor: 'Flower', spritesheet: 'cattails', physics: sensor },
      pollen: { actor: 'Pollen', physics: sensor },
      'bramble-a': { actor: 'Thistle', spritesheet: 'bramble-a', physics: sensor },
      'bramble-b': { actor: 'Thistle', spritesheet: 'bramble-b', physics: sensor },
      wasp: { actor: 'Wasp', physics: sensor },
      web: { actor: 'Web', physics: sensor },
      hive: { actor: 'Hive', physics: sensor }
    },
    layers: [{ name: 'lane', objects: [
      { prefab: 'meadow', x: LENGTH / 2, y: HEIGHT / 2, width: 16, height: 16 },
      { prefab: 'foreMeadow', x: LENGTH / 2, y: HEIGHT / 2, width: 16, height: 16 },
      { prefab: 'front', x: 480, y: HEIGHT / 2, width: 16, height: 16 },
      ...meadow.flowers.map(f => ({
        prefab: f.sprite, x: f.x, y: HEIGHT - f.h / 2, width: f.w, height: f.h,
        properties: { sway: f.sway }
      })),
      ...meadow.thistles.map(b => ({
        prefab: b.sprite, x: b.x, y: b.y, width: b.size * 0.58, height: b.size * 0.58,
        properties: { sway: b.sway }
      })),
      ...meadow.webs.map(w => ({
        prefab: 'web', x: w.x, y: w.y, width: w.w, height: w.h,
        properties: { sway: w.sway }
      })),
      ...meadow.pollen.map(p => ({ prefab: 'pollen', x: p.x, y: p.y, width: 26, height: 26 })),
      ...meadow.wasps.map(w => ({
        prefab: 'wasp', x: w.x, y: w.y, width: 32, height: 20,
        properties: { amp: w.amp, rate: w.rate, drift: w.drift, phase: w.phase }
      })),
      { prefab: 'hive', x: meadow.hive.x, y: meadow.hive.y, width: 70, height: 110 },
      { prefab: 'player', x: 220, y: HEIGHT / 2, width: 32, height: 24 }
    ] }]
  }),

  onEnter() {
    const scene = game.sceneManager.getCurrentScene();
    game.soundManager.playMusic('game');

    // The scenery entities were built by the scene; hand them the textures.
    for (const e of game.entities) {
      if (e instanceof Meadow || e instanceof ForeMeadow) e.textures = sceneryTextures;
    }

    // The camera scrolls on its own; the ScrollFront mirrors it in the
    // simulation. Same start, same speed.
    game.camera.mode = 'scroll';
    game.camera.scrollVelocity = { x: SPEED, y: 0 };
    game.camera.bounds = { left: 0, top: 0, right: LENGTH, bottom: HEIGHT };
    game.camera.x = 480;
    game.camera.y = HEIGHT / 2;
    phase = -1;

    const ui = scene.ui;
    hud = {
      hearts: ui.add(new UIText({
        x: 20, y: 16, anchor: 'top-left', align: 'left', text: '',
        fontSize: '19px', letterSpacing: 4, color: '#e8536a',
        outlineColor: 'rgba(40, 10, 20, 0.5)', outlineWidth: 2
      })),
      pollen: ui.add(new UIText({
        x: -20, y: 16, anchor: 'top-right', align: 'right', text: '',
        fontSize: '15px', letterSpacing: 2, color: '#fff3c8',
        outlineColor: 'rgba(80, 40, 0, 0.6)', outlineWidth: 2
      })),
      score: ui.add(new UIText({
        x: -20, y: 40, anchor: 'top-right', align: 'right', text: '',
        fontSize: '15px', letterSpacing: 2, color: '#ffd98f',
        outlineColor: 'rgba(80, 40, 0, 0.6)', outlineWidth: 2
      })),
      notice: ui.add(new UIText({
        x: 0, y: -120, anchor: 'center', align: 'center', text: '',
        fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#fff3d6',
        outlineColor: 'rgba(70, 30, 0, 0.6)', outlineWidth: 3
      })),
      sub: ui.add(new UIText({
        x: 0, y: -84, anchor: 'center', align: 'center', text: '',
        fontSize: '16px', letterSpacing: 2, color: '#ffe2ae',
        outlineColor: 'rgba(70, 30, 0, 0.5)', outlineWidth: 2
      })),
      hint: ui.add(new UIText({
        x: -20, y: -16, anchor: 'bottom-right', align: 'right',
        text: 'Arrows fly · Space dashes — through danger, out of webs · wasps raise a mark before they strike',
        fontSize: '13px', color: 'rgba(255, 240, 220, 0.6)'
      }))
    };
    hud.notice.text = 'Reach the hive before dark';
    hud.sub.text = 'chain the pollen — the combo keeps the score climbing';
    game.time.after(3.6, () => {
      if (hud) { hud.notice.text = ''; hud.sub.text = ''; }
    });

    for (const e of game.entities) {
      if (e instanceof Hive) e.onReached = (bee) => {
        hud.notice.text = rank(bee);
        hud.sub.text = `${bee.pollen} of ${totalPollen} pollen · best chain ×${bee.bestCombo} · score ${bee.score}`;
        game.soundManager.playSound('arrived');
        game.time.after(5, () => game.sceneManager.switchTo('mainMenu'));
      };
    }
  },

  onUpdate() {
    const bee = game.player;
    if (hud && bee) {
      hud.hearts.text = '♥ '.repeat(Math.max(0, bee.hearts)).trim();
      hud.pollen.text = `POLLEN ${bee.pollen} / ${totalPollen}`;
      hud.score.text = `SCORE ${bee.score}${bee.combo > 1 ? `   ×${bee.combo}` : ''}`;
    }
    // The light keeps the run's time, in three movements.
    const t = progress(game.camera);
    const next = LIGHT_PHASES.findIndex(p => t < p.until);
    if (next !== phase) {
      phase = next;
      game.renderer.setAmbientLight(LIGHT_PHASES[phase].ambient);
      game.renderer.setPostEffects(LIGHT_PHASES[phase].post);
    }
  },

  onExit() {
    hud = null;
    game.renderer.setAmbientLight(null);
    game.renderer.setPostEffects(null);
  }
});

new SettingsMenu(game).addOption(audioOption(game));

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.beeline = { game };

game.start();
