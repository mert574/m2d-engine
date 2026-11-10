import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import { GAME, register } from './game.js';
import { sceneHooks } from './hooks.js';
import level from './scenes/level.json';

// The page: a canvas, the game's definition, its scenes with their hooks.
if (!webgpuSupported()) {
  document.body.textContent = 'This game is 3D and needs WebGPU: Chrome or Edge with a GPU.';
} else {
  await Promise.all([initWebGPU(), initPhysics({ dimensions: 3 })]);
  const game = new M2D(document.getElementById('screen'), {
    ...GAME,
    width: 1280,
    height: 720,
    initialScene: 'level',
    performanceStats: false
  });
  register(game);
  const hooks = sceneHooks(game);
  game.sceneManager.addScene('level', { fetch: async () => level, ...hooks.level });
  await game.start();
}
