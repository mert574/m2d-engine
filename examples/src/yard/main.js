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
 * The page opens on a menu that offers both scenes. `?scene=lot` opens the
 * lot straight away: the corner of a small town where
 * two roads cross, laid out as a place by `scripts/buildLotScene.mjs` —
 * corner shops with the milk truck delivering, a terrace with its
 * gardens, a works depot, a park with a plaza, allotments, woodland with
 * a ruin, and meadow — thousands of props drawn as resident instances
 * the GPU culls and streams. F3 shows what the frame draws.
 */

const canvas = document.getElementById('screen');
import { bootProject } from 'm2d-engine';
import { audioOption } from 'm2d-kit/audio';
import project from './m2d.project.json';
import * as definition from './game.js';

const unsupported = document.getElementById('unsupported');
const query = new URLSearchParams(location.search);

/** The loading plate, the page's own: it fills while a scene's models arrive and lifts when it shows. */
function loadingPlate(scene) {
  const plate = document.getElementById('loading');
  const shown = scene.onShow;
  scene.onLoadProgress = ({ loaded, total, name: model }) => {
    // The menu comes first and loads nothing; the plate returns for the lot.
    plate.classList.remove('done');
    plate.querySelector('.bar span').style.width = `${total ? (loaded / total) * 100 : 0}%`;
    plate.querySelector('small').textContent = loaded < total
      ? `Loading ${model ? model.replaceAll('_', ' ') : 'models'}… ${loaded} / ${total}`
      : 'Building the scene…';
  };
  scene.onShow = () => {
    plate.classList.add('done');
    shown?.();
  };
}

/**
 * `?views=2`: a second live view of the same running scene, the multi-view
 * path an editor's side viewports stand on. A picture-in-picture canvas
 * slowly circles the hero on a camera of its own while the main view
 * stays yours to orbit; one frame is assembled and shadowed for both, and
 * each pays only its own main pass and post.
 */
function pictureInPicture(game) {
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
    if (game.running) {
      angle += 0.003;
      const target = game.player?.position ?? { x: 0, y: 0, z: 0 };
      view.camera.position = { x: target.x + Math.cos(angle) * 14, y: 6, z: target.z + Math.sin(angle) * 14 };
      view.camera.lookAt = { x: target.x, y: 1, z: target.z };
      view.camera.update(0);
    }
    requestAnimationFrame(circle);
  };
  circle();
}

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  basePath: import.meta.env.BASE_URL + 'yard/',
  options: {
    // The published site ships the lot's models at the default quality
    // levels only; the dev server builds every level, and offers them.
    offerQuality: import.meta.env.DEV,
    // `?scene=lot` opens the lot instead of the yard.
    ...(query.get('scene') === 'lot' && { initialScene: 'lot' })
  },
  setup(game) {
    for (const { scene } of game.sceneManager.scenesToLoad) loadingPlate(scene);
    game.settings.addOption(audioOption(game));
    if (query.get('views') === '2') pictureInPicture(game);
  }
}).catch((error) => {
  unsupported.textContent = error.message;
  unsupported.style.display = 'flex';
  throw error;
});
