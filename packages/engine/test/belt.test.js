import { describe, it, expect } from 'vitest';
import { makeTestGame } from './helpers/testGame.js';
import { Projection } from '../src/core/projection.js';
import { Camera } from '../src/core/camera.js';
import { LayerManager } from '../src/core/layerManager.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { SceneLoader } from '../src/core/sceneLoader.js';

/**
 * The belt scroller and the small camera modes: a depth lane compressed on
 * screen, an auto-scrolling camera, a room-snapping camera, a follow that
 * locks an axis, and a flat texture stretched into a projected tile.
 */
describe('belt projection', () => {
  it('compresses depth and leaves x alone', () => {
    const belt = Projection.belt({ ratio: 0.5 });
    expect(belt.toScreen(100, 200)).toEqual({ x: 100, y: 100 });
    expect(belt.toWorld(100, 100)).toEqual({ x: 100, y: 200 });
    expect(belt.screenAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(belt.groundSpeedScale(0, 1)).toBeCloseTo(2);
    expect(Projection.fromConfig({ type: 'belt', ratio: 0.4 }).toScreen(0, 10).y).toBeCloseTo(4);
  });
});

describe('camera modes', () => {
  it('scrolls on its own in scroll mode', () => {
    const camera = new Camera(800, 600, { mode: 'scroll', scrollVelocity: { x: 120, y: 0 } });
    camera.update(0.5);
    expect(camera.x).toBeCloseTo(60);
    camera.bounds = { left: 0, top: 0, right: 1000, bottom: 600 };
    camera.update(100);
    expect(camera.x).toBe(600);
  });

  it('snaps to the target room in rooms mode', () => {
    const camera = new Camera(800, 600, { mode: 'rooms', lerp: 1 });
    camera.follow({ body: { renderPosition: { x: 1700, y: 100 } } });
    camera.update(1 / 60);
    expect(camera.x).toBe(2 * 800 + 400);
    expect(camera.y).toBe(300);
  });

  it('locks an axis the follow leaves alone', () => {
    const camera = new Camera(800, 600, { lerp: 1, followAxes: { x: true, y: false } });
    camera.y = 220;
    camera.follow({ body: { renderPosition: { x: 500, y: 900 } } });
    camera.update(1 / 60);
    expect(camera.x).toBe(500);
    expect(camera.y).toBe(220);
  });
});

describe('stretched projected tiles', () => {
  it('draws a flat texture at the tile\'s projected box', () => {
    const game = makeTestGame();
    game.projection = Projection.belt({ ratio: 0.5 });
    const layers = new LayerManager();
    layers.setGame(game);
    const sheet = new SpriteSheet({ width: 512, height: 512 }, 512, 512, game);
    sheet.define('paving', 0, 0);
    const layer = layers.constructLayer(sheet, 4, 2, 200, { anim: 'paving' });
    layers.addLayer('street', layer, { stretch: true });
    game.camera.x = 400;
    game.camera.y = 100;
    layers.drawOne(layer);
    const drawn = game.renderer.optionsFor('drawSprite');
    expect(drawn.length).toBe(8);
    expect(drawn[0]).toMatchObject({ width: 200, height: 100 });
  });

  it('is validated by the loader', () => {
    const loader = new SceneLoader(null);
    const base = { version: 1, type: 'level', name: 't', assets: { spritesheets: { p: { url: 'p.jpg', frameWidth: 512, frameHeight: 512 } } } };
    expect(() => loader.load({ ...base, world: { projection: 'belt' }, tileLayers: [{ name: 's', spritesheet: 'p', tileSize: 200, stretch: true }] })).not.toThrow();
    expect(() => loader.load({ ...base, tileLayers: [{ name: 's', spritesheet: 'p', stretch: 'yes' }] })).toThrow(/stretch/);
  });
});
