import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { Vec3 } from 'm2d-engine/core/math.js';

/**
 * The yard: the engine's first three-dimensional scene.
 *
 * A walled yard under an afternoon sun, with crates to shove, steel and
 * copper spheres to roll, barrels stacked, a colonnade casting a long
 * shadow, a glTF milk truck parked by the wall, and a hero to walk
 * through it. All but the truck is a primitive shape drawn from the scene
 * file's `mesh` blocks.
 *
 * Drag to orbit, scroll to zoom. WASD walks relative to the camera, Space
 * jumps, O opens settings, F3 shows the frame statistics.
 */

const canvas = document.getElementById('screen');
const unsupported = document.getElementById('unsupported');

if (!webgpuSupported()) {
  unsupported.textContent = 'This demo needs WebGPU: Chrome or Edge on a machine with a GPU.';
  unsupported.style.display = 'flex';
  throw new Error('WebGPU unavailable');
}

await Promise.all([initWebGPU(), initPhysics({ dimensions: 3 })]);

// Twice Earth's gravity in the scene file, as most games run: real falls
// read as slow motion on a screen. The hero's numbers are tuned to it.
const WALK_SPEED = 5.5;
const JUMP_SPEED = 7.5;

/** The player: a capsule driven along the ground relative to where the camera looks. */
class Hero extends Entity {
  name = 'Hero';

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const input = this.input;
    const camera = this.game.camera;
    const forward = camera.forward;
    const right = camera.right;
    const move = { x: 0, y: 0, z: 0 };
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) Object.assign(move, Vec3.add(move, forward));
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) Object.assign(move, Vec3.subtract(move, forward));
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) Object.assign(move, Vec3.add(move, right));
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) Object.assign(move, Vec3.subtract(move, right));
    const dir = Vec3.normalize(move);
    const v = this.body.velocity;
    const vy = (input.isDown('Space') && this.isOnGround()) ? JUMP_SPEED : v.y;
    this.body.setVelocity({ x: dir.x * WALK_SPEED, y: vy, z: dir.z * WALK_SPEED });
  }
}

class Ground extends Entity { name = 'Ground'; }
class Crate extends Entity { name = 'Crate'; }

const game = new M2D(canvas, {
  dimensions: 3,
  width: 1280,
  height: 720,
  worldWidth: 40,
  worldHeight: 40,
  initialScene: 'yard',
  basePath: import.meta.env.BASE_URL + 'yard/'
});

game.registerActor('Hero', Hero);
game.registerActor('Ground', Ground);
game.registerActor('Crate', Crate);

let unsubscribe = [];
let hud = null;

game.sceneManager.addScene('yard', {
  fetch: async () => (await import('./scenes/yard.json')).default,

  onEnter() {
    const scene = game.sceneManager.getCurrentScene();
    const hero = scene.entitiesById.get('hero');
    game.player = hero;
    Object.assign(game.camera, {
      mode: 'orbit', distance: 9, yaw: 0.6, pitch: 0.38, minDistance: 3, maxDistance: 30,
      targetOffset: { x: 0, y: 0.9, z: 0 }, fov: Math.PI / 3.4
    });
    game.camera.follow(hero);
  },

  onShow() {
    unsubscribe.push(game.input.on('drag', (event) => {
      game.camera.orbit(-event.delta.ui.x * 0.005, event.delta.ui.y * 0.004);
      event.consume();
    }));
    unsubscribe.push(game.input.on('scroll', (event) => {
      game.camera.zoom(Math.exp(event.scroll.y * 0.0012));
      event.consume();
    }));

    const ui = game.sceneManager.getCurrentScene().ui;
    ui.add(new UIText({
      x: 20, y: 16, anchor: 'top-left', text: 'THE YARD', fontSize: '15px', letterSpacing: 2,
      color: 'rgba(255, 248, 236, 0.9)', outlineColor: 'rgba(0, 0, 0, 0.35)', outlineWidth: 2
    }));
    ui.add(new UIText({
      x: -20, y: -16, anchor: 'bottom-right', align: 'right',
      text: 'Drag orbits · Scroll zooms · WASD walks · Space jumps · O settings · F3 stats',
      fontSize: '13px', color: 'rgba(255, 248, 236, 0.75)', outlineColor: 'rgba(0, 0, 0, 0.3)', outlineWidth: 2
    }));
    hud = ui.add(new UIText({
      x: 20, y: -16, anchor: 'bottom-left', text: '', fontSize: '13px',
      color: 'rgba(255, 248, 236, 0.75)', outlineColor: 'rgba(0, 0, 0, 0.3)', outlineWidth: 2
    }));
  },

  onHide() {
    for (const off of unsubscribe) off();
    unsubscribe = [];
    hud = null;
  },

  onUpdate() {
    if (!hud) return;
    const stats = game.renderer.getStats();
    hud.text = `${game.entities.size} bodies · ${stats.drawCalls} draw calls · ${game.renderer.getFPS()} fps`;
  },

  onRender(frame) {
    // Late afternoon: a low, warm sun from the south-west, a cool sky.
    frame.sun = { direction: [0.55, -0.6, 0.45], color: [1, 0.88, 0.7], intensity: 4.2 };
    frame.ambient = { sky: [0.36, 0.46, 0.68], ground: [0.22, 0.17, 0.12], intensity: 0.55 };
    frame.fog = { color: [0.66, 0.74, 0.86], density: 0.006 };
    frame.exposure = 0.95;
    frame.shadow.radius = 22;
  }
});

new SettingsMenu(game);
game.start();
