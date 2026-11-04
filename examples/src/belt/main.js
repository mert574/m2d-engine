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
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIMeter } from 'm2d-engine/core/ui/meter.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Rogue, Thug, Lamp, Bound } from './rowActors.js';
import { Street, Foreground } from './streetScenery.js';
import {
  attackSound, damageSound, jumpSound, levelCompleteSound, gameOverSound, solvedSound,
  g2Remix, lastTransmission, audioOption
} from '../shared/audio.js';
import step1 from '../oblique/sounds/footstep-grass-1.wav';
import step2 from '../oblique/sounds/footstep-grass-2.wav';
import step3 from '../oblique/sounds/footstep-grass-3.wav';
import step4 from '../oblique/sounds/footstep-grass-4.wav';
import bricksUrl from './textures/bricks.jpg';
import plasterUrl from './textures/plaster.jpg';
import roadUrl from './textures/road.jpg';
import roofingUrl from './textures/roofing.jpg';
import facadeAUrl from './textures/facade-a.jpg';
import facadeBUrl from './textures/facade-b.jpg';
import facadeCUrl from './textures/facade-c.jpg';
import layout from './layout.json';

const canvas = document.getElementById('screen');
await initPhysics();

const WORLD = { width: layout.length, height: 400 };
const RATIO = 0.5;

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 720,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  basePath: import.meta.env.BASE_URL + 'belt/',
  sounds: {
    attack: attackSound, damage: damageSound, jump: jumpSound,
    levelComplete: levelCompleteSound, gameOver: gameOverSound, go: solvedSound,
    step1: { src: step1, volume: 0.4 }, step2: { src: step2, volume: 0.4 },
    step3: { src: step3, volume: 0.4 }, step4: { src: step4, volume: 0.4 }
  },
  music: { menu: { src: lastTransmission, volume: 0.7 }, game: { src: g2Remix, volume: 0.6 } }
});

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}
const textures = {
  bricks: loadImage(bricksUrl), plaster: loadImage(plasterUrl), road: loadImage(roadUrl), roofing: loadImage(roofingUrl),
  facadeA: loadImage(facadeAUrl), facadeB: loadImage(facadeBUrl), facadeC: loadImage(facadeCUrl)
};

game.registerActor('ObliquePlayer', Rogue);
game.registerActor('Ghost', Thug);
game.registerActor('Lamp', Lamp);
game.registerActor('Bound', Bound);
game.registerActor('Street', Street);
game.registerActor('Foreground', Foreground);
game.registerActor('Trigger', Trigger);

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

let unsubscribe = [];

game.sceneManager.addScene('row', {
  fetch: async () => (await import('./scenes/row.json')).default,

  onEnter() {
    const scene = game.sceneManager.getCurrentScene();
    game.soundManager.playMusic('game');
    // The scenery entities were built by the scene; hand them the textures.
    for (const e of game.entities) if (e instanceof Street) e.textures = textures;
    const proj = game.projection;
    const lane = layout.lane;
    // The street is drawn in the lower part of the view, the wall above it.
    // The gutter sits a little above the bottom edge; the wall fills the rest.
    const gutterY = proj.toScreen(0, lane.bottom).y;
    const viewH = game.camera.height;
    const cameraY = gutterY + 84 - viewH / 2;
    game.camera.followAxes = { x: true, y: false };
    game.camera.y = cameraY;
    game.camera.lerp = 0.12;
    game.camera.zoom = 1;
    const view = game.camera.width;
    const setLock = (right) => { game.camera.bounds = { left: 0, top: cameraY - 10, right, bottom: cameraY + 10 }; };
    setLock(layout.sections[0].lock + view / 2);

    // High noon: the lights pass only sweetens the lamps' glass.
    game.renderer.setAmbientLight('#f2ecdf');
    game.renderer.setPostEffects({
      bloom: { threshold: 0.85, strength: 0.2, blur: 18 },
      vignette: { strength: 0.18, start: 0.72 },
      grade: { shadows: '#3a3a52', highlights: '#fff2d8', amount: 0.22, saturation: 1.12, contrast: 1.04 }
    });

    const ui = scene.ui;
    const objective = ui.add(new UIText({ x: 20, y: 16, anchor: 'top-left', align: 'left', text: 'WALK THE ROW', fontSize: '15px', letterSpacing: 1, color: '#5a3416', outlineColor: 'rgba(255, 250, 240, 0.7)', outlineWidth: 2 }));
    ui.add(new UIMeter(() => {
      const health = game.player?.getConstraint('health');
      return health ? { current: health.currentHealth, max: health.maxHealth } : null;
    }, { x: 20, y: 44, color: k => (k > 0.35 ? '#e0905a' : '#ff5a4e') }));
    const goSign = ui.add(new UIText({ x: -40, y: 0, anchor: 'right', align: 'right', text: '', fontSize: '34px', fontWeight: '700', letterSpacing: 4, color: '#c84a1e' }));
    const notice = ui.add(new UIText({ x: 0, y: -120, anchor: 'center', align: 'center', text: '', fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#3a2a16', outlineColor: 'rgba(255, 250, 240, 0.8)', outlineWidth: 3 }));
    ui.add(new UIText({ x: -20, y: -16, anchor: 'bottom-right', align: 'right', text: 'Arrows move · Space jumps · X chains punches, the third launches · C sweeps the crowd · air X drop-kicks', fontSize: '13px', color: 'rgba(30, 26, 22, 0.75)' }));

    // Waves. Each section locks the camera at its `lock` and spawns its
    // thugs off the right edge; when they are down the lock lifts.
    let section = 0;
    let alive = 0;
    let goTime = 0;
    const spawnWave = (s) => {
      let count = 0;
      for (const [kind, n] of s.wave) {
        for (let i = 0; i < n; i++) {
          // Off the right edge of the locked view, but never past the
          // boundary wall: a thug born outside the map cannot walk back in.
          const x = Math.min(s.lock + view / 2 + 80 + i * 70, layout.length - 160 - (i % 4) * 60);
          const y = lane.top + 40 + ((i * 97 + count * 53) % (lane.bottom - lane.top - 80));
          const thug = game.createEntity('Ghost', x, y, 30, 30, scene.spriteSheets.get(kind), {}, { bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25 });
          thug.setAnimation('idle_left');
          thug.onDeath = () => { alive--; if (alive === 0) release(); };
          game.entities.add(thug);
          game.physics.add(thug.body);
          count++;
        }
      }
      alive = count;
      objective.text = `SECTION ${section + 1} / ${layout.sections.length} · ${count} THUGS`;
    };
    const release = () => {
      section++;
      game.soundManager.playSound('go');
      goTime = 2.5;
      const next = layout.sections[section];
      setLock(next ? next.lock + view / 2 : layout.length);
      objective.text = next ? 'GO →' : 'THE DOOR IS OPEN';
      if (next) armed = true;
    };
    let armed = true;
    spawnWave(layout.sections[0]);
    armed = false;

    const door = [...game.entities].find(e => e instanceof Trigger);
    if (door) {
      let done = false;
      door.onEnter = () => {
        if (done || section < layout.sections.length) { if (!done) notice.text = 'NOT YET · CLEAR THE ROW'; return; }
        done = true;
        notice.text = 'YOU MADE IT OUT';
        game.soundManager.playSound('levelComplete');
        game.time.after(3, () => game.sceneManager.switchTo('mainMenu'), { unscaled: true });
      };
    }

    const frame = {
      fixed() {
        const next = layout.sections[section];
        if (armed && next && game.player.position.x > next.lock - view / 4) { armed = false; spawnWave(next); }
      },
      update(deltaTime) {
        goTime = Math.max(0, goTime - deltaTime);
        goSign.text = goTime > 0 && Math.sin(goTime * 10) > 0 ? 'GO  →' : '';
        if (notice.text && notice.text !== 'YOU MADE IT OUT') game.time.after(2, () => { notice.text = ''; }, { unscaled: true });
      }
    };
    scene.frame = frame;

    unsubscribe.push(game.input.on('keydown', (event) => {
      if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
    }));
  },

  onFixedUpdate() { game.sceneManager.getCurrentScene()?.frame?.fixed(); },
  onUpdate(deltaTime) { game.sceneManager.getCurrentScene()?.frame?.update(deltaTime); },

  onDrawBackground() {
    // The Street entity paints the sky, the skyline and the road; this
    // only guarantees no clear colour shows at the edges.
    const area = game.camera.getVisibleArea();
    game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#5fa6e4' });
  },

  onExit() {
    for (const stop of unsubscribe) stop();
    unsubscribe = [];
    game.camera.bounds = null;
    game.camera.followAxes = { x: true, y: true };
    game.renderer.setAmbientLight(null);
    game.renderer.setPostEffects(null);
  }
});

new SettingsMenu(game).addOption(audioOption(game));
if (new URLSearchParams(location.search).has('debug')) window.ashRow = { game };
game.start();
