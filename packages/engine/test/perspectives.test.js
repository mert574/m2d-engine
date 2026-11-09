import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createCanvasElement, installWindowStub, displayCanvas, stubDocumentListeners } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { makeTestGame, makeBody } from './helpers/testGame.js';
import { M2D } from '../src/core/m2d.js';
import { Scene } from '../src/core/scene.js';
import { Camera } from '../src/core/camera.js';
import { Entity } from '../src/core/entity.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import * as mat from '../src/core/renderers/geometry/matrix.js';

/**
 * The infrastructure every perspective beyond side view and top-down
 * shares: a camera with zoom and rotation, draw order by zIndex and depth,
 * tile layers with parallax and culling, pseudo-z elevation, and the
 * footprint that splits a collider from its drawn frame. See the
 * Perspectives section of the roadmap.
 */

describe('camera transform', () => {
  it('is translate-only by default and matches the renderer matrix', () => {
    const camera = new Camera(800, 600);
    camera.x = 400;
    camera.y = 300;
    expect(camera.worldToScreen(400, 300)).toEqual({ x: 400, y: 300 });
    expect(camera.worldToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(mat.apply(camera.matrix, 100, 50)).toEqual([100, 50]);
  });

  it('zooms about the view centre', () => {
    const camera = new Camera(800, 600);
    camera.x = 400;
    camera.y = 300;
    camera.zoom = 2;
    expect(camera.worldToScreen(400, 300)).toEqual({ x: 400, y: 300 });
    const view = camera.worldToScreen(300, 250);
    expect(view.x).toBeCloseTo(200);
    expect(view.y).toBeCloseTo(200);
    const area = camera.getVisibleArea();
    expect(area.right - area.left).toBeCloseTo(400);
    expect(area.bottom - area.top).toBeCloseTo(300);
  });

  it('rotates the world the opposite way to the camera', () => {
    const camera = new Camera(800, 600);
    camera.x = 400;
    camera.y = 300;
    camera.rotation = Math.PI / 2;
    // A point to the right of the centre ends up above it.
    const view = camera.worldToScreen(500, 300);
    expect(view.x).toBeCloseTo(400);
    expect(view.y).toBeCloseTo(200);
  });

  it('inverts screenToWorld under zoom and rotation', () => {
    const camera = new Camera(800, 600);
    camera.x = 1234;
    camera.y = 567;
    camera.zoom = 1.7;
    camera.rotation = 0.4;
    const view = camera.worldToScreen(1000, 700);
    const back = camera.screenToWorld(view.x, view.y);
    expect(back.x).toBeCloseTo(1000, 6);
    expect(back.y).toBeCloseTo(700, 6);
  });

  it('grows the visible area to the rotated view\'s bounding box', () => {
    const camera = new Camera(800, 600);
    camera.rotation = Math.PI / 2;
    const { width, height } = camera.viewExtents();
    expect(width).toBeCloseTo(600);
    expect(height).toBeCloseTo(800);
    expect(camera.isVisible(-350, 0, 10, 10)).toBe(true);
  });

  it('clamps bounds against the zoomed view', () => {
    const camera = new Camera(800, 600);
    camera.bounds = { left: 0, top: 0, right: 1600, bottom: 1200 };
    camera.zoom = 2;
    camera.x = 0;
    camera.y = 0;
    camera.clampToBounds();
    // Half the view at zoom 2 is 200 by 150 in world units.
    expect(camera.x).toBe(200);
    expect(camera.y).toBe(150);
  });

  it('matrix.invert undoes a composed transform', () => {
    const m = mat.viewMatrix({ x: 50, y: 20, width: 300, height: 200, zoom: 3, rotation: 1.1 });
    const inverse = mat.invert(m);
    const [x, y] = mat.apply(inverse, ...mat.apply(m, 12, -7));
    expect(x).toBeCloseTo(12, 9);
    expect(y).toBeCloseTo(-7, 9);
    expect(mat.invert([0, 0, 0, 0, 1, 1])).toBeNull();
  });
});

describe('entity depth, elevation and frame', () => {
  let game;

  beforeEach(() => {
    game = makeTestGame();
  });

  it('defaults depth to the bottom edge of the body', () => {
    const entity = new Entity(makeBody(game, 100, 50, 40, 20), null, game);
    expect(entity.depth).toBe(60);
    entity.depth = 5;
    expect(entity.depth).toBe(5);
  });

  it('lifts the drawn position by the elevation without moving the body', () => {
    const entity = new Entity(makeBody(game, 100, 50, 40, 20, { bodyType: 'static' }), null, game);
    entity.elevation = 30;
    // A settled tick: the previous and current elevation agree, so there is
    // nothing to blend and the lift shows in full.
    entity.fixedUpdate(1 / 60);
    expect(entity.body.position.y).toBeCloseTo(50, 5);
    expect(entity.renderPosition.y).toBeCloseTo(20, 5);
    // Depth is the feet on the ground, not the sprite in the air.
    expect(entity.depth).toBeCloseTo(60, 5);
  });

  it('blends elevation between ticks like the position', () => {
    const entity = new Entity(makeBody(game, 100, 50, 40, 20), null, game);
    entity.fixedUpdate(1 / 60); // snapshots previous = 0
    entity.elevation = 40;
    const interpolation = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(game.physics), 'interpolation');
    Object.defineProperty(game.physics, 'interpolation', { value: 0.25, configurable: true });
    expect(entity.renderElevation).toBeCloseTo(10, 9);
    if (interpolation) Object.defineProperty(game.physics, 'interpolation', interpolation);
    else delete game.physics.interpolation;
  });

  it('takes its size and offset from body.frame', () => {
    const body = makeBody(game, 100, 90, 40, 20);
    body.frame = { width: 40, height: 100, offsetX: 0, offsetY: -40 };
    const entity = new Entity(body, null, game);
    expect(entity.size).toEqual({ x: 40, y: 100 });
    // The frame is centred 40 above the feet: its bottom is the body's bottom.
    expect(entity.renderPosition.y).toBe(50);
    expect(entity.depth).toBe(100);
    entity.draw();
    const rect = game.renderer.optionsFor('drawRect')[0];
    expect(rect).toMatchObject({ width: 40, height: 100 });
    expect(rect.y).toBeCloseTo(0, 5);
  });
});

describe('scene draw order and tile layers', () => {
  let game;

  beforeAll(stubDocumentListeners);

  beforeEach(() => {
    installWindowStub();
    game = new M2D(displayCanvas(800, 600), {
      width: 800, height: 600, worldWidth: 1600, worldHeight: 1200, renderer: new RecordingRenderer()
    });
    game.registerActor('Thing', Entity);
  });

  function sheet() {
    const s = new SpriteSheet({ width: 64, height: 64 }, 64, 64, game, 64, 64);
    s.define('default', 0, 0);
    return s;
  }

  function levelScene(config = {}) {
    return new Scene(game, { type: 'level', version: SCENE_VERSION, layers: [], prefabs: {}, ...config });
  }

  /** Draw the scene and return the drawn rect y positions, in call order. */
  function drawnRectYs(scene) {
    game.renderer.reset?.();
    game.renderer.calls.length = 0;
    scene.draw(0);
    return game.renderer.optionsFor('drawRect').map(o => o.y);
  }

  function addThing(x, y, w, h) {
    const entity = game.createEntity({ type: 'Thing', x, y, width: w, height: h });
    game.entities.add(entity);
    return entity;
  }

  it('draws entities lower on the ground last', () => {
    const scene = levelScene();
    scene.setupScene();
    addThing(100, 300, 20, 20); // bottom 310
    addThing(100, 100, 20, 20); // bottom 110
    addThing(100, 200, 20, 20); // bottom 210
    // Rect y is top-left: centre - 10.
    expect(drawnRectYs(scene)).toEqual([90, 190, 290]);
  });

  it('zIndex overrides depth', () => {
    const scene = levelScene();
    scene.setupScene();
    const low = addThing(100, 300, 20, 20);
    addThing(100, 100, 20, 20);
    low.zIndex = -5;
    expect(drawnRectYs(scene)).toEqual([290, 90]);
  });

  it('keeps insertion order when the scene asks for it', () => {
    const scene = levelScene({ world: { sort: 'insertion' } });
    scene.setupScene();
    addThing(100, 300, 20, 20);
    addThing(100, 100, 20, 20);
    expect(drawnRectYs(scene)).toEqual([290, 90]);
  });

  it('interleaves tile layers by zIndex', () => {
    const scene = levelScene();
    scene.setupScene();
    addThing(100, 100, 20, 20);
    const under = game.layers.constructLayer(sheet(), 1, 1, 64, { anim: 'default' });
    const over = game.layers.constructLayer(sheet(), 1, 1, 64, { anim: 'default' });
    game.layers.addLayer('floor', under, { zIndex: -1 });
    game.layers.addLayer('canopy', over, { zIndex: 3 });
    game.renderer.calls.length = 0;
    scene.draw(0);
    const order = game.renderer.sequence().filter(m => m === 'drawSprite' || m === 'drawRect');
    expect(order).toEqual(['drawSprite', 'drawRect', 'drawSprite']);
  });

  it('culls tiles outside the view', () => {
    const scene = levelScene();
    scene.setupScene();
    // 25 x 19 tiles of 64 cover the 1600 x 1200 world; the 800 x 600 view
    // with a one-tile margin sees at most 15 x 12 of them.
    const floor = game.layers.constructLayer(sheet(), 25, 19, 64, { anim: 'default' });
    game.layers.addLayer('floor', floor);
    game.camera.x = 400;
    game.camera.y = 300;
    game.renderer.calls.length = 0;
    scene.draw(0);
    const drawn = game.renderer.callsTo('drawSprite').length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThanOrEqual(15 * 12);
  });

  it('shifts a parallax layer by its share of the camera travel', () => {
    const scene = levelScene();
    scene.setupScene();
    const sky = game.layers.constructLayer(sheet(), 1, 1, 64, { anim: 'default' });
    game.layers.addLayer('sky', sky, { parallax: 0.5 });
    expect(sky.repeat).toBe(true);
    game.camera.x = 1000;
    game.camera.y = 0;
    game.renderer.calls.length = 0;
    scene.draw(0);
    const xs = game.renderer.optionsFor('drawSprite').map(o => o.x);
    // Every tile centre sits at 32 + 64k + 500: the layer moved half as far
    // as the camera.
    for (const x of xs) {
      expect(((x - 32 - 500) % 64 + 64) % 64).toBeCloseTo(0, 6);
    }
  });

  it('builds a footprint body under the drawn frame', () => {
    const entity = game.createEntity({ type: 'Thing', x: 100, y: 100, width: 40, height: 80, physics: { footprint: { height: 16 } } });
    expect(entity.body.size).toEqual({ x: 40, y: 16 });
    expect(entity.body.position.y).toBeCloseTo(132, 5); // feet: bottom of the 80-tall object
    expect(entity.size).toEqual({ x: 40, y: 80 });
    expect(entity.renderPosition.y).toBeCloseTo(100, 5); // the frame is where the object was placed
    expect(entity.depth).toBeCloseTo(140, 5);
  });

  it('applies object zIndex and tileLayers from scene JSON', async () => {
    const config = new SceneLoader(game).load({
      version: SCENE_VERSION, type: 'level', name: 't',
      assets: { spritesheets: { g: { url: 'g.png', frameWidth: 64, frameHeight: 64 } } },
      prefabs: { thing: { actor: 'Thing' } },
      layers: [{ objects: [{ id: 'thing', prefab: 'thing', x: 10, y: 10, zIndex: 7 }] }],
      tileLayers: [{ name: 'clouds', spritesheet: 'g', zIndex: 10, parallax: 1.2 }]
    });
    const scene = new Scene(game, config);
    scene.spriteSheets.set('g', sheet());
    scene.setupScene();
    await scene.setupLevelScene();
    const [entity] = game.entities;
    expect(entity.zIndex).toBe(7);
    const clouds = game.layers.getLayer('clouds');
    expect(clouds.zIndex).toBe(10);
    expect(clouds.parallax).toEqual({ x: 1.2, y: 1.2 });
  });
});

describe('scene loader perspective fields', () => {
  const loader = new SceneLoader(null);
  const base = {
    version: SCENE_VERSION, type: 'level', name: 't',
    assets: { spritesheets: { g: { url: 'g.png', frameWidth: 64, frameHeight: 64 } } },
    prefabs: { thing: { actor: 'Thing', physics: {} } }
  };

  it('rejects an unknown sort mode', () => {
    expect(() => loader.load({ ...base, world: { sort: 'random' } })).toThrow(/world\.sort/);
    expect(() => loader.load({ ...base, world: { sort: 'insertion' } })).not.toThrow();
  });

  it('validates footprints', () => {
    const withFootprint = (footprint) =>
      ({ ...base, prefabs: { thing: { actor: 'Thing', physics: { footprint } } } });
    expect(() => loader.load(withFootprint({ height: 12 }))).not.toThrow();
    expect(() => loader.load(withFootprint({ height: 0 }))).toThrow(/footprint\.height/);
    expect(() => loader.load(withFootprint({ height: 12, depth: 3 }))).toThrow(/unknown field 'depth'/);
  });

  it('validates tile layers', () => {
    const withLayers = (tileLayers) => ({ ...base, tileLayers });
    expect(() => loader.load(withLayers([{ name: 'a', spritesheet: 'g', parallax: { x: 0.5 } }]))).not.toThrow();
    expect(() => loader.load(withLayers([{ name: 'a', spritesheet: 'nope' }]))).toThrow(/spritesheet/);
    expect(() => loader.load(withLayers([{ name: 'a', spritesheet: 'g' }, { name: 'a', spritesheet: 'g' }])))
      .toThrow(/duplicate/);
    expect(() => loader.load(withLayers([{ name: 'a', spritesheet: 'g', parallax: 'far' }]))).toThrow(/parallax/);
    expect(() => loader.load({ ...base, background: { spritesheet: 'g' }, tileLayers: [{ name: 'background', spritesheet: 'g' }] }))
      .toThrow(/duplicate/);
  });

  it('validates object zIndex', () => {
    expect(() => loader.load({ ...base, layers: [{ objects: [{ id: 'thing', prefab: 'thing', x: 0, y: 0, zIndex: 'top' }] }] }))
      .toThrow(/zIndex/);
  });
});
