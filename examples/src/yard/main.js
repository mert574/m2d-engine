import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { audioOption } from '../shared/audio.js';
import { loadAmbience, Footsteps } from './ambience.js';
import { register } from './game.js';

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
 *
 * `?scene=lot` opens the lot instead: the yard at the centre of a grid of
 * lots laid out as a tech demo by `scripts/buildLotScene.mjs` — a
 * lighting lab, an orchard, a rock garden, a depot, a material gallery
 * along a boulevard, a lamp-lined avenue, and districts of forest,
 * orchards, industry and meadow beyond, thousands of props drawn as
 * resident instances the GPU culls. F3 shows what the frame draws.
 */

const canvas = document.getElementById('screen');
const unsupported = document.getElementById('unsupported');

if (!webgpuSupported()) {
  unsupported.textContent = 'This demo needs WebGPU: Chrome or Edge on a machine with a GPU.';
  unsupported.style.display = 'flex';
  throw new Error('WebGPU unavailable');
}

await Promise.all([initWebGPU(), initPhysics({ dimensions: 3 })]);



/** Which scene to open: the yard, or the lot around it (`?scene=lot`). */
const SCENE = new URLSearchParams(location.search).get('scene') === 'lot' ? 'lot' : 'yard';

const game = new M2D(canvas, {
  dimensions: 3,
  width: 1280,
  height: 720,
  worldWidth: 40,
  worldHeight: 40,
  initialScene: SCENE,
  basePath: import.meta.env.BASE_URL + 'yard/'
});

register(game);

let unsubscribe = [];
/** 0 is afternoon, 1 is dusk; eased between on T. */
let dusk = 0;
let duskTarget = 0;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

const yardScene = {
  fetch: async () => (await import('./scenes/yard.json')).default,

  // The loading plate, while the scene's models arrive.
  onLoadProgress({ loaded, total, name }) {
    const plate = document.getElementById('loading');
    plate.querySelector('.bar span').style.width = `${total ? (loaded / total) * 100 : 0}%`;
    plate.querySelector('small').textContent = loaded < total
      ? `Loading ${name ? name.replaceAll('_', ' ') : 'models'}… ${loaded} / ${total}`
      : 'Building the scene…';
  },

  onEnter() {
    const scene = game.sceneManager.getCurrentScene();
    const hero = scene.entitiesById.get('hero');
    game.player = hero;
    hero.footsteps = new Footsteps(game.soundManager);
    Object.assign(game.camera, {
      mode: 'orbit', distance: 8, yaw: 0.6, pitch: 0.36, minDistance: 3, maxDistance: 30,
      targetOffset: { x: 0, y: 0.4, z: 0 }, fov: Math.PI / 3.4
    });
    game.camera.follow(hero);
  },

  onShow() {
    document.getElementById('loading').classList.add('done');
    // A breath of wind under everything, faded in so the page does not open on a gust.
    const wind = game.soundManager.loop('wind', { volume: 0 });
    let level = 0;
    const fade = setInterval(() => { level = Math.min(1, level + 0.05); wind.setVolume(level); if (level >= 1) clearInterval(fade); }, 100);
    unsubscribe.push(() => { clearInterval(fade); wind.stop(); });
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
      x: 20, y: 16, anchor: 'top-left', text: SCENE === 'lot' ? 'THE LOT' : 'THE YARD', fontSize: '15px', letterSpacing: 2,
      color: 'rgba(255, 248, 236, 0.9)', outlineColor: 'rgba(0, 0, 0, 0.35)', outlineWidth: 2
    }));
    ui.add(new UIText({
      x: -20, y: -16, anchor: 'bottom-right', align: 'right',
      text: 'Drag orbits · Scroll zooms · WASD walks the fox · Space jumps · T dusk · O settings · F3 stats · ` console (noclip)',
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
    // Only what is brighter than the tonemapper's shoulder glows — the
    // sun, the lamps' heads, the neon — and more of it as dusk falls.
    frame.bloom = { threshold: lerp(1.1, 0.8, t), intensity: lerp(0.7, 1.1, t), scatter: 0.75 };
    frame.shadow.distance = 70;
    // The post stack: a touch of focus on the hero, a little grain and
    // vignette, and the exposure adapting as dusk falls.
    const camera = game.camera;
    // The lens focuses on the fox itself — the eye-to-hero distance, not
    // the orbit radius — so zooming, flying in noclip or the camera's own
    // follow smoothing never pull the playable character off the focal
    // plane. A 35 mm lens at f/6: wide depth of field, so the yard reads
    // sharp and only the genuinely far or near softens.
    const eye = camera.position;
    const heroAt = game.player?.body?.renderPosition ?? camera.lookAt;
    const focus = Math.hypot(heroAt.x - eye.x, heroAt.y - eye.y, heroAt.z - eye.z);
    frame.post.dof = { focus, focalLength: 35, fStop: 6, maxBlur: 12 };
    frame.post.autoExposure = { enabled: true, key: lerp(0.2, 0.12, t), min: 0.5, max: 3, speed: 1.2 };
    frame.post.vignette = 0.3;
    frame.post.grain = 0.025;
    frame.post.grade = { saturation: lerp(1.05, 1.15, t), contrast: 1.03, temperature: lerp(0.05, -0.1, t), lut: null };
  }
};

game.sceneManager.addScene('yard', yardScene);
game.sceneManager.addScene('lot', { ...yardScene, fetch: async () => (await import('./scenes/lot.json')).default });

// `?views=2`: a second live view of the same running scene — the
// multi-view path an editor's side viewports stand on. A
// picture-in-picture canvas slowly circles the hero on a camera of its
// own while the main view stays yours to orbit; one frame is assembled
// and shadowed for both, and each pays only its own main pass and post.
if (new URLSearchParams(location.search).get('views') === '2') {
  const pip = document.createElement('canvas');
  pip.width = 426;
  pip.height = 240;
  Object.assign(pip.style, {
    position: 'absolute', right: '16px', bottom: '16px',
    width: '426px', height: '240px',
    border: '1px solid rgba(255, 255, 255, 0.25)', borderRadius: '4px',
    // The main canvas keeps every pointer: a view is a camera, not a screen.
    pointerEvents: 'none'
  });
  document.querySelector('.stage').appendChild(pip);
  const view = game.addView(pip);
  view.camera.mode = 'free';
  let angle = 0;
  const circle = () => {
    if (!game.running) { requestAnimationFrame(circle); return; }
    angle += 0.003;
    const target = game.player?.position ?? { x: 0, y: 0, z: 0 };
    view.camera.position = { x: target.x + Math.cos(angle) * 14, y: 6, z: target.z + Math.sin(angle) * 14 };
    view.camera.lookAt = { x: target.x, y: 1, z: target.z };
    view.camera.update(0);
    requestAnimationFrame(circle);
  };
  circle();
}

loadAmbience(game.soundManager);
new SettingsMenu(game).addOption(audioOption(game));
game.start();
