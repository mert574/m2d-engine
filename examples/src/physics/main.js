import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { WorkshopBackdrop } from './workshopBackdrop.js';
import { MachineRamp, AmberBall, WoodCrate } from './machineActors.js';
import { spawnSound, removeSound, audioOption } from '../shared/audio.js';
import { withIds } from '../shared/sceneIds.js';

// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(document.getElementById('screen'), {
  initialScene: 'mainMenu', width: 960, height: 720, worldWidth: 960, worldHeight: 720,
  sounds: { spawn: spawnSound, remove: removeSound }
});
// The machine's parts, drawn in code: brass pegs, girder rails, amber glass
// balls and wooden crates (see machineActors.js).
game.registerActor('Ball', AmberBall);
game.registerActor('Box', WoodCrate);
game.registerActor('Ramp', MachineRamp);
registerMainMenu(game, {
  title: 'Physics',
  subtitle: 'a playground',
  hint: 'Drag to grab · Right-click removes · Scroll for gravity · O for settings',
  backdrop: menuBackdrop,
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
    version: 2, name: 'physics', type: 'level', gameType: 'sideScroll',
    world: { width: 960, height: 720, gravity: { x: 0, y: 1000 } },
    assets: { spritesheets: {} },
    prefabs: {
      ball: {
        actor: 'Ball',
        physics: {
          bodyType: 'dynamic', shape: 'circle',
          restitution: 0.8, friction: 0.005, frictionAir: 0.001
        }
      },
      box: { actor: 'Box', physics: { bodyType: 'dynamic', restitution: 0.4 } },
      platform: { actor: 'Ramp', physics: { bodyType: 'static' } },
      peg: { actor: 'Ramp', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'playground', objects: withIds([
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
    ]) }]
  }),

  // The scene's own bodies exist by the time this runs, so this is where
  // they become grabbable; anything spawned later is wired up by spawn().
  onEnter() {
    // A fixed camera on a single-screen machine. Set per entry: camera
    // config is scene state and resets when a scene unloads.
    game.camera.x = 480;
    game.camera.y = 360;
    for (const entity of game.entities) makeGrabbable(entity);
    gravityLabel = game.sceneManager.getCurrentScene().ui.add(
      new UIText({ x: 16, y: 16, text: '', fontSize: '16px', color: '#cfe8ff' }));
    setGravity(gravityY);
    backdrop = new WorkshopBackdrop(game);
    backdrop.applyAtmosphere();
  },
  onExit() {
    backdrop?.clearAtmosphere();
    backdrop = null;
    pending.length = 0;
  },
  // Pointer play arrives per frame; the world changes here, on the tick.
  onFixedUpdate() {
    for (const action of pending.splice(0)) action();
    for (const entity of game.entities) {
      const target = entity.grabTarget;
      if (!target) continue;
      const body = entity.body;
      body.setVelocity({
        x: (target.x - body.position.x) * GRAB_STIFFNESS,
        y: (target.y - body.position.y) * GRAB_STIFFNESS
      });
    }
  },
  onUpdate(deltaTime) {
    backdrop?.update(deltaTime);
  },
  onDrawBackground() {
    backdrop?.drawBackground();
  },
  onDraw() {
    backdrop?.drawForeground();
  }
});

// The workshop the machine stands in, built per entry and torn down on exit
// so its ambient light and post pass never leak into the menu.
let backdrop = null;

// === Pointer play ===
//
// The playground doubles as the engine's pointer demo: grab a body and fling
// it, right-click (or long-press) to remove one, click empty space to
// drop a new one in, and scroll or pinch to change gravity. All of it goes
// through `game.input`; nothing here touches a DOM event.
//
// The handlers below never change the world themselves. They queue what the
// pointer asked for, and the next tick does it, so a drop or a fling lands
// on a tick like everything else the simulation does.

/** World changes the pointer asked for since the last tick. */
const pending = [];
const onNextTick = (action) => { pending.push(action); };

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
  game.soundManager.playSound('remove');
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
      // Where the body is steered toward each tick while it is held.
      const { grabOffset } = this.getConstraint('grab');
      this.grabTarget = { x: event.world.x + grabOffset.x, y: event.world.y + grabOffset.y };
    },
    onDragEnd() { this.grabTarget = null; },
    onRightClick() { onNextTick(() => { if (game.entities.has(this)) despawn(this); }); }
  }));
  return entity;
}

/** Drop a fresh ball or box into the scene at a world position. */
function spawn(x, y) {
  const scene = game.sceneManager.getCurrentScene();
  if (game.sceneManager.loading || !scene || scene.config.name !== 'physics') return;

  const isBox = game.rng.chance(0.5);
  const size = isBox ? 64 : 32;
  // Spawning goes straight to createEntity rather than through a prefab, so
  // the body spec has to be spelled out here to match the prefabs above.
  const entity = game.createEntity({
    type: isBox ? 'Box' : 'Ball', x, y, width: size, height: size,
    physics: isBox
      ? { restitution: 0.4 }
      : { shape: 'circle', restitution: 0.8, friction: 0.005, frictionAir: 0.001 }
  });
  game.entities.add(entity);
  game.physics.add(entity.body);
  makeGrabbable(entity);
  game.soundManager.playSound('spawn');
}

game.input.on('keydown', (event) => {
  if (event.code === 'Space') onNextTick(() => spawn(game.rng.range(120, 840), 40));
});

// Click empty space to spawn; existing bodies remain available to grab.
game.input.on('click', (event) => {
  if (event.inContent && !event.target) {
    const { x, y } = event.world;
    onNextTick(() => spawn(x, y));
  }
});

// Scroll and pinch both mean "change gravity" here. The engine hands over
// the raw numbers and takes no view on what they should do: pinch reports a
// scale factor, and scaling gravity by it is this game's reading of it.
game.input.on('scroll', (event) => {
  const dy = event.scroll.y;
  onNextTick(() => setGravity(gravityY - dy * GRAVITY_PER_SCROLL));
});
game.input.on('pinch', (event) => {
  const factor = event.scaleDelta;
  onNextTick(() => setGravity(gravityY * factor));
});

// Settings overlay (O), with the demos' shared Audio row added on.
new SettingsMenu(game).addOption(audioOption(game));

game.start();
