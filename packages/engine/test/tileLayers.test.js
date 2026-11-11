import { describe, it, expect } from 'vitest';
import { Scene } from '../src/core/scene.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { LayerManager } from '../src/core/layerManager.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { M2D } from '../src/core/m2d.js';

/**
 * Tile layers with per-cell frames (E8): a two-entry cell draws the
 * layer's own `tileX, tileY` as it always did; a four-entry cell picks
 * its frame on the sheet. `rebuildTileLayers` builds the background and
 * every layer again from the config without a game rebuild — the editor's
 * paint path.
 */

function fakeGame() {
  const layers = new LayerManager();
  const game = {
    headless: false, editMode: true,
    options: { worldWidth: 64, worldHeight: 48, basePath: '' },
    layers, projection: null,
    physics: { dimensions: 2 },
    invalidate: () => {}
  };
  layers.setGame(game);
  return game;
}

function sceneWith(config) {
  const game = fakeGame();
  const scene = new Scene(game, config);
  scene.spriteSheets.set('ground', new SpriteSheet({ width: 64, height: 64 }, 16, 16, game));
  return { game, scene };
}

describe('per-cell tile frames', () => {
  const config = {
    type: 'level', name: 't',
    assets: { spritesheets: { ground: { frameWidth: 16, frameHeight: 16 } } },
    tileLayers: [{ name: 'paint', spritesheet: 'ground', tileX: 1, tileY: 0, cells: [[0, 0], [1, 0, 2, 1]] }],
    layers: []
  };

  it('a four-entry cell picks its own frame; a two-entry one draws the layer\'s', () => {
    const { game, scene } = sceneWith(structuredClone(config));
    scene.setupTileLayer(scene.config.tileLayers[0]);
    const layer = game.layers.getLayer('paint');
    // The grid is 4x3 (64/16 by 48/16); tiles index as column * rows + row.
    expect(layer.tiles[0].anim).toBe('tileLayer:paint');
    expect(layer.tiles[1 * 3 + 0].anim).toBe('tileLayer:paint:2,1');
    expect(layer.tiles[2 * 3 + 2]).toBeNull();
    const frame = layer.sprite.animations.get('tileLayer:paint:2,1');
    expect(frame).toBeTruthy();
  });

  it('rebuildTileLayers rebuilds the painted layer from the config in place', () => {
    const { game, scene } = sceneWith(structuredClone(config));
    scene.setupTileLayer(scene.config.tileLayers[0]);
    scene.config.tileLayers[0].cells = [[1, 1, 3, 0]];
    scene.rebuildTileLayers();
    const layer = game.layers.getLayer('paint');
    expect(layer.tiles[0]).toBeNull();
    expect(layer.tiles[1 * 3 + 1].anim).toBe('tileLayer:paint:3,0');
  });

  it('is edit-mode only', () => {
    const { scene } = sceneWith({ ...structuredClone(config) });
    scene.game.editMode = false;
    expect(() => scene.rebuildTileLayers()).toThrow(/edit-mode/);
  });
});

describe('the loader takes both cell forms', () => {
  it('accepts [c, r] and [c, r, tx, ty], refuses anything else', () => {
    const game = new M2D(null, { headless: true, worldWidth: 64, worldHeight: 48, seed: 1 });
    const loader = new SceneLoader(game);
    const level = (cells) => ({
      version: SCENE_VERSION, type: 'level', name: 't',
      assets: { spritesheets: { ground: { url: 'g.png', frameWidth: 16, frameHeight: 16 } } },
      tileLayers: [{ name: 'paint', spritesheet: 'ground', cells }],
      layers: [{ name: 'main', objects: [] }]
    });
    expect(() => loader.load(level([[0, 0], [1, 2, 3, 0]]))).not.toThrow();
    expect(() => loader.load(level([[0, 0, 1]]))).toThrow(/column, row/);
    expect(() => loader.load(level([[0, 0.5]]))).toThrow(/integer/);
  });
});
