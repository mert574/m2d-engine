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
 * jumps, T turns the afternoon to dusk and back, O opens settings, F3
 * shows the frame statistics.
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
const FLY_SPEED = 10;

/**
 * The player: a capsule driven along the ground relative to where the
 * camera looks. With the console's `noclip` on, it flies instead: Space
 * climbs, Shift descends, and walls are not there.
 */
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
    if (this.noclip) {
      const climb = (input.isDown('Space') ? 1 : 0) - (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 1 : 0);
      this.body.setVelocity({ x: dir.x * FLY_SPEED, y: climb * FLY_SPEED, z: dir.z * FLY_SPEED });
      return;
    }
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
/** 0 is afternoon, 1 is dusk; eased between on T. */
let dusk = 0;
let duskTarget = 0;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

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
    unsubscribe.push(game.input.on('keydown', (event) => {
      if (event.code === 'KeyT') { duskTarget = duskTarget ? 0 : 1; event.consume(); }
    }));

    const ui = game.sceneManager.getCurrentScene().ui;
    ui.add(new UIText({
      x: 20, y: 16, anchor: 'top-left', text: 'THE YARD', fontSize: '15px', letterSpacing: 2,
      color: 'rgba(255, 248, 236, 0.9)', outlineColor: 'rgba(0, 0, 0, 0.35)', outlineWidth: 2
    }));
    ui.add(new UIText({
      x: -20, y: -16, anchor: 'bottom-right', align: 'right',
      text: 'Drag orbits · Scroll zooms · WASD walks · Space jumps · T dusk · O settings · F3 stats · ` console (noclip)',
      fontSize: '13px', color: 'rgba(255, 248, 236, 0.75)', outlineColor: 'rgba(0, 0, 0, 0.3)', outlineWidth: 2
    }));
  },

  onHide() {
    for (const off of unsubscribe) off();
    unsubscribe = [];
  },

  onUpdate(deltaTime) {
    dusk = lerp(dusk, duskTarget, 1 - Math.exp(-deltaTime * 1.5));
  },

  onRender(frame) {
    // Late afternoon — a low, warm sun from the south-west under a cool sky
    // — easing into dusk: the sun at the horizon, deep orange and dim, the
    // sky violet, and the lamps carrying the yard. The environment re-bakes
    // as this moves, so the mirror sphere reflects the sky it stands under.
    const t = dusk;
    frame.sun = {
      direction: [0.55, lerp(-0.6, -0.06, t), 0.45],
      color: mix([1, 0.88, 0.7], [1, 0.4, 0.15], t),
      intensity: lerp(4.2, 0.5, t)
    };
    frame.ambient = {
      sky: mix([0.36, 0.46, 0.68], [0.1, 0.08, 0.22], t),
      ground: mix([0.22, 0.17, 0.12], [0.04, 0.03, 0.05], t),
      intensity: lerp(0.55, 0.3, t)
    };
    frame.fog = { color: mix([0.66, 0.74, 0.86], [0.3, 0.18, 0.3], t), density: lerp(0.006, 0.009, t) };
    frame.exposure = lerp(0.95, 1.4, t);
    frame.bloom = { threshold: 0, intensity: lerp(0.04, 0.09, t) };
    frame.shadow.distance = 70;
    // The post stack: a touch of focus on the hero, a little grain and
    // vignette, and the exposure adapting as dusk falls.
    const camera = game.camera;
    // A 35 mm lens at f/4 on the hero: the yard stays readable, the far wall softens.
    frame.post.dof = { focus: camera.distance, focalLength: 35, fStop: 4, maxBlur: 14 };
    frame.post.autoExposure = { enabled: true, key: lerp(0.2, 0.12, t), min: 0.5, max: 3, speed: 1.2 };
    frame.post.vignette = 0.3;
    frame.post.grain = 0.025;
    frame.post.grade = { saturation: lerp(1.05, 1.15, t), contrast: 1.03, temperature: lerp(0.05, -0.1, t), lut: null };
  }
});

new SettingsMenu(game);
game.start();
