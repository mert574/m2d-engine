import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import ballSprite from './assets/ball.png';
import boxSprite from './assets/box.png';
import platformSprite from './assets/platform.png';
import { registerMainMenu } from '../shared/mainMenu.js';

// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(document.getElementById('screen'), {
  initialScene: 'mainMenu', width: 960, height: 720, worldWidth: 960, worldHeight: 720
});
game.camera.x = 480;
game.camera.y = 360;
game.registerActor('Ball', Entity);
game.registerActor('Box', Entity);
game.registerActor('Ramp', Entity);
registerMainMenu(game, {
  title: 'Physics',
  subtitle: 'a playground',
  hint: 'Drag to grab · Right-click removes · Scroll for gravity · O for settings',
  backdrop: { gradient: { from: '#140b06', to: '#3a2312', angle: 120 }, motes: 50 },
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('physics') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ]
});

// A funnel into a splitter into a peg field: everything spawned at the top
// bounces through three stages before settling, so the scene stays
// interesting rather than piling up in one corner.
const ANGLE = Math.PI * 0.12;
const pegRow = (y, xs) => xs.map(x =>
  ({ prefab: 'peg', x, y, width: 32, height: 32, angle: Math.PI / 4 }));

game.sceneManager.addScene('physics', {
  fetch: async () => ({
    version: 1, name: 'physics', type: 'level', gameType: 'sideScroll',
    world: { width: 960, height: 720, gravity: { x: 0, y: 1000 } },
    assets: { spritesheets: {
      ball: { url: ballSprite, frameWidth: 32, frameHeight: 32 },
      box: { url: boxSprite, frameWidth: 32, frameHeight: 32 },
      platform: { url: platformSprite, frameWidth: 32, frameHeight: 32 }
    } },
    prefabs: {
      ball: {
        actor: 'Ball',
        spritesheet: 'ball',
        physics: {
          bodyType: 'dynamic', shape: 'circle',
          restitution: 0.8, friction: 0.005, frictionAir: 0.001
        }
      },
      box: { actor: 'Box', spritesheet: 'box', physics: { bodyType: 'dynamic', restitution: 0.4 } },
      platform: { actor: 'Ramp', spritesheet: 'platform', physics: { bodyType: 'static' } },
      peg: { actor: 'Ramp', spritesheet: 'platform', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'playground', objects: [
      // Bounds
      { prefab: 'platform', x: 480, y: 704, width: 960, height: 32 },
      { prefab: 'platform', x: 16, y: 360, width: 32, height: 720 },
      { prefab: 'platform', x: 944, y: 360, width: 32, height: 720 },
      // Funnel: two ramps sloping from the walls toward a centre gap.
      { prefab: 'platform', x: 192, y: 176, width: 288, height: 32, angle: ANGLE },
      { prefab: 'platform', x: 768, y: 176, width: 288, height: 32, angle: -ANGLE },
      // Splitter: an A-frame under the gap, deflecting the stream outward.
      { prefab: 'platform', x: 384, y: 368, width: 224, height: 32, angle: -ANGLE },
      { prefab: 'platform', x: 576, y: 368, width: 224, height: 32, angle: ANGLE },
      // Peg field: offset rows of diamonds for a plinko finish.
      ...pegRow(512, [160, 320, 480, 640, 800]),
      ...pegRow(608, [240, 400, 560, 720]),
      // Starters, dropped into the funnel.
      { prefab: 'ball', x: 300, y: 40, width: 32, height: 32 },
      { prefab: 'ball', x: 480, y: 80, width: 32, height: 32 },
      { prefab: 'ball', x: 660, y: 40, width: 32, height: 32 },
      { prefab: 'box', x: 400, y: 120, width: 64, height: 64 },
      { prefab: 'box', x: 560, y: 120, width: 64, height: 64 }
    ] }]
  }),

  // The scene's own bodies exist by the time this runs, so this is where
  // they become grabbable; anything spawned later is wired up by spawn().
  onEnter() {
    for (const entity of game.entities) makeGrabbable(entity);
    gravityLabel = game.sceneManager.getCurrentScene().ui.add(
      new UIText({ x: 16, y: 16, text: '', fontSize: '16px', color: '#cfe8ff' }));
    setGravity(gravityY);
  }
});

// === Pointer play ===
//
// The playground doubles as the engine's pointer demo: grab a body and fling
// it, right-click (or long-press) to remove one, click empty space to
// drop a new one in, and scroll or pinch to change gravity. All of it goes
// through `game.input`; nothing here touches a DOM event.

/**
 * How hard a grabbed body is pulled toward the pointer, in 1/s.
 *
 * Grabbing drives *velocity* rather than teleporting the body, which is the
 * choice `Interactive` deliberately leaves to the game. A dynamic body that
 * is placed each frame tunnels through whatever is in the way and arrives
 * with no momentum; one that is steered still collides on the trip and keeps
 * the speed it was flung with.
 */
const GRAB_STIFFNESS = 18;

/** Gravity limits and step, in px/s². */
const GRAVITY_MIN = 0;
const GRAVITY_MAX = 3000;
const GRAVITY_PER_SCROLL = 2;

let gravityY = 1000;
let gravityLabel = null;

function setGravity(value) {
  gravityY = Math.min(Math.max(value, GRAVITY_MIN), GRAVITY_MAX);
  game.physics.setGravity({ x: 0, y: gravityY });
  if (gravityLabel) gravityLabel.text = `gravity ${Math.round(gravityY)} px/s²`;
}

/** Remove an entity from the world, and from the input router with it. */
function despawn(entity) {
  game.entities.delete(entity);
  game.physics.remove(entity.body);
  entity.destroy();
}

/** Let the pointer grab, fling and remove a body. */
function makeGrabbable(entity) {
  if (entity.body.bodyType !== 'dynamic') return entity;
  entity.addConstraint('grab', new Interactive(entity, {
    draggable: true,
    cursor: 'grab',
    onDrag(event) {
      const { grabOffset } = this.getConstraint('grab');
      const body = this.body;
      body.setVelocity({
        x: (event.world.x + grabOffset.x - body.position.x) * GRAB_STIFFNESS,
        y: (event.world.y + grabOffset.y - body.position.y) * GRAB_STIFFNESS
      });
    },
    onRightClick() { despawn(this); }
  }));
  return entity;
}

/** Drop a fresh ball or box into the scene at a world position. */
function spawn(x, y) {
  const scene = game.sceneManager.getCurrentScene();
  if (game.sceneManager.loading || !scene || scene.config.name !== 'physics') return;

  const isBox = Math.random() > 0.5;
  const size = isBox ? 64 : 32;
  const sprite = scene.spriteSheets.get(isBox ? 'box' : 'ball');
  // Spawning goes straight to createEntity rather than through a prefab, so
  // the body spec has to be spelled out here to match the prefabs above.
  const entity = game.createEntity(isBox ? 'Box' : 'Ball', x, y,
    size, size, sprite, {}, isBox
      ? { restitution: 0.4 }
      : { shape: 'circle', restitution: 0.8, friction: 0.005, frictionAir: 0.001 });
  entity.setAnimation('default');
  game.entities.add(entity);
  game.physics.add(entity.body);
  makeGrabbable(entity);
}

game.input.on('keydown', (event) => {
  if (event.code === 'Space') spawn(120 + Math.random() * 720, 40);
});

// Click empty space to spawn; existing bodies remain available to grab.
game.input.on('click', (event) => {
  if (event.inContent && !event.target) {
    spawn(event.world.x, event.world.y);
  }
});

// Scroll and pinch both mean "change gravity" here. The engine hands over
// the raw numbers and takes no view on what they should do: pinch reports a
// scale factor, and scaling gravity by it is this game's reading of it.
game.input.on('scroll', (event) => setGravity(gravityY - event.scroll.y * GRAVITY_PER_SCROLL));
game.input.on('pinch', (event) => setGravity(gravityY * event.scaleDelta));

// Settings overlay (O): resolution, fullscreen, aspect mode, debug, backend.
new SettingsMenu(game);

game.start();
