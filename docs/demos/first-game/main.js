import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { Hero } from './hero.js';
import level1 from './level1.json';

export default async function start(canvas) {
  await initPhysics();

  const game = new M2D(canvas, {
    width: 1280, height: 720,
    worldWidth: 1280, worldHeight: 720,
    initialScene: 'level1',
    performanceStats: false
  });

  // Keep the camera inside the level while it follows the hero.
  game.camera.bounds = { left: 0, top: 0, right: 1280, bottom: 720 };

  game.registerActor('Hero', Hero);
  game.registerActor('Platform', Platform);

  game.sceneManager.addScene('level1', { fetch: async () => level1 });

  // Resolution, fullscreen, aspect mode and pause. Opens with O.
  new SettingsMenu(game);

  await game.start();
  return game;
}
