import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.ts';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { RecordingRenderer } from '../src/testing/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from '../src/testing/environment.js';
import { initPhysics } from '../src/core/physics/index.ts';

/**
 * The game's image cache: a level entered a second time draws the same
 * art without decoding it again, and two levels that share a sheet share
 * one decode. See core/imageCache.js for the invariants.
 */

/** Every image "decoded", counted, and ready on the next microtask. */
function countingImages() {
  const decoded = [];
  const Original = window.Image;
  window.Image = class {
    constructor() {
      this.width = 64;
      this.height = 64;
    }

    set src(url) {
      this._src = url;
      decoded.push(url);
      queueMicrotask(() => this.onload?.());
    }

    get src() {
      return this._src;
    }
  };
  return { decoded, restore: () => { window.Image = Original; } };
}

const sheet = { url: 'hero.png', frameWidth: 16, frameHeight: 16 };

const level = (name, assets, sheetKey = 'hero') => ({
  version: SCENE_VERSION, type: 'level', name,
  world: { width: 200, height: 200, gravity: { x: 0, y: 0 } },
  assets,
  prefabs: { box: { actor: 'Entity', spritesheet: sheetKey, physics: { bodyType: 'static' } } },
  layers: [{ name: 'main', objects: [{ id: 'box', prefab: 'box', x: 10, y: 10, width: 16, height: 16 }] }]
});

describe('the image cache', () => {
  let images;

  beforeAll(async () => {
    stubDocumentListeners();
    await initPhysics();
  });

  beforeEach(() => {
    installWindowStub();
    images = countingImages();
  });

  afterEach(() => images.restore());

  async function game(scenes) {
    const game = new M2D(displayCanvas(320, 180), {
      width: 320, height: 180, renderer: new RecordingRenderer(), devConsole: false, performanceStats: false,
      worldWidth: 200, worldHeight: 200, seed: 1
    });
    game.registerActor('Entity', Entity);
    for (const [name, data] of Object.entries(scenes)) game.sceneManager.addScene(name, { fetch: async () => data });
    return game;
  }

  it('decodes a level\'s art once however often the level is entered', async () => {
    const play = await game({ yard: level('yard', { spritesheets: { hero: sheet } }) });
    await play.sceneManager.switchTo('yard');
    expect(images.decoded).toEqual(['hero.png']);

    await play.sceneManager.switchTo('yard');
    await play.sceneManager.switchTo('yard');
    expect(images.decoded).toEqual(['hero.png']);

    // The sheet is rebuilt each time — its animations are the scene's —
    // over the one image.
    const scene = play.sceneManager.getCurrentScene();
    expect(scene.spriteSheets.get('hero').image).toBe(await play.imageCache.images.get('hero.png'));
    play.destroy();
  });

  it('shares one decode between two levels that name the same file', async () => {
    const play = await game({
      yard: level('yard', { spritesheets: { hero: sheet } }),
      lot: level('lot', { spritesheets: { walker: sheet } }, 'walker')
    });
    await play.sceneManager.switchTo('yard');
    await play.sceneManager.switchTo('lot');

    expect(images.decoded).toEqual(['hero.png']);
    expect(play.imageCache.decodes).toBe(1);
    play.destroy();
  });

  it('keeps nothing once the game is gone, and plain images are cached too', async () => {
    const play = await game({ yard: level('yard', { images: { sign: { url: 'sign.png' } }, spritesheets: { hero: sheet } }) });
    await play.sceneManager.switchTo('yard');
    expect(images.decoded.sort()).toEqual(['hero.png', 'sign.png']);
    await play.sceneManager.switchTo('yard');
    expect(images.decoded).toHaveLength(2);

    play.destroy();
    expect(play.imageCache.size).toBe(0);
  });

  it('forgets a failed load, so the next entry tries again', async () => {
    window.Image = class {
      set src(url) {
        this._src = url;
        queueMicrotask(() => this.onerror?.(new Error('404')));
      }
    };
    const play = await game({ yard: level('yard', { spritesheets: { hero: sheet } }) });
    await expect(play.sceneManager.switchTo('yard')).rejects.toBeTruthy();
    expect(play.imageCache.size).toBe(0);
    play.destroy();
  });
});
