import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { M2D, projectOptions } from 'm2d-engine';
import { initPhysics } from 'm2d-engine/physics';
import {
  RecordingRenderer,
  displayCanvas,
  installWindowStub,
  stubDocumentListeners
} from 'm2d-engine/testing';
import { extentOf } from './drawExtent.js';

/**
 * What every entity in a shipped level promises the view cull.
 *
 * `drawBounds` says where an entity's drawing is (core/viewCull.js), and
 * the engine skips the entity when that box is off screen. The promise is
 * therefore that the box contains the drawing: an actor that paints the
 * view, or along a path, or anywhere else off its body, has to say so by
 * returning `null`, or it vanishes the moment its body leaves the screen.
 *
 * So each entity is drawn by hand into a recording renderer, the world box
 * of what it submitted is measured through its own transforms, and that
 * box has to sit inside the bounds it declared (grown by the camera's
 * padding, which is the room the engine leaves for a bar or a readout
 * above a body). Ember Valley's sky, the facility's floor marks, the
 * garden's and the workshop's backdrops and Night Circuit's ghost car were
 * all found this way: each an actor whose body is a marker in the corner
 * of a level it paints from end to end.
 */

installWindowStub();
stubDocumentListeners();

// Sounds are loaded the moment a scene with audio opens; nothing here
// plays one, so an element that answers the manager's calls is enough.
globalThis.Audio = class {
  play() { return Promise.resolve(); }
  pause() {}
  cloneNode() { return new globalThis.Audio(); }
  addEventListener() {}
};

// The scenes name real art. Nothing here looks at a pixel, so an image is
// a decoded stand-in: what matters is that a sprite has a size, so the
// actors that draw one take the same path they take in a browser. Big
// enough to hold a frame of every sheet the games declare, or the
// engine's tile-cell check would refuse the scene.
window.Image = class {
  width = 2048;
  height = 2048;
  set src(url) { this._src = url; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
};

const SRC = join(import.meta.dirname, '..', 'src');

/** Every shipped project, with the walkthrough under docs. */
function projects() {
  const folders = readdirSync(SRC)
    .filter((name) => existsSync(join(SRC, name, 'm2d.project.json')))
    .map((name) => ({ name, root: join(SRC, name) }));
  const walkthrough = join(import.meta.dirname, '..', '..', 'docs', 'demos', 'first-game');
  if (existsSync(join(walkthrough, 'm2d.project.json'))) folders.push({ name: 'first-game', root: walkthrough });
  return folders;
}

/** A displayed game of the project at `root`, recording what it draws; null for a 3D game. */
async function displayed(root) {
  const config = JSON.parse(readFileSync(join(root, 'm2d.project.json'), 'utf8'));
  const definition = await import(join(root, config.definition));
  const options = definition.GAME ?? {};
  if (options.dimensions === 3) return null;
  await initPhysics();
  const renderer = new RecordingRenderer();
  const game = new M2D(displayCanvas(640, 360), {
    ...options, ...projectOptions(config),
    width: 640, height: 360, renderer, devConsole: false, performanceStats: false
  });
  definition.register(game);
  return { game, renderer, sceneDir: join(root, config.scenes ?? 'scenes') };
}

/** The 2D levels a project ships. */
function levels(sceneDir) {
  return readdirSync(sceneDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(sceneDir, file), 'utf8')))
    .filter((data) => data.type === 'level' && data.world?.dimensions !== 3);
}

describe('what the shipped levels promise the view cull', () => {
  for (const { name, root } of projects()) {
    it(`${name}: every entity that claims a footprint draws inside it`, async () => {
      const made = await displayed(root);
      if (!made) return; // A 3D game culls on the GPU, against the real frustum.
      const { game, renderer, sceneDir } = made;
      const scenes = levels(sceneDir);
      for (const data of scenes) game.sceneManager.addScene(data.name, { fetch: async () => data });

      const unbounded = [];
      for (const data of scenes) {
        await game.sceneManager.switchTo(data.name);
        for (const entity of game.entities) {
          const bounds = entity.drawBounds;
          if (bounds === null) continue; // Says it paints beyond its body.
          renderer.reset();
          game.worldOverlay.clear();
          entity.draw(1 / 60);
          const ink = extentOf(renderer.calls);
          if (!ink) continue;
          const pad = game.camera.padding;
          const outside = ink.left < bounds.x - pad.x || ink.right > bounds.x + bounds.width + pad.x
            || ink.top < bounds.y - pad.y || ink.bottom > bounds.y + bounds.height + pad.y;
          if (!outside) continue;
          const where = `${Math.round(ink.left)},${Math.round(ink.top)}..${Math.round(ink.right)},${Math.round(ink.bottom)}`;
          const says = `${Math.round(bounds.x)},${Math.round(bounds.y)}..${Math.round(bounds.x + bounds.width)},${Math.round(bounds.y + bounds.height)}`;
          unbounded.push(`${data.name}: ${entity.constructor.name}${entity.sceneId ? ` (${entity.sceneId})` : ''} draws ${where} but says ${says}`);
        }
      }

      expect(unbounded, 'these actors draw beyond their body and must say so with `get drawBounds() { return null; }`').toEqual([]);
      game.destroy();
    }, 60000);
  }
});
