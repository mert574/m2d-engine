import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Meadow, ForeMeadow } from './meadowScenery.js';
import { ScrollFront, Bee, Flower, Pollen, Bramble, Wasp, Hive } from './meadowActors.js';
import { LENGTH, HEIGHT, SPEED, buildMeadow } from './meadow.js';
import { starsAtDawn, perfectUnion, coinSound, damageSound, levelCompleteSound, audioOption } from '../shared/audio.js';

/**
 * Beeline: the engine's auto-scroller. The camera runs in `'scroll'` mode
 * down a meadow verge at golden hour; a bee keeps up, gathers pollen,
 * weaves past wasps and thistles, and delivers to the hive at the end of
 * the lane. The simulation never reads the camera — the `ScrollFront`
 * entity is the window it believes in (see
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
  sounds: { collect: { src: coinSound, volume: 0.5 }, damage: damageSound, arrived: levelCompleteSound },
  music: { menu: { src: starsAtDawn, volume: 0.7 }, game: { src: perfectUnion, volume: 0.6 } }
});

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}
const sceneryTextures = Object.fromEntries(
  ['far-grass-a', 'far-grass-b', 'far-bush',
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
game.registerActor('Bramble', Bramble);
game.registerActor('Wasp', Wasp);
game.registerActor('Hive', Hive);

registerMainMenu(game, {
  title: 'Beeline',
  subtitle: 'an auto-scroller down the verge',
  hint: 'Arrows fly · gather pollen, mind the wasps · O for settings',
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

let hud = null;

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
      'bramble-a': { actor: 'Bramble', spritesheet: 'bramble-a', physics: sensor },
      'bramble-b': { actor: 'Bramble', spritesheet: 'bramble-b', physics: sensor },
      wasp: { actor: 'Wasp', physics: sensor },
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
      ...meadow.brambles.map(b => ({
        prefab: b.sprite, x: b.x, y: b.y, width: b.size * 0.62, height: b.size * 0.62
      })),
      ...meadow.pollen.map(p => ({ prefab: 'pollen', x: p.x, y: p.y, width: 26, height: 26 })),
      ...meadow.wasps.map(w => ({
        prefab: 'wasp', x: w.x, y: w.y, width: 30, height: 18,
        properties: { amp: w.amp, rate: w.rate, drift: w.drift, phase: w.phase }
      })),
      { prefab: 'hive', x: meadow.hive.x, y: meadow.hive.y, width: 70, height: 110 },
      { prefab: 'player', x: 220, y: HEIGHT / 2, width: 30, height: 22 }
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

    // A late-morning warmth over everything, bloom for the pollen and sun.
    game.renderer.setAmbientLight('#fff8e8');
    game.renderer.setPostEffects({
      bloom: { threshold: 0.8, strength: 0.4, blur: 20 },
      vignette: { strength: 0.12, start: 0.66 },
      grade: { shadows: '#9a9a6e', highlights: '#fff6da', amount: 0.3, saturation: 1.06, contrast: 1.02 },
      grain: { strength: 0.03 }
    });

    const ui = scene.ui;
    hud = {
      pollen: ui.add(new UIText({
        x: 20, y: 16, anchor: 'top-left', align: 'left',
        text: `POLLEN 0 / ${totalPollen}`,
        fontSize: '15px', letterSpacing: 2, color: '#6b4a10',
        outlineColor: 'rgba(255, 250, 235, 0.75)', outlineWidth: 2
      })),
      notice: ui.add(new UIText({
        x: 0, y: -120, anchor: 'center', align: 'center', text: '',
        fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#5a3c0e',
        outlineColor: 'rgba(255, 250, 235, 0.8)', outlineWidth: 3
      })),
      hint: ui.add(new UIText({
        x: -20, y: -16, anchor: 'bottom-right', align: 'right',
        text: 'Arrows fly · pollen glows at the flower heads · wasps and thistles scatter what you carry',
        fontSize: '13px', color: 'rgba(80, 60, 20, 0.7)'
      }))
    };
    hud.notice.text = 'Follow the sun to the hive';
    game.time.after(3.2, () => { if (hud) hud.notice.text = ''; });

    for (const e of game.entities) {
      if (e instanceof Hive) e.onReached = (bee) => {
        const all = bee.pollen === totalPollen;
        hud.notice.text = all
          ? 'Every last grain — a perfect beeline'
          : `The hive is richer by ${bee.pollen} of ${totalPollen}`;
        game.soundManager.playSound('arrived');
        game.time.after(4, () => game.sceneManager.switchTo('mainMenu'));
      };
    }
  },

  onUpdate() {
    if (hud && game.player) hud.pollen.text = `POLLEN ${game.player.pollen} / ${totalPollen}`;
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
